import mongoose from 'mongoose';

import { Record, RecordItem } from '../db';
import { createRecord } from '../services/record';

const { ObjectId } = mongoose.Types;

export default [
  {
    key: 'createRecord',
    prototype: '(record: RecordInput!): Boolean',
    mutation: true,
    isPublic: true,
    run: async ({ record }, {}) => {
      // if (record.provider !== user._id.toString()) {
      //   throw Error('You are not allowed to create record for this provider.');
      // }
      await createRecord(record);

      return true;
    },
  },
  {
    key: 'addManualRecord',
    prototype:
      '(patient:ID!, from: Date!, duration: Int!, task: String!, provider: ID, reporter: ID): Boolean',
    mutation: true,
    run: async (
      { patient, from, duration, task, provider, reporter },
      { user }
    ) => {
      if (user.role !== 'provider') {
        throw Error('You are not allowed to create record for this provider.');
      }

      const session = await mongoose.startSession();
      const to = new Date(from.getTime() + duration * 60 * 1000);
      const totalTime = duration * 60;

      await session.withTransaction(async () => {
        const newRecords = await Record.create(
          [
            {
              practice: user.activeProviderPractice.practice,
              provider: reporter || user._id,
              patient,
              startedAt: from,
              endedAt: to,
              totalTime,
              isManual: true,
            },
          ],
          { session }
        );

        let recordType;
        if (task === 'audio') {
          recordType = 'manualAudio';
        } else if (task === 'video') {
          recordType = 'manualVideo';
        } else {
          recordType = task;
        }

        await RecordItem.create(
          [
            {
              record: newRecords[0],
              type: recordType,
              startedAt: from,
              endedAt: to,
              duration: totalTime,
              coordinatedProvider: provider,
            },
          ],
          { session }
        );
      });

      session.endSession();

      return true;
    },
  },
  {
    key: 'patientLastSeen',
    prototype: '(patient: ID!): Date',
    run: async ({ patient }, { user }) => {
      const practice = user.activeProviderPractice?.practice;

      if (!practice) {
        return null;
      }
      const lastRecord = await Record.find({
        practice: practice,
        patient: ObjectId(patient),
      })
        .sort({ endedAt: -1 })
        .limit(1);

      return lastRecord[0]?.endedAt;
    },
  },
];
