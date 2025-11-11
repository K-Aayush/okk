import mongoose from 'mongoose';
import { User, Record, RecordItem, Call } from '../db';
import CreateRecordJob from '../backgroundJobs/records/jobs/createRecord';

const getRedundantItems = async (record, user, type) => {
  // For now, just check the first redundant item.
  const item = record.items.find((item) => item.type === type);

  if (!item) {
    return [];
  }

  const redundantItems = await RecordItem.aggregate([
    {
      $match: {
        type,
        entityId: item.entityId,
        startedAt: {
          $lte: new Date(item.endedAt * 1000),
        },
        endedAt: {
          $gte: new Date(item.startedAt * 1000),
        },
      },
    },
    {
      $lookup: {
        from: 'records',
        let: { recordId: '$record' },
        as: 'record',
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$$recordId', '$_id'] },
                  {
                    $eq: [
                      '$practice',
                      user.activeProviderPractice?.practice._id,
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
    },
    {
      $unwind: '$record',
    },
  ]);

  return redundantItems || [];
};

const removeRedundantCalls = async (record, user) => {
  const redundantItems = await getRedundantItems(record, user, 'call');

  if (redundantItems.length === 0) {
    return record;
  }

  const redundantItemIds = redundantItems.map((item) => item.entityId);

  let totalTime = 0;
  let newItems = [];

  for (const item of record.items) {
    if (!item.type === 'call' || !redundantItemIds.includes(item.entityId)) {
      totalTime += item.duration;
      newItems.push(item);
    }
  }

  record.items = newItems;
  record.totalTime = totalTime;

  return record;
};

const removeRedundantChats = async (record, user) => {
  const redundantItems = await getRedundantItems(record, user, 'chat');
  if (redundantItems.length === 0) {
    return record;
  }

  for (const redundantItem of redundantItems) {
    const index = record.items.findIndex(
      (i) => i.type === 'chat' && i.entityId === redundantItem.entityId
    );
    const item = record.items[index];

    if (redundantItem.duration > item.duration) {
      // re-calculating total time excluding the redundant chat record
      record.totalTime = record.items.reduce((acc, cur) => {
        if (cur.type === 'chat' && i.entityId === redundantItem.entityId) {
          return acc;
        }
        return acc + cur.duration;
      }, 0);
      record.items.splice(index, 1);
    } else {
      const newTotals = await RecordItem.aggregate([
        {
          $match: {
            $and: [
              {
                record: redundantItem.record._id,
                type: {
                  $ne: 'chat',
                },
              },
            ],
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: '$duration',
            },
          },
        },
      ]);

      const total = newTotals[0]?.total || 0;

      if (total === 0) {
        await Record.findByIdAndDelete(redundantItem.record._id);
      } else {
        await Record.findByIdAndUpdate(redundantItem.record._id, {
          totalTime: total,
        });
      }
      await RecordItem.findByIdAndDelete(redundantItem._id);
    }
  }

  return record;
};

export const createRecord = async (record, createBackgroundJob) => {
  if (createBackgroundJob) {
    if (record?.clientRecordId) {
      const jobDelay = 1000 * 60; // Create record after 1 minute via background job

      const createRecordJob = new CreateRecordJob({
        id: record.clientRecordId,
        record,
      });
      createRecordJob.enqueueDelay = jobDelay;
      createRecordJob.enqueue();
    }
    return;
  }

  let existingRecord = null;
  if (record?.clientRecordId) {
    existingRecord = await Record.findOne({
      clientRecordId: record.clientRecordId,
    });
    if (existingRecord && existingRecord.totalTime >= record.totalTime) {
      return;
    }
  }

  const user = await User.findById(record.provider)
    .populate({
      path: 'activeProviderPractice',
      populate: {
        path: 'practice',
        model: 'Practice',
      },
    })
    .exec();

  const session = await mongoose.startSession();

  await session.withTransaction(async () => {
    const callRemoved = await removeRedundantCalls(record, user);
    const {
      practice,
      provider,
      patient,
      startedAt,
      endedAt,
      totalTime,
      isManual,
      description,
      items,
    } = await removeRedundantChats(callRemoved, user);

    if (totalTime === 0) {
      return;
    }

    if (!existingRecord) {
      const newRecords = await Record.create(
        [
          {
            practice,
            provider,
            patient,
            startedAt: new Date(startedAt * 1000),
            clientRecordId: record?.clientRecordId,
            endedAt: new Date(endedAt * 1000),
            totalTime,
            isManual,
            description,
          },
        ],
        { session }
      );
      existingRecord = newRecords[0];
    } else {
      await Record.findByIdAndUpdate(
        existingRecord._id,
        {
          practice,
          provider,
          patient,
          startedAt: new Date(startedAt * 1000),
          endedAt: new Date(endedAt * 1000),
          totalTime,
          isManual,
          description,
        },
        { session }
      );
      await RecordItem.deleteMany({ record: existingRecord._id }, { session });
    }
    await RecordItem.create(
      items.map((item) => ({
        ...item,
        record: existingRecord?._id || existingRecord,
        startedAt: new Date(item.startedAt * 1000),
        endedAt: new Date(item.endedAt * 1000),
      })),
      { session }
    );

    // Add PSTN callee records
    const pstnItems = [];
    for (let item of items) {
      if (item.type === 'call') {
        const callEntity = await Call.findById(item.entityId).populate([
          'attendees.user',
        ]);

        // process only PSTN calls
        if (callEntity.isPSTN) {
          let otherAttendee;
          for (let attendee of callEntity.attendees) {
            if (attendee.user && attendee.user._id != provider) {
              otherAttendee = attendee.user;
              break;
            }
          }
          // ignore if callee is patient
          if (otherAttendee?.role === 'provider') {
            pstnItems.push({
              user: otherAttendee,
              item: {
                ...item,
                startedAt: new Date(item.startedAt * 1000),
                endedAt: new Date(item.endedAt * 1000),
              },
            });
          }
        }
        // Update call record according to report
        await Call.findByIdAndUpdate(
          item.entityId,
          {
            startTime: new Date(item.startedAt * 1000),
            endedAt: new Date(item.endedAt * 1000),
          },
          { session }
        );
      }
    }
    if (pstnItems.length > 0) {
      const pstnClientRecordId = `${record.clientRecordId}_pstn`;

      // remove previously created pstnRecords
      const pstnRecords = await Record.find(
        { clientRecordId: pstnClientRecordId },
        null,
        { session }
      );
      const recordIds = pstnRecords.map((r) => r._id);
      await RecordItem.deleteMany({ record: { $in: recordIds } }, { session });
      await Record.deleteMany({ _id: { $in: recordIds } }, { session });

      // Create Record item for each pstn call item
      for (let pstnItem of pstnItems) {
        const attendee = await User.findById(pstnItem.user._id)
          .populate('activeProviderPractice')
          .exec();
        const newPSTNRecords = await Record.create(
          [
            {
              practice: attendee.activeProviderPractice.practice,
              provider: attendee._id,
              patient,
              startedAt: pstnItem.item.startedAt,
              clientRecordId: pstnClientRecordId,
              endedAt: pstnItem.item.endedAt,
              totalTime: pstnItem.item.duration,
              isManual,
              description,
            },
          ],
          { session }
        );
        const newRecordId = newPSTNRecords[0]._id;
        await RecordItem.create(
          [
            {
              ...pstnItem.item,
              record: newRecordId,
            },
          ],
          { session }
        );
      }
    }
  });

  session.endSession();
};
