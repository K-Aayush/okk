import mongoose from 'mongoose';
import { Careplan, CareplanResponse, PatientPractice, User } from '../db';
import {
  getActiveCareplan,
  getDailyResponse,
  updateMeasureResponse,
  updateProgressChanges,
} from '../services/careplan';
import { checkAlerts } from '../services/careplan-alerts';
import { getStartDate } from '../utils/time';

export default [
  {
    key: 'addResponse',
    prototype:
      '(patient: ID, date: Date, response: CareplanResponseInput!): CareplanResponse',
    mutation: true,
    run: async (
      { patient: patientId, date, response: userResponse },
      { user }
    ) => {
      const userId = user.role === 'provider' ? patientId : user._id;
      const patient =
        user.role === 'provider' ? await User.findById(userId) : user;
      const careplan = await getActiveCareplan(userId);
      if (!careplan) {
        throw new Error('No active careplan');
      }

      const patientRecord = await PatientPractice.findOne({
        user: userId,
      });
      const progress = patientRecord.progress || {};

      const session = await mongoose.startSession();

      let progressChanges;

      await session.withTransaction(async () => {
        const response = await getDailyResponse(
          patient,
          date,
          careplan,
          session
        );
        const responseContent = response.responses;
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
      return await CareplanResponse.findOne({
        user: userId,
        date,
        careplan: careplan._id,
      });
    },
  },
  {
    key: 'todayResponse',
    prototype: '(patient: ID, date: Date): CareplanResponse',
    run: async ({ patient: patientId, date }, { user }) => {
      const userId = user.role === 'provider' ? patientId : user._id;
      const patient =
        user.role === 'provider' ? await User.findById(userId) : user;
      const careplan = await getActiveCareplan(userId);
      if (!careplan) {
        return null;
      }
      let response;

      const session = await mongoose.startSession();

      await session.withTransaction(async () => {
        response = await getDailyResponse(patient, date, careplan, session);
      });

      session.endSession();
      return response;
    },
  },
  {
    key: 'patientResponses',
    prototype: '(patient: ID, from: Date, to: Date): CareplanResponses!',
    run: async ({ patient, from, to }, { user }) => {
      const userId = user.role === 'provider' ? patient : user._id;
      const startDate = from || getStartDate('y');
      const endDate = to || new Date();

      const careplanIds = await CareplanResponse.distinct('careplan', {
        user: userId,
        date: { $gt: startDate, $lt: endDate },
      });

      const careplans =
        careplanIds?.length > 0
          ? await Careplan.find({ _id: { $in: careplanIds } }).populate([
              'user',
              {
                path: 'creator',
                populate: ['practice', 'user'],
              },
              {
                path: 'content.careTeam.user',
              },
              {
                path: 'shares.by',
                populate: ['practice', 'user'],
              },
            ])
          : [];

      const responses = await CareplanResponse.find({
        user: userId,
        date: { $gt: startDate, $lt: endDate },
      })
        .sort({ date: -1 })
        .lean();
      return { responses, careplans };
    },
  },
  {
    key: 'patientProgress',
    prototype: '(patient: ID): Progress',
    run: async ({ patient }, { user }) => {
      const userId = user.role === 'provider' ? patient : user._id;
      const patientRecord = await PatientPractice.findOne({
        user: userId,
      }).lean();
      if (!patientRecord) {
        return null;
      }
      const progress = patientRecord.progress;
      if (!progress) {
        return null;
      }
      const progressValues = Object.assign(progress, { period: 'all' });
      return progressValues;
    },
  },
];
