import mongoose from 'mongoose';
import { CareplanAlerts } from '../db';
import { checkDateForPeriod } from '../utils';
import socketManager from '../services/socket-manager';
import SOCKET_EVENTS from '../services/socket-manager/constants';

export default [
  {
    key: 'patientAlerts',
    prototype: '(patient: ID, period: String): [CareplanAlert]',
    run: async ({ patient, period }, { user }) => {
      const checkDate = checkDateForPeriod(period || 'all');
      const conditions = {};

      if (user.role === 'provider') {
        if (!!patient) {
          conditions.user = mongoose.Types.ObjectId(patient);
        }
        conditions.providers = user._id;
      } else {
        conditions.user = user._id;
      }

      if (period !== 'all') {
        conditions.triggerTime = { $gt: checkDate };
      }
      return await CareplanAlerts.aggregate([
        {
          $match: conditions,
        },
        { $sort: { triggerTime: -1 } },
        {
          $addFields: {
            isSeen: {
              $cond: [
                { $in: [user._id, { $ifNull: ['$seen', []] }] },
                true,
                false,
              ],
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
      ]);
    },
  },
  {
    key: 'providerAlerts',
    prototype: '(period: String): [CareplanPatientAlert]',
    run: async ({ period }, { user }) => {
      if (user.role !== 'provider') {
        return [];
      }

      const checkDate = checkDateForPeriod(period || 'all');
      const conditions = { providers: user._id };
      if (period !== 'all') {
        conditions.triggerTime = { $gt: checkDate };
      }
      return await CareplanAlerts.aggregate([
        {
          $match: conditions,
        },
        { $sort: { triggerTime: -1 } },
        {
          $addFields: {
            unread: {
              $cond: [{ $in: [user._id, { $ifNull: ['$seen', []] }] }, 0, 1],
            },
          },
        },
        {
          $group: {
            _id: '$user',
            unseen: { $sum: '$unread' },
            triggerTime: { $first: '$triggerTime' },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: '$user' },
      ]);
    },
  },
  {
    key: 'readAlerts',
    prototype: '(alert: ID!, measure: String!, patient: ID): Boolean',
    mutation: true,
    run: async (
      { alert: alertId, measure, patient: patientIdFromQuery },
      { user }
    ) => {
      let alert;
      const patientId =
        user.role === 'provider' ? patientIdFromQuery : user._id;
      if (user.role === 'provider') {
        alert = await CareplanAlerts.findOne({
          _id: alertId,
          user: patientId,
          providers: user._id,
        });
      } else {
        alert = await CareplanAlerts.findOne({
          _id: alertId,
          user: patientId,
        });
      }
      if (!alert) {
        return false;
      }
      const alertTime = alert.triggerTime;
      await CareplanAlerts.updateMany(
        {
          measure,
          triggerTime: { $lte: alertTime },
          user: patientId,
          isSeen: { $ne: user._id },
        },
        { $push: { seen: user._id } }
      );
      socketManager.sendMessage(user._id, SOCKET_EVENTS.ALERTS_UPDATE);
      return true;
    },
  },
];
