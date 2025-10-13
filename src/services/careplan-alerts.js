import mongoose from 'mongoose';

import {
  Careplan,
  CareplanResponse as Response,
  CareplanAlerts as Alerts,
} from '../db';
import socketManager from '../services/socket-manager';
import SOCKET_EVENTS from '../services/socket-manager/constants';

const getPastResponses = async (careplan, measure, subType, alerts) => {
  const elemMatchConditions = {
    measure,
  };
  if (subType) {
    elemMatchConditions['response.type'] = subType;
  }
  const alertElemMatch = { ...elemMatchConditions };
  if (alerts.triggerType?.toLowerCase() === 'total') {
    alertElemMatch.alertsTriggered = true;
  } else {
    alertElemMatch['$or'] = [{ isPositive: true }, { alertsTriggered: true }];
  }
  const lastAlertResponse = await Response.findOne({
    careplan: careplan._id,
    user: careplan.user._id,
    responses: {
      $elemMatch: alertElemMatch,
    },
  }).sort({
    date: -1,
  });
  let lastAlertTime;
  if (!!lastAlertResponse) {
    lastAlertResponse.responses.forEach((response) => {
      if (response.measure !== measure) {
        return;
      }
      if (subType && response.response.type !== subType) {
        return;
      }
      if (
        alerts.triggerType?.toLowerCase() === 'total' &&
        !response.alertsTriggered
      ) {
        return;
      }
      if (
        alerts.triggerType?.toLowerCase() === 'consecutive' &&
        !response.isPositive &&
        !response.alertsTriggered
      ) {
        return;
      }
      if (!lastAlertTime || lastAlertTime.getTime() < response.time.getTime()) {
        lastAlertTime = response.time;
      }
    });
  }

  if (lastAlertTime) {
    elemMatchConditions.time = {
      $gt: lastAlertTime,
    };
  }
  const pastResponses = await Response.find({
    careplan: careplan._id,
    user: careplan.user._id,
    responses: { $elemMatch: elemMatchConditions },
  });
  return {
    lastTime: lastAlertTime,
    responses: pastResponses,
  };
};

const checkPastDataForAlerts = async (
  careplan,
  checkTime,
  responses,
  measure,
  subType,
  alerts,
  providerIds
) => {
  let negativeCount = 0;
  for (let response of responses) {
    for (let subResponse of response.responses) {
      if (subResponse.measure !== measure) {
        continue;
      }
      if (!!subType && subResponse.response?.type !== subType) {
        continue;
      }
      if (!!checkTime && subResponse.time.getTime() <= checkTime.getTime()) {
        continue;
      }
      if (subResponse.isPositive === false) {
        negativeCount++;
        if (negativeCount === alerts.triggerValue) {
          subResponse.alertsTriggered = true;
          const session = await mongoose.startSession();
          await session.withTransaction(async () => {
            await Response.findOneAndUpdate(
              { _id: response._id },
              {
                responses: response.responses,
              },
              { session }
            );
            const alertsData = {
              user: careplan.user._id,
              careplan: careplan._id,
              providers: providerIds,
              measure: measure,
              triggerTime: subResponse.time,
              alerts,
            };
            if (subType) {
              alertsData.subType = subType;
            }
            await Alerts.create([alertsData]);
          });
          session.endSession();
          socketManager.sendMessage(
            careplan.user._id,
            SOCKET_EVENTS.ALERTS_UPDATE
          );
          socketManager.notifyUsers(providerIds, SOCKET_EVENTS.ALERTS_UPDATE);
          return;
        }
      }
    }
  }
};

const addWeightAlerts = async (careplan, alerts, providerIds) => {
  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    const alertsData = {
      user: careplan.user._id,
      careplan: careplan._id,
      providers: providerIds,
      measure: 'vital',
      subType: 'weight',
      alerts,
      triggerTime: new Date(),
    };
    await Alerts.create([alertsData]);
  });
  session.endSession();
  socketManager.sendMessage(careplan.user._id, SOCKET_EVENTS.ALERTS_UPDATE);
  socketManager.notifyUsers(providerIds, SOCKET_EVENTS.ALERTS_UPDATE);
};

export const checkAlerts = async (
  careplanId,
  userResponse,
  progressChanges
) => {
  const careplan = await Careplan.findById(careplanId).populate('user');
  if (!careplan) {
    return;
  }
  const measureType = userResponse.measure;
  const measureContent = careplan.content[measureType];
  if (!(careplan.content.careTeam?.length > 0)) {
    return;
  }
  const careTeamIds = careplan.content.careTeam.map((member) => member.user);
  if (
    measureType === 'vital' ||
    measureType === 'wellness' ||
    measureType === 'diet'
  ) {
    Object.keys(progressChanges).forEach(async (subType) => {
      const subTypeAlerts = measureContent[subType].alerts;
      if (!subTypeAlerts) {
        return;
      }
      if (subType === 'weight') {
        if (
          progressChanges[subType].value < 0 ||
          (progressChanges[subType].count === 1 &&
            progressChanges[subType].value === 0)
        ) {
          await addWeightAlerts(careplan, subTypeAlerts, careTeamIds);
        }
      } else {
        const pastData = await getPastResponses(
          careplan,
          measureType,
          subType,
          subTypeAlerts
        );
        await checkPastDataForAlerts(
          careplan,
          pastData.lastTime,
          pastData.responses,
          measureType,
          subType,
          subTypeAlerts,
          careTeamIds
        );
      }
    });
  } else {
    let measureAlerts;
    if (measureType === 'medication') {
      if (Object.values(measureContent).length > 0) {
        measureAlerts = Object.values(measureContent)[0].alerts;
      }
    } else {
      measureAlerts = measureContent.alerts;
    }
    if (!measureAlerts || Object.keys(measureAlerts) === 0) {
      return;
    }
    const pastData = await getPastResponses(
      careplan,
      measureType,
      null,
      measureAlerts
    );
    await checkPastDataForAlerts(
      careplan,
      pastData.lastTime,
      pastData.responses,
      measureType,
      null,
      measureAlerts,
      careTeamIds
    );
  }
};
