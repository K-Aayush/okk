import mongoose from 'mongoose';
import { Careplan, PatientPractice, User } from '../db';
import {
  checkDateForPeriod,
  formatTitleAndName,
  getNotificationInfo,
  buildPracticeUrlForUser,
} from '../utils';
import socketManager from '../services/socket-manager';
import SOCKET_EVENTS from '../services/socket-manager/constants';
import { getChatRoom, sendChat } from '../services/chat';
import { sendCareplanCreatedSMS } from '../services/twilio';
import { sendCareplanCreatedEmail } from '../services/mailer';
import {
  getNextCareplanTaskScheduleTime,
  addFollowupAppointments,
} from '../services/careplan';
import CareplanTaskReminderJob from '../backgroundJobs/careplans/jobs/taskReminder';

const populateCareplanQuery = (result) => {
  return result.populate([
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
  ]);
};

const queryPatientCareplans = async (conditions, user, limit) => {
  const aggregate = [
    {
      $match: conditions,
    },
    { $project: { shares: 0 } },
    {
      $addFields: {
        isSeen: {
          $cond: [{ $in: [user._id, { $ifNull: ['$seen', []] }] }, true, false],
        },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    {
      $lookup: {
        from: 'providerpractices',
        let: { creatorId: '$creator' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$creatorId'] } } },
          {
            $lookup: {
              from: 'practices',
              let: { practiceId: '$practice' },
              pipeline: [
                {
                  $match: { $expr: { $eq: ['$_id', '$$practiceId'] } },
                },
              ],
              as: 'practice',
            },
          },
          { $unwind: '$practice' },
          {
            $lookup: {
              from: 'users',
              let: { userId: '$user' },
              pipeline: [
                {
                  $match: { $expr: { $eq: ['$_id', '$$userId'] } },
                },
              ],
              as: 'user',
            },
          },
          { $unwind: '$user' },
        ],
        as: 'creator',
      },
    },
    { $unwind: '$creator' },
    {
      $sort: { signDate: -1, updatedAt: -1 },
    },
  ];
  if (limit) {
    aggregate.push({ $limit: limit });
  }
  const result = await Careplan.aggregate(aggregate);
  await Careplan.populate(result, ['content.careTeam.user']);
  if (limit === 1) {
    if (!result || result.length === 0) {
      return null;
    }
    return result[0];
  }
  return result || [];
};

const queryProviderCareplans = async (conditions, user, limit) => {
  const aggregate = [
    {
      $match: conditions,
    },
    {
      $addFields: {
        isSeen: {
          $cond: [{ $in: [user._id, { $ifNull: ['$seen', []] }] }, true, false],
        },
      },
    },
    {
      $addFields: {
        shares: {
          $filter: {
            input: '$shares',
            as: 'share',
            cond: {
              $eq: [
                '$$share.with',
                user.activeProviderPractice?._id || user.activeProviderPractice,
              ],
            },
          },
        },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    {
      $lookup: {
        from: 'providerpractices',
        let: { creatorId: '$creator' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$creatorId'] } } },
          {
            $lookup: {
              from: 'practices',
              let: { practiceId: '$practice' },
              pipeline: [
                {
                  $match: { $expr: { $eq: ['$_id', '$$practiceId'] } },
                },
              ],
              as: 'practice',
            },
          },
          { $unwind: '$practice' },
          {
            $lookup: {
              from: 'users',
              let: { userId: '$user' },
              pipeline: [
                {
                  $match: { $expr: { $eq: ['$_id', '$$userId'] } },
                },
              ],
              as: 'user',
            },
          },
          { $unwind: '$user' },
        ],
        as: 'creator',
      },
    },
    { $unwind: '$creator' },
    {
      $sort: { signDate: -1, updatedAt: -1 },
    },
  ];
  if (limit) {
    aggregate.push({ $limit: limit });
  }
  const result = await Careplan.aggregate(aggregate);
  await Careplan.populate(result, [
    {
      path: 'shares.by',
      populate: ['practice', 'user'],
    },
    'content.careTeam.user',
  ]);
  if (limit === 1) {
    if (!result || result.length === 0) {
      return null;
    }
    return result[0];
  }
  return result || [];
};

const buildProviderCareplanQueryConditions = (
  conditions,
  user,
  sharedOnly,
  isNetworkUser
) => {
  const providerConditions = [];
  conditions['$and'] = [];
  if (!isNetworkUser) {
    conditions['$and'].push({
      $or: providerConditions,
    });
    if (!sharedOnly) {
      providerConditions.push({
        creator:
          user.activeProviderPractice?._id || user.activeProviderPractice,
      });
      providerConditions.push({
        practices:
          user.activeProviderPractice.practice?._id ||
          user.activeProviderPractice.practice,
      });
    }
    providerConditions.push({
      'shares.with':
        user.activeProviderPractice?._id || user.activeProviderPractice,
    });
  }
  if (!sharedOnly) {
    conditions['$and'].push({
      $or: [
        { isDraft: false },
        {
          isDraft: true,
          creator:
            user.activeProviderPractice?._id || user.activeProviderPractice,
        },
      ],
    });
  }
};

export default [
  {
    key: 'saveCareplanDraft',
    prototype: '(careplan: CareplanInput!): Careplan',
    mutation: true,
    run: async ({ careplan }, { user }) => {
      const _id = careplan._id || mongoose.Types.ObjectId().toString();

      const session = await mongoose.startSession();
      let updatedDraft;

      await session.withTransaction(async () => {
        const { content, duration, startDate } = careplan;
        const careplanData = {
          content,
          creator: user.activeProviderPractice,
          isDraft: true,
          user: careplan.user,
          isActive: false,
          duration,
          startDate,
        };
        updatedDraft = await Careplan.findOneAndUpdate(
          {
            _id,
          },
          careplanData,
          {
            upsert: true,
            new: true,
            session,
          }
        ).populate('content.careTeam.user');
      });

      session.endSession();
      socketManager.sendMessage(user._id, SOCKET_EVENTS.PATIENT_CAREPLANS, {
        patient: careplan.user,
      });
      updatedDraft = updatedDraft.toObject();
      delete updatedDraft.user;
      delete updatedDraft.creator;
      delete updatedDraft.practices;
      return updatedDraft;
    },
  },
  {
    key: 'signCareplan',
    prototype: '(careplan: CareplanInput!): Careplan',
    mutation: true,
    run: async ({ careplan }, { user }) => {
      const _id = careplan._id || mongoose.Types.ObjectId().toString();

      const patient = await User.findById(careplan.user);
      if (!patient) {
        throw new Error('Patient not found');
      }

      const session = await mongoose.startSession();
      let updatedDraft;

      const userPractice =
        user.activeProviderPractice.practice?._id ||
        user.activeProviderPractice.practice;

      await session.withTransaction(async () => {
        const { content, duration, startDate } = careplan;
        const careplanData = {
          content,
          creator: user.activeProviderPractice,
          isDraft: false,
          user: careplan.user,
          isActive: true,
          duration,
          startDate,
          practices: [userPractice],
          signDate: new Date(),
        };
        updatedDraft = await Careplan.findOneAndUpdate(
          {
            _id,
          },
          careplanData,
          {
            upsert: true,
            new: true,
            session,
          }
        ).populate('content.careTeam.user');
        await Careplan.updateMany(
          {
            isActive: true,
            user: careplan.user,
            _id: { $ne: _id },
          },
          { isActive: false },
          { session }
        );
      });

      session.endSession();

      // enqueue careplan task job
      const { time: nextTaskTime, tasks: nextTasks } =
        getNextCareplanTaskScheduleTime(patient, careplan);
      if (!!nextTaskTime) {
        const taskReminderJob = new CareplanTaskReminderJob({
          id: patient._id,
          careplan: _id,
          time: nextTaskTime,
          tasks: nextTasks,
        });
        taskReminderJob.enqueueDelay =
          nextTaskTime.toDate().getTime() - new Date().getTime();
        taskReminderJob.enqueue();
      }

      // sending socket notifications
      socketManager.notifyPractice(
        userPractice,
        SOCKET_EVENTS.PATIENT_CAREPLANS,
        { patient: careplan.user }
      );
      socketManager.sendMessage(
        careplan.user,
        SOCKET_EVENTS.PATIENT_CAREPLANS,
        {}
      );

      // sending sms & email
      const practiceName = user.activeProviderPractice?.practice?.name;
      const providerName = formatTitleAndName(user);
      const portalUrl = await buildPracticeUrlForUser(
        `/records/care-plans/${updatedDraft._id}`,
        careplan.user
      );

      const { email, sms } = await getNotificationInfo(patient);
      //disable for patient

      // email &&
      //   sendCareplanCreatedEmail(email, practiceName, {
      //     patientName: formatTitleAndName(patient),
      //     providerName,
      //     practiceName,
      //     portalUrl: portalUrl,
      //   });
      // sms &&
      //   sendCareplanCreatedSMS(sms, {
      //     header: `Care Plan created by ${providerName} of ${practiceName}`,
      //     portalUrl: portalUrl,
      //   });

      updatedDraft = updatedDraft.toObject();
      addFollowupAppointments(updatedDraft, user._id);
      delete updatedDraft.user;
      delete updatedDraft.creator;
      delete updatedDraft.practices;
      return updatedDraft;
    },
  },
  {
    key: 'activeCareplan',
    prototype: '(patient: ID): Careplan',
    run: async ({ patient }, { user }) => {
      const careplan = await Careplan.findOne({
        user: user.role === 'provider' ? patient : user._id,
        signDate: { $exists: true },
        isDraft: false,
      })
        .sort({ isActive: -1 })
        .populate([
          {
            path: 'creator',
            populate: ['practice', 'user'],
          },
          'user',
          'content.careTeam.user',
          {
            path: 'shares.by',
            populate: ['practice', 'user'],
          },
        ])
        .lean();
      return careplan;
    },
  },
  {
    key: 'patientCareplans',
    prototype: '(patient: ID, period: String, status: String): [Careplan]',
    run: async ({ patient, period, status }, { user }) => {
      if (user.role === 'patient' && status === 'shared') {
        return [];
      }
      const checkDate = checkDateForPeriod(period || 'all');
      const conditions = {};
      const sharedOnly = status === 'shared';
      let isNetworkUser = false;

      if (!(user.role === 'provider' && !patient)) {
        conditions.user =
          user.role === 'provider'
            ? mongoose.Types.ObjectId(patient)
            : user._id;
      }
      if (user.role === 'provider' && patient) {
        const patientRecord = await PatientPractice.findOne({
          user: mongoose.Types.ObjectId(patient),
          practice:
            user.activeProviderPractice.practice?._id ||
            user.activeProviderPractice.practice,
        });
        isNetworkUser = !!patientRecord;
      }

      if (period !== 'all') {
        conditions['$or'] = [
          { signDate: { $gt: checkDate } },
          { $and: [{ isDraft: true, updatedAt: { $gt: checkDate } }] },
        ];
      }
      if (user.role === 'patient') {
        conditions.isDraft = false;
        return await queryPatientCareplans(conditions, user);
      } else {
        buildProviderCareplanQueryConditions(
          conditions,
          user,
          sharedOnly,
          isNetworkUser
        );
        return await queryProviderCareplans(conditions, user);
      }
    },
  },
  {
    key: 'careplan',
    prototype: '(id: ID!, patient: ID): Careplan',
    run: async ({ id, patient }, { user }) => {
      const conditions = { _id: mongoose.Types.ObjectId(id) };

      let isNetworkUser = false;
      if (user.role === 'provider' && patient) {
        const patientRecord = await PatientPractice.findOne({
          user: mongoose.Types.ObjectId(patient),
          practice:
            user.activeProviderPractice.practice?._id ||
            user.activeProviderPractice.practice,
        });
        isNetworkUser = !!patientRecord;
      }

      if (user.role === 'patient') {
        conditions.user = user._id;
        return await queryPatientCareplans(conditions, user, 1);
      } else {
        buildProviderCareplanQueryConditions(
          conditions,
          user,
          false,
          isNetworkUser
        );
        return await queryProviderCareplans(conditions, user, 1);
      }
    },
  },
  {
    key: 'shareCareplan',
    prototype: '(provider: ID!, careplan: ID!): Boolean',
    mutation: true,
    run: async ({ provider: providerId, careplan: careplanId }, { user }) => {
      const careplan = await Careplan.findById(careplanId);
      if (!careplan) {
        throw new Error('Careplan not found');
      }
      const provider = await User.findById(providerId);
      if (!provider) {
        throw new Error('Provider not found');
      }
      for (let share of careplan.shares) {
        if (
          share.with.toString() === provider.activeProviderPractice.toString()
        ) {
          return true;
        }
      }

      const session = await mongoose.startSession();

      await session.withTransaction(async () => {
        if (!careplan.shares) {
          careplan.shares = [];
        }
        careplan.shares.push({
          by: user.activeProviderPractice?._id || user.activeProviderPractice,
          with: provider.activeProviderPractice,
          at: new Date(),
        });

        await Careplan.updateOne(
          { _id: careplanId },
          { shares: careplan.shares },
          { session }
        );
      });

      session.endSession();

      const room = await getChatRoom([user._id, providerId], careplan.user._id);
      const careplanObject = await populateCareplanQuery(
        Careplan.findOne({ _id: careplanId })
      ).lean();
      sendChat(user, {
        chatId: room._id,
        memberIds: [providerId],
        careplan: careplanObject,
      });

      socketManager.sendMessage(provider._id, SOCKET_EVENTS.PATIENT_CAREPLANS, {
        patient: careplan.user,
      });

      return true;
    },
  },
  {
    key: 'readCareplan',
    prototype: '(careplan: ID!): Boolean',
    mutation: true,
    run: async ({ careplan: careplanId }, { user }) => {
      const careplan = await Careplan.findOneAndUpdate(
        { _id: careplanId, isDraft: false, seen: { $ne: user._id } },
        { $push: { seen: user._id } }
      );

      if (!careplan) {
        return false;
      }
      socketManager.sendMessage(user._id, SOCKET_EVENTS.PATIENT_CAREPLANS);
      return true;
    },
  },
];
