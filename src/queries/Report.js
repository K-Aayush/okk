import mongoose from 'mongoose';
import moment from 'moment';
import { extractData } from '../utils/report';

const { ObjectId } = mongoose.Types;

import { Call, CareplanResponse, Chat, Record, User } from '../db';
import {
  displayTime,
  formatTitleAndName,
  generatePatientReportPdf,
  generateProviderReportPdf,
  getFullName,
  secondsToDuration,
} from '../utils';

const getPatientReport = async (user, isProvider, patientId, year, month) => {
  const from = moment.utc().set({
    year,
    month: month - 1,
    date: 1,
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  const to = from.clone().add(1, 'months');

  const aggregatePhases = [
    {
      $match: {
        $and: [
          isProvider
            ? { practice: user.activeProviderPractice?.practice._id }
            : {},
          { patient: ObjectId(patientId) },
          { startedAt: { $gte: from.toDate() } },
          { startedAt: { $lt: to.toDate() } },
        ],
      },
    },
  ];

  const totals = await Record.aggregate([
    ...aggregatePhases,
    {
      $group: {
        _id: null,
        total: {
          $sum: '$totalTime',
        },
      },
    },
  ]);
  const total = totals[0]?.total;

  const records = await Record.aggregate([
    ...aggregatePhases,
    {
      $lookup: {
        from: 'users',
        localField: 'provider',
        foreignField: '_id',
        as: 'provider',
      },
    },
    { $unwind: '$provider' },
    {
      $lookup: {
        from: 'recorditems',
        let: { recordId: '$_id' },
        as: 'items',
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ['$record', '$$recordId'],
              },
            },
          },
          {
            $sort: {
              startedAt: -1,
            },
          },
        ],
      },
    },
    {
      $sort: {
        startedAt: -1,
      },
    },
  ]);

  const promises = [];

  records.forEach((record) => {
    record.items.forEach((item) => {
      promises.push(resolveRecordItem(item, record));
    });
  });

  await Promise.all(promises);

  return {
    total: total || 0,
    records,
  };
};

const resolveRecordItem = async (item, record) => {
  const { entityId, type, coordinatedProvider: coordinatedProviderId } = item;

  // if (!entityId) {
  //   console.error('Malformed data:', item);
  //   return;
  // }

  if (entityId) {
    if (type === 'chat') {
      const chat = await Chat.findById(entityId).populate([
        'members',
        'referredPatient',
      ]);
      item.participants = chat?.members;
      item.referredPatient = chat?.referredPatient;
    } else if (type === 'call') {
      const call = await Call.findById(entityId).populate([
        'attendees.user',
        'referredPatient',
      ]);
      item.participants = call?.attendees.map((attendee) => attendee.user);
      item.referredPatient = call?.referredPatient;
      item.scheduled = call?.callType === 'scheduled';
      item.isPSTN = call?.isPSTN;
    }
  } else if (record.isManual) {
    const provider = await User.findById(record.provider);
    if (coordinatedProviderId) {
      const coordinatedProvider = await User.findById(coordinatedProviderId);
      item.participants = [provider, coordinatedProvider];
    } else {
      item.participants = [provider];
    }
  }
};

