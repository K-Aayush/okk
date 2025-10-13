import moment from 'moment';
import { Record, Note, DirectMessageInboxItem, User } from '../db';
import mongoose from 'mongoose';

export default [
  {
    key: 'monthlySpecialistSummary',
    prototype:
      '(year: Int!, month: Int!, patient: ID): MonthlySpecialistSummary',
    run: async ({ year, month, patient: patientId }, { user }) => {
      if (patientId) {
        const patient = await User.findById(patientId);
        if (!patient) {
          throw new Error('Patient not found');
        }
      }
      const from = moment
        .utc()
        .set({
          year,
          month: month - 1,
          date: 1,
          hour: 0,
          minute: 0,
          second: 0,
          milliseconds: 0,
        })
        .utcOffset(user.timezoneOffset || -300, true);
      const to = from.clone().add(1, 'months');

      const matchConditions = [
        { signDate: { $gte: from.toDate() } },
        { signDate: { $lt: to.toDate() } },
        { isDraft: false },
        { creator: user.activeProviderPractice._id },
        { directMessage: { $exists: true } },
      ];

      if (patientId) {
        matchConditions.push({ user: mongoose.Types.ObjectId(patientId) });
      }

      const noteAggregate = [
        {
          $match: {
            $and: matchConditions,
          },
        },
      ];

      const dmAggregate = noteAggregate.concat([
        {
          $lookup: {
            from: 'directmessageinboxes',
            localField: 'directMessage',
            foreignField: '_id',
            as: 'directMessage',
          },
        },
        { $unwind: '$directMessage' },
      ]);

      const totalConsultsResult = await Note.aggregate(
        noteAggregate.concat([
          { $group: { _id: '$user' } },
          { $count: 'totalConsults' },
        ])
      );
      const totalConsults =
        totalConsultsResult.length > 0
          ? totalConsultsResult[0].totalConsults
          : 0;

      const consultTimeMatchConditions = [
        { practice: user.activeProviderPractice?.practice._id },
        { startedAt: { $gte: from.toDate() } },
        { startedAt: { $lt: to.toDate() } },
      ];
      if (patientId) {
        consultTimeMatchConditions.push({
          patient: mongoose.Types.ObjectId(patientId),
        });
      }

      const averageConsultTimeResult = await Record.aggregate([
        {
          $match: {
            $and: consultTimeMatchConditions,
          },
        },
        {
          $group: {
            _id: '$patient',
            patientTotal: { $sum: '$totalTime' },
          },
        },
        {
          $group: {
            _id: null,
            avgTime: { $avg: '$patientTotal' },
          },
        },
      ]);
      const averageConsultTime =
        averageConsultTimeResult.length > 0
          ? parseInt(averageConsultTimeResult[0].avgTime)
          : 0;

      const averageResponseTimeResult = await Note.aggregate(
        dmAggregate.concat([
          {
            $addFields: {
              responseTime: {
                $divide: [
                  {
                    $subtract: ['$signDate', '$directMessage.createTime'],
                  },
                  1000,
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              avgValue: { $avg: '$responseTime' },
            },
          },
        ])
      );
      const averageResponseTime =
        averageResponseTimeResult.length > 0
          ? parseInt(averageResponseTimeResult[0].avgValue)
          : 0;

      return {
        totalConsults,
        averageConsultTime,
        averageResponseTime,
      };
    },
  },
  {
    key: 'monthlyPCPSummary',
    prototype: '(year: Int!, month: Int!): MonthlyPCPSummary',
    run: async ({ year, month }, { user }) => {
      const from = moment
        .utc()
        .set({
          year,
          month: 5, //month - 1,
          date: 1,
          hour: 0,
          minute: 0,
          second: 0,
          milliseconds: 0,
        })
        .utcOffset(user.timezoneOffset || -300, true);
      const to = from.clone().add(4, 'months');

      const queryResult = await DirectMessageInboxItem.aggregate([
        {
          $match: {
            $and: [
              { createTime: { $gte: from.toDate() } },
              { createTime: { $lt: to.toDate() } },
              { sender: user._id },
            ],
          },
        },
        {
          $lookup: {
            from: 'notes',
            foreignField: '_id',
            localField: 'note',
            as: 'note',
          },
        },
        {
          $unwind: {
            path: '$note',
            preserveNullAndEmptyArrays: true, // keep docs without matches
          },
        },
        {
          $addFields: {
            replied: {
              $cond: [
                { $eq: [{ $ifNull: ['$note.signDate', null] }, null] },
                0,
                1,
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            totalConsults: { $sum: 1 },
            totalCompleted: { $sum: '$replied' },
          },
        },
      ]);
      const result =
        queryResult.length > 0
          ? {
              totalConsults: queryResult[0].totalConsults,
              totalCompleted: queryResult[0].totalCompleted,
              totalOngoing:
                queryResult[0].totalConsults - queryResult[0].totalCompleted,
            }
          : {
              totalConsults: 0,
              totalCompleted: 0,
              totalOngoing: 0,
            };

      return result;
    },
  },
];
