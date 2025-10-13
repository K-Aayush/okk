import mongoose from 'mongoose';
import { Upload } from '@aws-sdk/lib-storage';
import { S3 } from '@aws-sdk/client-s3';
import { fromEnv } from '@aws-sdk/credential-providers';
import { nanoid } from 'nanoid';

import { Note, User } from '../db';
import { checkDateForPeriod } from '../utils/time';
import socketManager from '../services/socket-manager';
import SOCKET_EVENTS from '../services/socket-manager/constants';
import { getChatRoom, sendChat } from '../services/chat';
import {
  getContentTypeFromBase64,
  base64ToBuffer,
  populateNote,
} from '../utils';

const populateNoteQuery = (result) => {
  return Note.populate(result, [
    'user',
    {
      path: 'creator',
      populate: ['practice', 'user'],
    },
    {
      path: 'directMessage',
      populate: ['practice', 'sender'],
    },
    {
      path: 'shares.by',
      populate: ['practice', 'user'],
    },
    {
      path: 'shares.with',
      populate: ['practice', 'user'],
    },
    {
      path: 'directMessageShare.to',
      populate: ['practice', 'user'],
    },
  ]);
};

const queryPatientNotes = async (conditions, user, limit) => {
  const aggregate = [
    { $match: conditions },
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
  const result = await Note.aggregate(aggregate);
  if (limit === 1) {
    if (!result || result.length === 0) {
      return null;
    }
    return result[0];
  }
  return result || [];
};

const queryProviderNotes = async (
  conditions,
  user,
  limit,
  practice,
  sentResponsesOnly
) => {
  let aggregate = [
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
  ];
  if (sentResponsesOnly) {
    aggregate.push({
      $addFields: {
        shares: {
          $filter: {
            input: '$shares',
            as: 'share',
            cond: {
              $eq: [
                '$$share.by',
                user.activeProviderPractice?._id || user.activeProviderPractice,
              ],
            },
          },
        },
      },
    });
    aggregate.push({
      $match: {
        $or: [
          { 'shares.0': { $exists: true } },
          { 'directMessageShare.0': { $exists: true } },
        ],
      },
    });
  } else {
    aggregate.push({
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
    });
  }
  aggregate = aggregate.concat([
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
  ]);
  if (limit) {
    aggregate.push({ $limit: limit });
  }
  if (practice) {
    aggregate.push({
      $lookup: {
        from: 'patientpractices',
        let: { userId: '$user._id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$$userId', '$user'] },
                  { $eq: ['$practice', mongoose.Types.ObjectId(practice)] },
                ],
              },
            },
          },
        ],
        as: 'patientpractice',
      },
    });
    aggregate.push({ $match: { 'patientpractice.0': { $exists: true } } });
  }
  const result = await Note.aggregate(aggregate);
  await Note.populate(result, [
    {
      path: 'shares.by',
      populate: ['practice', 'user'],
    },
    { path: 'shares.with', populate: ['practice', 'user'] },
    {
      path: 'directMessage',
      populate: ['practice', 'sender'],
    },
    {
      path: 'directMessageShare',
      populate: [{ path: 'to', populate: ['practice', 'user'] }],
    },
  ]);
  if (limit === 1) {
    if (!result || result.length === 0) {
      return null;
    }
    return result[0];
  }
  return result || [];
};