const getProviderReport = async (user, year, month) => {
  const from = moment.utc().set({
    year,
    month: month - 1,
    date: 1,
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  const to = from.clone().add(1, 'months');

  const aggregatePhases = [
    {
      $match: {
        $and: [
          { practice: user.activeProviderPractice?.practice._id },
          { startedAt: { $gte: from.toDate() } },
          { startedAt: { $lt: to.toDate() } },
        ],
      },
    },
  ];

  const totals = await Record.aggregate([
    ...aggregatePhases,
    {
      $group: {
        _id: null,
        total: {
          $sum: '$totalTime',
        },
      },
    },
  ]);
  const total = totals[0]?.total;

  // TODO: implement pagination
  const records = await Record.aggregate([
    ...aggregatePhases,
    {
      $group: {
        _id: {
          patient: '$patient',
          provider: '$provider',
        },
        subTotal: { $sum: '$totalTime' },
        lastSeen: { $max: '$startedAt' },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id.provider',
        foreignField: '_id',
        as: 'provider',
      },
    },
    { $unwind: '$provider' },
    {
      $group: {
        _id: '$_id.patient',
        providers: {
          $push: {
            provider: '$provider',
            subTotal: '$subTotal',
          },
        },
        subTotal: { $sum: '$subTotal' },
        lastSeen: { $max: '$lastSeen' },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'patient',
      },
    },
    {
      $unwind: '$patient',
    },
    {
      $lookup: {
        from: 'patientpractices',
        let: { id: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ['$user', '$$id'],
              },
            },
          },
          { $limit: 1 },
        ],
        as: 'patientPractice',
      },
    },
    {
      $unwind: {
        path: '$patientPractice',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: 'practices',
        localField: 'patientPractice.practice',
        foreignField: '_id',
        as: 'practice',
      },
    },
    {
      $unwind: {
        path: '$practice',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $sort: {
        lastSeen: -1,
        'patient.createdAt': 1,
      },
    },
    {
      $project: {
        subTotal: 1,
        lastSeen: 1,
        patient: 1,
        practice: 1,
        providers: 1,
      },
    },
  ]);

  return {
    total: total || 0,
    items: records,
  };
};

