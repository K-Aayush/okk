import mongoose from 'mongoose';
import { CareplanResponse, Device, PatientPractice } from '../../db';
import {
  getActiveCareplan,
  getDailyResponse,
  updateMeasureResponse,
  updateProgressChanges,
} from '../../services/careplan';
import { checkAlerts } from '../../services/careplan-alerts';
import socketManager from '../../services/socket-manager';
import SOCKET_EVENTS from '../../services/socket-manager/constants';
import { checkValidCareplanTime, toLocalTime, toGMT } from '../../utils/time';
import moment from 'moment';

class DevicesController {
  async scale(request, response) {
    try {
      const { body } = request;
      await this._processDevicePayload('scale', body, response);
    } catch (error) {
      console.error(error);
      response.status(400).send({ error });
    }
  }

  async bpm(request, response) {
    try {
      const { body } = request;
      await this._processDevicePayload('bpm', body, response);
    } catch (error) {
      console.error(error?.toString());
      response.status(400).send({ error: error?.toString() });
    }
  }

  async _processDevicePayload(deviceType, body, res) {
    let payload;
    const deviceId = body.imei;
    if (!deviceId) {
      throw new Error('Invalid data');
    }
    switch (deviceType) {
      case 'bpm':
        const { sys, dia, pul } = body;
        if (!sys || !dia || !pul) {
          throw new Error('Invalid data');
        }
        payload = {
          type: 'bloodPressure',
          bloodPressure: parseInt(sys, 10),
          bloodPressure2: parseInt(dia, 10),
          heartRate: parseInt(pul, 10),
        };
        break;
      case 'scale':
        const { weight } = body;
        if (!weight) {
          throw new Error('Invalid data');
        }
        payload = {
          type: 'weight',
          weight: Math.floor(parseFloat(weight, 10) / 4.53592) / 100.0,
        };
        break;
    }

    const device = await this._findDevice(deviceId);
    const patient = device?.user;
    if (!device || !patient) {
      return res.send({ message: 'Unregistered device' });
    }
    const userId = patient._id;
    const careplan = await getActiveCareplan(userId);
    if (!careplan) {
      return res.send({ message: 'No active careplan' });
    }

    const patientRecord = await PatientPractice.findOne({
      user: patient._id,
    });
    const progress = patientRecord.progress || {};

    const session = await mongoose.startSession();

    const patientTzOffset = patient.timezoneOffset || -300;
    const userTZOffsetMoment = moment().utcOffset(patientTzOffset);
    const date = toGMT(userTZOffsetMoment, true, true).toDate();
    const checkValidTime = checkValidCareplanTime(
      new Date(),
      careplan,
      patientTzOffset,
      true
    );
    if (checkValidTime === -1) {
      return res.send({ message: 'Active careplan is not due' });
    }
    if (checkValidCareplanTime === 0) {
      return res.send({ message: 'Active careplan is expired' });
    }

    let progressChanges, userResponse;

    await session.withTransaction(async () => {
      const response = await getDailyResponse(patient, date, careplan, session);
      const responseContent = response.responses;
      userResponse = await this._generateUserResponse(
        payload,
        responseContent,
        patientTzOffset
      );
      if (!userResponse) {
        return res.send({
          message: `Current careplan does not have ${deviceType} vital measure.`,
        });
      }
      progressChanges = await updateMeasureResponse(
        responseContent,
        userResponse,
        careplan
      );
      await CareplanResponse.findOneAndUpdate(
        { _id: response._id },
        { responses: responseContent },
        { session }
      );
      updateProgressChanges(progress, progressChanges, userResponse.measure);
      await PatientPractice.findOneAndUpdate(
        {
          _id: patientRecord._id,
        },
        {
          progress,
        },
        { session }
      );
    });

    session.endSession();

    checkAlerts(careplan._id, userResponse, progressChanges);

    socketManager.sendMessage(patient, SOCKET_EVENTS.DEVICE_INPUTS_UPDATE);

    return res.send({ message: 'Device data successfully added.' });
  }

  async _findDevice(deviceId) {
    return await Device.findOne({ deviceId }).populate('user');
  }

  async _generateUserResponse(payload, responseContent, offset) {
    let userResponse = null;
    let checkedItemTimestamp = null;
    const nowTimestamp = new Date().getTime();
    for (let item of responseContent) {
      if (
        item.measure !== 'vital' ||
        !(
          (payload.type === 'bloodPressure' &&
            item.response.type === 'heartRate') ||
          payload.type === item.response.type
        )
      ) {
        continue;
      }
      const itemTimestamp = toLocalTime(item.time, 'object', offset)
        .toDate()
        .getTime();
      if (
        itemTimestamp > nowTimestamp ||
        (!!checkedItemTimestamp && checkedItemTimestamp > itemTimestamp)
      ) {
        continue;
      }
      checkedItemTimestamp = itemTimestamp;
      userResponse = {
        measure: 'vital',
        time: item.time,
        response: payload,
      };
    }
    return userResponse;
  }
}

export default new DevicesController();
