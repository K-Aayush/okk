import uniq from 'lodash/uniq';

import { Chat, ChatMessage, ChatMember } from '../db';
import { getChatRoom } from '../services/chat';
import {
  equalId,
  MIN_DATE,
  populateProvider,
  populateNote,
  populateCareplan,
} from '../utils';

const INITIAL_MESSAGE_LOAD_COUNT = 30;

const fetchUnreadMessageCount = async (user) => {
  const myRooms = await Chat.find({ members: user._id }).lean();
  const myRoomIds = myRooms?.map((r) => r._id) || [];

  const unreadCounts = await ChatMessage.aggregate([
    {
      $match: {
        chat: { $in: myRoomIds },
        sender: { $ne: user._id },
      },
    },
    {
      $lookup: {
        from: 'chatmembers',
        let: { chatId: '$chat' },
        as: 'chatMembers',
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$chat', '$$chatId'] },
                  { $eq: ['$member', user._id] },
                ],
              },
            },
          },
        ],
      },
    },
    {
      $unwind: {
        path: '$chatMembers',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        lastReadAt: {
          $ifNull: ['$chatMembers.lastReadAt', MIN_DATE],
        },
      },
    },
    {
      $match: {
        $expr: {
          $gt: ['$createdAt', '$chatMembers.lastReadAt'],
        },
      },
    },
    {
      $group: {
        _id: '$chat',
        unreadCount: { $sum: 1 },
      },
    },
  ]);

  return unreadCounts || [];
};

export default [
  {
    key: 'fetchOrCreateChat',
    prototype: '(chat: ChatInput!): Chat',
    mutation: true,
    run: async ({ chat }, { user }) => {
      const { memberIds, referredPatientId, group } = chat;
      const room = await getChatRoom(
        [...memberIds, user._id],
        referredPatientId,
        group
      );

      const messages = await ChatMessage.find({
        chat: room,
      })
        .populate([
          populateProvider('sender'),
          populateNote('note'),
          populateCareplan('careplan'),
        ])
        .sort({
          createdAt: 1,
        })
        // Fetch All Now
        // .limit(INITIAL_MESSAGE_LOAD_COUNT);
        .lean();

      await ChatMember.findOneAndUpdate(
        {
          chat: room,
          member: user,
        },
        {
          lastReadAt: new Date(),
        },
        {
          upsert: true,
        }
      );

      return {
        _id: room._id,
        members: room.members,
        group: room.group,
        referredPatient: room.referredPatient,
        createdAt: room.createdAt,
        messages: messages || [],
      };
    },
  },
  {
    key: 'chat',
    prototype: '(id: String!): Chat',
    run: async ({ id }) => {
      const room = await Chat.findById(id)
        .populate([populateProvider('members'), 'referredPatient'])
        .exec();

      let messages;

      if (room) {
        messages = await ChatMessage.find({
          chat: room,
        })
          .sort({
            createdAt: 1,
          })
          .populate([
            populateProvider('sender'),
            populateNote('note'),
            populateCareplan('careplan'),
          ])
          // Fetch All Now
          // .limit(INITIAL_MESSAGE_LOAD_COUNT);
          .lean();
      }

      return {
        _id: room._id,
        members: room.members,
        group: room.group,
        referredPatient: room.referredPatient,
        createdAt: room.createdAt,
        messages: messages || [],
      };
    },
  },
  {
    key: 'unreadMessageCount',
    prototype: ': Int',
    run: async (_, { user }) => {
      const unreadCounts = await fetchUnreadMessageCount(user);

      const total = unreadCounts.reduce((acc, cur) => acc + cur.unreadCount, 0);

      return total;
    },
  },
  {
    key: 'recentChats',
    prototype: '(query: String!, offset: Int, limit: Int): [ChatMessage]',
    run: async ({ query, offset = 0, limit }, { user }) => {
      const myRooms = await Chat.find({ members: user._id }).lean();
      const myRoomIds = myRooms?.map((r) => r._id) || [];
      let filter = {};

      if (query) {
        filter = {
          text: new RegExp(query, 'ig'),
          chat: { $in: myRoomIds },
        };
      } else {
        const lastMessages = myRooms?.map((r) => r.lastChatMessage);
        filter = {
          _id: { $in: lastMessages },
        };
      }

      const messages = await ChatMessage.find(filter)
        .sort({
          updatedAt: -1,
          chat: 1,
        })
        .populate({
          path: 'sender',
          select: 'firstName lastName',
        })
        .populate({
          path: 'chat',
          select: '_id members referredPatient',
          populate: [
            {
              path: 'members',
              select: '_id firstName lastName photo memberDesignation role',
            },
            {
              path: 'referredPatient',
              select: '_id firstName lastName',
            },
            populateNote('note'),
            populateCareplan('careplan'),
          ],
        })
        .skip(offset)
        .limit(limit);

      const unreadCounts = await fetchUnreadMessageCount(user);

      messages.forEach((message) => {
        const found = unreadCounts.find((uc) =>
          equalId(uc._id, message.chat._id)
        );
        message.chat.unreadCount = found?.unreadCount || 0;
      });

      return messages;
    },
  },
];