export default [
  {
    key: 'providerReport',
    prototype: '(year: Int!, month: Int!): ProviderReport',
    run: async ({ year, month }, { user }) => {
      return await getProviderReport(user, year, month);
    },
  },
  {
    key: 'patientReport',
    prototype:
      '(year: Int!, month: Int!, patient: ID, practice: ID): PatientReport',
    run: async (
      { year, month, patient: patientId, practice: practiceId },
      { user }
    ) => {
      const isProvider = user.role === 'provider';
      const patient = isProvider ? patientId : user._id;
      return await getPatientReport(user, isProvider, patient, year, month);
    },
  },
  {
    key: 'monthlyPatientReadings',
    prototype: '(year: Int!, month: Int!, patient: ID): PatientMonthlyReadings',
    run: async ({ year, month, patient: patientId }, { user }) => {
      const isProvider = user.role === 'provider';
      const from = moment.utc().set({
        year,
        month: month - 1,
        date: 1,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
      });
      const to = from.clone().add(1, 'months');
      const patient = user.role === 'provider' ? patientId : user._id;

      let time;

      if (user.role === 'provider') {
        const aggregatePhases = [
          {
            $match: {
              $and: [
                isProvider
                  ? { practice: user.activeProviderPractice?.practice._id }
                  : {},
                { patient: ObjectId(patient) },
                { startedAt: { $gte: from.toDate() } },
                { startedAt: { $lt: to.toDate() } },
              ],
            },
          },
        ];

        const totals = await Record.aggregate([
          ...aggregatePhases,
          {
            $group: {
              _id: null,
              total: {
                $sum: '$totalTime',
              },
            },
          },
        ]);
        time = totals[0]?.total;
      } else {
        time = 0;
      }

      const readings = await CareplanResponse.aggregate([
        {
          $match: {
            $and: [
              { user: ObjectId(patient) },
              { date: { $gte: from.toDate() } },
              { date: { $lt: to.toDate() } },
            ],
          },
        },
        { $unwind: '$responses' },
        {
          $addFields: {
            phys: {
              $cond: [
                {
                  $and: [
                    { $ifNull: ['$responses.addedTime', false, true] },
                    { $eq: ['$responses.measure', 'vital'] },
                  ],
                },
                1,
                0,
              ],
            },
            thera: {
              $cond: [
                {
                  $and: [
                    { $ifNull: ['$responses.addedTime', false, true] },
                    { $ne: ['$responses.measure', 'vital'] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
        {
          $group: {
            _id: '$date',
            physiologic: { $max: '$phys' },
            therapeutic: { $max: '$thera' },
          },
        },
        {
          $group: {
            _id: null,
            physiologic: { $sum: '$physiologic' },
            therapeutic: { $sum: '$therapeutic' },
          },
        },
      ]);

      return {
        time: time || 0,
        physiologic: readings[0]?.physiologic || 0,
        therapeutic: readings[0]?.therapeutic || 0,
      };
    },
  },
  {
    key: 'monthlyProviderBillableSummary',
    prototype: '(year: Int!, month: Int!): ProviderMonthlyBillableSummary',
    run: async ({ year, month }, { user }) => {
      const from = moment.utc().set({
        year,
        month: month - 1,
        date: 1,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
      });
      const to = from.clone().add(1, 'months');
      const timeLimit = user.activeProviderPractice?.billing?.time || 30;
      const therapeuticLimit =
        user.activeProviderPractice?.billing?.therapeutic || 16;
      const physiologicLimit =
        user.activeProviderPractice?.billing?.physiologic || 16;

      const aggregatePhases = [
        {
          $match: {
            $and: [
              { practice: user.activeProviderPractice?.practice._id },
              { startedAt: { $gte: from.toDate() } },
              { startedAt: { $lt: to.toDate() } },
            ],
          },
        },
      ];

      const totals = await Record.aggregate([
        ...aggregatePhases,
        {
          $group: {
            _id: '$patient',
            patientTotal: {
              $sum: '$totalTime',
            },
          },
        },
        {
          $match: {
            patientTotal: { $gt: timeLimit * 60 },
          },
        },
        { $count: 'billableCount' },
      ]);
      const time = totals[0]?.billableCount || 0;

      const readings = await CareplanResponse.aggregate([
        {
          $match: {
            $and: [
              { date: { $gte: from.toDate() } },
              { date: { $lt: to.toDate() } },
            ],
          },
        },
        { $unwind: '$responses' },
        {
          $addFields: {
            phys: {
              $cond: [
                {
                  $and: [
                    { $ifNull: ['$responses.addedTime', false, true] },
                    { $eq: ['$responses.measure', 'vital'] },
                  ],
                },
                1,
                0,
              ],
            },
            thera: {
              $cond: [
                {
                  $and: [
                    { $ifNull: ['$responses.addedTime', false, true] },
                    { $ne: ['$responses.measure', 'vital'] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
        {
          $group: {
            _id: {
              patient: '$user',
              date: '$date',
            },
            physiologic: { $max: '$phys' },
            therapeutic: { $max: '$thera' },
          },
        },
        {
          $group: {
            _id: '$_id.patient',
            physiologic: { $sum: '$physiologic' },
            therapeutic: { $sum: '$therapeutic' },
          },
        },
        {
          $addFields: {
            physBillable: {
              $cond: [
                {
                  $gte: ['$physiologic', physiologicLimit],
                },
                1,
                0,
              ],
            },
            theraBillable: {
              $cond: [
                {
                  $gte: ['$therapeutic', therapeuticLimit],
                },
                1,
                0,
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            physiologicBillable: { $sum: '$physBillable' },
            therapeuticBillable: { $sum: '$theraBillable' },
          },
        },
      ]);

      return {
        time,
        physiologic: readings[0]?.physiologicBillable || 0,
        therapeutic: readings[0]?.physiologicBillable || 0,
      };
    },
  },
  {
    key: 'billableReadingPatients',
    prototype: '(year: Int!, month: Int!): [BillableReadingPatient]',
    run: async ({ year, month }, { user }) => {
      const from = moment.utc().set({
        year,
        month: month - 1,
        date: 1,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
      });
      const to = from.clone().add(1, 'months');
      const therapeuticLimit =
        user.activeProviderPractice?.billing?.therapeutic || 16;
      const physiologicLimit =
        user.activeProviderPractice?.billing?.physiologic || 16;

      const readings = await CareplanResponse.aggregate([
        {
          $match: {
            $and: [
              { date: { $gte: from.toDate() } },
              { date: { $lt: to.toDate() } },
            ],
          },
        },
        { $unwind: '$responses' },
        {
          $addFields: {
            phys: {
              $cond: [
                {
                  $and: [
                    { $ifNull: ['$responses.addedTime', false, true] },
                    { $eq: ['$responses.measure', 'vital'] },
                  ],
                },
                1,
                0,
              ],
            },
            thera: {
              $cond: [
                {
                  $and: [
                    { $ifNull: ['$responses.addedTime', false, true] },
                    { $ne: ['$responses.measure', 'vital'] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
        {
          $group: {
            _id: {
              patient: '$user',
              date: '$date',
            },
            physiologic: { $max: '$phys' },
            therapeutic: { $max: '$thera' },
          },
        },
        {
          $group: {
            _id: '$_id.patient',
            physiologic: { $sum: '$physiologic' },
            therapeutic: { $sum: '$therapeutic' },
          },
        },
        {
          $addFields: {
            physBillable: {
              $cond: [
                {
                  $gte: ['$physiologic', physiologicLimit],
                },
                true,
                false,
              ],
            },
            theraBillable: {
              $cond: [
                {
                  $gte: ['$therapeutic', therapeuticLimit],
                },
                true,
                false,
              ],
            },
          },
        },
        {
          $lookup: {
            from: 'users',
            let: { id: '$_id' },
            as: 'patient',
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ['$_id', '$$id'],
                  },
                },
              },
            ],
          },
        },
        {
          $unwind: '$patient',
        },
      ]);

      return readings;
    },
  },
  {
    key: 'downloadPatientReportPDF',
    prototype: '(year: Int!, month: Int!, patient: ID!): FileBase64',
    run: async ({ year, month, patient: patientId }, { user }) => {
      const patient = await User.findById(patientId);
      const from = moment.utc().set({
        year,
        month: month - 1,
        date: 1,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
      });
      const { records } = await getPatientReport(
        user,
        true,
        patientId,
        year,
        month
      );

      const datas = [];
      records?.forEach((record) => {
        record.items.forEach((item) => {
          datas.push(extractData(user, record, item));
        });
      });

      const pdfData = {
        reportMonth: displayTime(from, 'MMMM YYYY'),
        patientID: patient.athenaId,
        patientDOB: patient.dob,
        patientName: getFullName(patient),
        providerName: formatTitleAndName(user),
        reportData: datas,
      };
      const pdfBuffer = await generatePatientReportPdf(pdfData);

      return {
        fileName: `${formatTitleAndName(user)}-${getFullName(
          patient
        )}-${displayTime(from, 'MMM_YYYY')}-report.pdf`,
        contentType: 'application/pdf',
        contentBase64: pdfBuffer.toString('base64'),
      };
    },
  },
  {
    key: 'downloadProviderReportPDF',
    prototype: '(year: Int!, month: Int!): FileBase64',
    run: async ({ year, month }, { user }) => {
      const { items: records } = await getProviderReport(user, year, month);

      const from = moment.utc().set({
        year,
        month: month - 1,
        date: 1,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
      });

      const datas = [];
      records.forEach((record) => {
        for (let i = 0; i < record.providers.length; i++) {
          if (i === 0) {
            datas.push([
              getFullName(record.patient),
              record.patient?.athenaId,
              displayTime(record.patient?.dob, 'DD/MM/yyyy'),
              record.practice?.name,
              formatTitleAndName(record.providers[0].provider),
              secondsToDuration(record.providers[0].subTotal),
              secondsToDuration(record.subTotal),
            ]);
          } else {
            datas.push([
              '',
              '',
              '',
              '',
              formatTitleAndName(record.providers[i].provider),
              secondsToDuration(record.providers[i].subTotal),
              '',
            ]);
          }
        }
      });

      const pdfData = {
        reportMonth: displayTime(from, 'MMMM YYYY'),
        reportData: datas,
      };
      const pdfBuffer = await generateProviderReportPdf(pdfData);

      return {
        fileName: `${formatTitleAndName(user)}-${displayTime(
          from,
          'MMM_YYYY'
        )}-report.pdf`,
        contentType: 'application/pdf',
        contentBase64: pdfBuffer.toString('base64'),
      };
    },
  },
];