const buildProviderNoteQueryConditions = (conditions, user, sharedOnly) => {
  const providerConditions = [];
  conditions['$and'] = [
    {
      $or: providerConditions,
    },
  ];
  if (!sharedOnly) {
    providerConditions.push({
      creator: user.activeProviderPractice?._id || user.activeProviderPractice,
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
  if (!sharedOnly) {
    providerConditions.push({
      directMessage: { $exists: true, $ne: null },
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
  } else {
    conditions['isDraft'] = false;
  }
};

export default [
  {
    key: 'note',
    prototype: '(id: ID!): Note',
    run: async ({ id }, { user }) => {
      const conditions = { _id: mongoose.Types.ObjectId(id) };
      if (user.role === 'patient') {
        conditions.user = user._id;
        return await queryPatientNotes(conditions, user, 1);
      } else {
        return await queryProviderNotes(conditions, user, 1);
      }
    },
  },
  {
    key: 'saveNoteDraft',
    prototype: '(note: NoteInput!): Note',
    mutation: true,
    run: async ({ note }, { user }) => {
      const _id = note._id || mongoose.Types.ObjectId().toString();

      const session = await mongoose.startSession();
      let updatedDraft;

      await session.withTransaction(async () => {
        const { content } = note;
        const noteData = {
          content,
          creator: user.activeProviderPractice,
          isDraft: true,
          user: note.user,
        };
        updatedDraft = await Note.findOneAndUpdate(
          {
            _id,
          },
          noteData,
          {
            upsert: true,
            new: true,
            session,
          }
        );
      });

      session.endSession();
      socketManager.sendMessage(user._id, SOCKET_EVENTS.PATIENT_NOTES, {
        patient: note.user,
      });
      updatedDraft = updatedDraft.toObject();
      delete updatedDraft.user;
      delete updatedDraft.creator;
      delete updatedDraft.practices;
      return updatedDraft;
    },
  },
  {
    key: 'signNote',
    prototype: '(note: NoteInput!): Note',
    mutation: true,
    run: async ({ note }, { user }) => {
      const _id = note._id || mongoose.Types.ObjectId().toString();

      const session = await mongoose.startSession();
      let updatedDraft;

      const userPractice =
        user.activeProviderPractice.practice?._id ||
        user.activeProviderPractice.practice;

      const {
        content,
        saveSignature,
        signature: signatureBase64,
        isChangedFromSavedSignature,
      } = note;
      let signatureUrl;
      if (!isChangedFromSavedSignature) {
        signatureUrl = user.signatureImage;
      } else if (signatureBase64) {
        const s3 = new S3({
          region: process.env.AWS_REGION,
          credentials: fromEnv(),
        });

        const fileName = 'signatures/' + nanoid();
        const fileBody = base64ToBuffer(signatureBase64);
        const response = await new Upload({
          client: s3,
          params: {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: fileName,
            ContentType: getContentTypeFromBase64(signatureBase64),
            Body: fileBody,
            ACL: 'public-read',
          },
        }).done();
        signatureUrl = response.Location;
      }

      await session.withTransaction(async () => {
        if (saveSignature) {
          await User.findByIdAndUpdate(user._id, {
            signatureImage: signatureUrl,
          });
        } else {
          await User.findByIdAndUpdate(user._id, {
            signatureImage: null,
          });
        }

        const noteData = {
          content,
          creator: user.activeProviderPractice,
          isDraft: false,
          user: note.user,
          practices: [userPractice],
          signDate: new Date(),
          signature: signatureUrl,
        };
        updatedDraft = await Note.findOneAndUpdate(
          {
            _id,
          },
          noteData,
          {
            upsert: true,
            new: true,
            session,
          }
        );
      });

      session.endSession();
      socketManager.notifyPractice(userPractice, SOCKET_EVENTS.PATIENT_NOTES, {
        patient: note.user,
      });
      socketManager.sendMessage(note.user, SOCKET_EVENTS.PATIENT_NOTES, {});
      updatedDraft = updatedDraft.toObject();
      delete updatedDraft.user;
      delete updatedDraft.creator;
      delete updatedDraft.practices;
      return updatedDraft;
    },
  },
  {
    key: 'noteItemPastRecords',
    prototype:
      '(type: String!, period: String!, patient: String!): [NoteItemPastRecord]',
    run: async ({ type, period, patient }, { user }) => {
      const checkDate = checkDateForPeriod(period);
      const conditions = {
        user: mongoose.Types.ObjectId(patient),
        isDraft: false,
      };
      const fieldName = `content.${type}`;
      if (period !== 'all') {
        conditions.signDate = { $gt: checkDate };
      }
      conditions[fieldName] = { $ne: null };
      const projection = { _id: 0, signDate: 1 };
      projection[fieldName] = 1;

      const aggregate = Note.aggregate([
        { $match: conditions },
        { $sort: { signDate: -1 } },
        { $project: projection },
      ]);
      aggregate.addFields({
        time: '$signDate',
      });
      return await aggregate;
    },
  },
  {
    key: 'notes',
    prototype:
      '(patient: String, practice: ID, period: String!, status: String): [Note]',
    run: async ({ patient, practice, period, status }, { user }) => {
      if (user.role === 'patient' && status === 'shared') {
        return [];
      }
      const checkDate = checkDateForPeriod(period || 'all');
      const conditions = {};
      const sharedOnly = status === 'shared';
      if (period !== 'all') {
        conditions['$or'] = [
          { signDate: { $gt: checkDate } },
          { $and: [{ isDraft: true, updatedAt: { $gt: checkDate } }] },
        ];
      }
      if (!(user.role === 'provider' && !patient)) {
        conditions.user =
          user.role === 'provider'
            ? mongoose.Types.ObjectId(patient)
            : user._id;
      }
      if (user.role === 'patient') {
        conditions.isDraft = false;
        return await queryPatientNotes(conditions, user);
      } else {
        buildProviderNoteQueryConditions(conditions, user, sharedOnly);
        return await queryProviderNotes(conditions, user, null, practice);
      }
    },
  },
  {
    key: 'sentNotes',
    prototype: '(patient: String, practice: ID, period: String!): [Note]',
    run: async ({ patient, practice, period }, { user }) => {
      if (user.role === 'patient') {
        return [];
      }
      const checkDate = checkDateForPeriod(period || 'all');
      const conditions = { 'shareds.by': user.activeProviderPractice._id };
      if (period !== 'all') {
        conditions['$or'] = [{ signDate: { $gt: checkDate } }];
      }
      return await populateNoteQuery(Note.find(conditions));
    },
  },
  {
    key: 'sentDMResponses',
    prototype: '(practice: ID, period: String!): [Note]',
    run: async ({ practice, period }, { user }) => {
      if (user.role === 'patient') {
        return [];
      }
      const checkDate = checkDateForPeriod(period || 'all');
      const conditions = {
        creator:
          user.activeProviderPractice?._id || user.activeProviderPractice,
      };
      if (period !== 'all') {
        conditions['signDate'] = { $gt: checkDate };
      }
      return await queryProviderNotes(conditions, user, null, practice, true);
    },
  },
  {
    key: 'responseNotes',
    prototype: '(practice: ID, period: String!): [Note]',
    run: async ({ practice, period }, { user }) => {
      if (user.role === 'patient') {
        return [];
      }
      const checkDate = checkDateForPeriod(period || 'all');
      const conditions = {
        isDraft: false,
        signDate: { $exists: true },
        $or: [
          {
            'shares.with':
              user.activeProviderPractice?._id || user.activeProviderPractice,
          },
          {
            'directMessageShare.to':
              user.activeProviderPractice?._id || user.activeProviderPractice,
          },
        ],
      };
      if (period !== 'all') {
        conditions['signDate'] = { $gt: checkDate };
      }

      const aggregateResult = await Note.aggregate([
        {
          $match: conditions,
        },
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
          $sort: { signDate: -1, updatedAt: -1 },
        },
      ]);
      return await populateNoteQuery(aggregateResult);
    },
  },
  {
    key: 'shareNote',
    prototype: '(provider: ID!, note: ID!): Boolean',
    mutation: true,
    run: async ({ provider: providerId, note: noteId }, { user }) => {
      const note = await Note.findById(noteId);
      if (!note) {
        throw new Error('Note not found');
      }
      const provider = await User.findById(providerId);
      if (!provider) {
        throw new Error('Provider not found');
      }
      for (let share of note.shares) {
        if (
          share.with.toString() === provider.activeProviderPractice.toString()
        ) {
          // If the note is already shared with this provider, we just send the chat
          const room = await getChatRoom([user._id, providerId], note.user._id);
          const noteObject = await populateNoteQuery(
            Note.findOne({ _id: noteId })
          );
          sendChat(user, {
            chatId: room._id,
            memberIds: [providerId],
            note: noteObject,
          });

          socketManager.sendMessage(provider._id, SOCKET_EVENTS.PATIENT_NOTES, {
            patient: note.user,
          });

          return true;
        }
      }

      const session = await mongoose.startSession();

      await session.withTransaction(async () => {
        if (!note.shares) {
          note.shares = [];
        }
        note.shares.push({
          by: user.activeProviderPractice?._id || user.activeProviderPractice,
          with: provider.activeProviderPractice,
          at: new Date(),
        });

        await Note.updateOne(
          { _id: noteId },
          { shares: note.shares },
          { session }
        );
      });

      session.endSession();

      const room = await getChatRoom([user._id, providerId], note.user._id);
      const noteObject = await populateNoteQuery(Note.findOne({ _id: noteId }));
      sendChat(user, {
        chatId: room._id,
        memberIds: [providerId],
        note: noteObject,
      });

      socketManager.sendMessage(provider._id, SOCKET_EVENTS.PATIENT_NOTES, {
        patient: note.user,
      });

      return true;
    },
  },
  {
    key: 'readNote',
    prototype: '(note: ID!): Boolean',
    mutation: true,
    run: async ({ note: noteId }, { user }) => {
      const note = await Note.findOneAndUpdate(
        { _id: noteId, isDraft: false, seen: { $ne: user._id } },
        { $push: { seen: user._id } }
      );

      if (!note) {
        return false;
      }
      socketManager.sendMessage(user._id, SOCKET_EVENTS.PATIENT_NOTES);
      return true;
    },
  },
];
