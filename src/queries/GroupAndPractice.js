import mongoose from 'mongoose';

import { ERROR_MESSAGE } from '../constants';
import {
  Invite,
  Group,
  GroupUser,
  Practice,
  ProviderPractice,
  User,
} from '../db';
import { equalId } from '../utils';

const { ObjectId } = mongoose.Types;

const getPracticeInfo = async ({ id, user }) => {
  if (user.role === 'patient') {
    throw Error(ERROR_MESSAGE.PROVIDERS_ONLY);
  }

  const existing = await ProviderPractice.exists({
    user,
    practice: id,
  });
  if (!existing) {
    throw Error(ERROR_MESSAGE.NO_PERMISSION);
  }

  const practice = await Practice.findById(id);
  if (!practice) {
    throw Error('Invalid practice');
  }

  const members = await ProviderPractice.find({
    practice: id,
  }).populate(['practice', 'user']);
  const isAdmin = members.some(
    (m) => equalId(m.user._id, user._id) && m.isAdmin
  );

  const invites =
    (await Invite.find({
      practice: id,
      invitee: { $exists: true },
    })
      .populate('invitee')
      .select('_id invitee')) || [];
  const requests =
    (await Invite.find({
      practice: id,
      invitee: { $exists: false },
    })
      .populate('inviter')
      .select('_id inviter')) || [];

  return {
    isAdmin,
    group: practice,
    members,
    invites,
    requests,
  };
};

const getGroupInfo = async ({ id, user }) => {
  const existing = await GroupUser.exists({
    user,
    group: id,
  });
  if (!existing) {
    throw Error(ERROR_MESSAGE.NO_PERMISSION);
  }

  const group = await Group.findById(id);

  if (!group) {
    throw Error('Invalid group');
  }

  const members = await GroupUser.find({
    group: id,
  }).populate(['group', 'user']);
  const isAdmin = members.some(
    (m) => equalId(m.user._id, user._id) && m.isAdmin
  );

  const invites =
    (await Invite.find({
      group: id,
      invitee: { $exists: true },
    })
      .populate('invitee')
      .select('_id invitee')) || [];
  const requests =
    (await Invite.find({
      group: id,
      invitee: { $exists: false },
    })
      .populate('inviter')
      .select('_id inviter')) || [];

  return {
    group,
    isAdmin,
    members,
    invites,
    requests,
  };
};

export default [
  {
    key: 'groupDetails',
    prototype: '(id: ID!): GroupDetails',
    run: async ({ id }, { user }) => {
      const { isAdmin, group, members, invites, requests } = await getGroupInfo(
        { id, user }
      );

      return {
        isAdmin,
        group,
        members,
        invites: isAdmin ? invites : [],
        requests: isAdmin ? requests : [],
      };
    },
  },
  {
    key: 'practiceDetails',
    prototype: '(id: ID!): PracticeDetails',
    run: async ({ id }, { user }) => {
      const { isAdmin, group, members, invites, requests } =
        await getPracticeInfo({ id, user });

      return {
        isAdmin,
        group,
        members,
        invites: isAdmin ? invites : [],
        requests: isAdmin ? requests : [],
      };
    },
  },
  {
    key: 'groupMemberLeads',
    prototype: '(id: ID!, isPractice: Boolean!, query: String): [User]',
    run: async ({ id, isPractice, query }, { user }) => {
      const data = isPractice
        ? await getPracticeInfo({ id, user })
        : await getGroupInfo({ id, user });
      const { isAdmin, members, invites, requests } = data;

      if (!isAdmin) {
        throw Error(ERROR_MESSAGE.ADMINS_ONLY);
      }

      const existingUserIds = [
        ...members.map((m) => ObjectId(m.user._id)),
        ...invites.map((i) => ObjectId(i.invitee._id)),
        ...requests.map((r) => ObjectId(r.inviter._id)),
      ];
      const roles = ['provider'];
      if (!isPractice) {
        roles.push('patient');
      }

      const leads = await User.aggregate([
        {
          $match: {
            _id: { $not: { $in: existingUserIds } },
            role: { $in: roles },
          },
        },
      ])
        .addFields({
          fullName: { $concat: ['$firstName', ' ', '$lastName'] },
        })
        .match({
          fullName: new RegExp(query, 'ig'),
        })
        .project('_id firstName lastName email photo role');

      return leads;
    },
  },
  {
    key: 'createGroup',
    prototype: '(group: GroupInput!): Group',
    mutation: true,
    run: async ({ group }, { user }) => {
      const existing = await Group.exists({ name: group.name });
      if (existing) {
        throw Error(ERROR_MESSAGE.DUPLICATE_GROUP);
      }

      const session = await mongoose.startSession();
      let newGroup;

      await session.withTransaction(async () => {
        newGroup = await Group.findOneAndUpdate(
          { name: group.name },
          {
            ...group,
            createdBy: user,
          },
          {
            session,
            upsert: true,
            new: true,
          }
        );

        await GroupUser.findOneAndUpdate(
          {
            group: newGroup,
            user,
            isAdmin: true,
          },
          {},
          { session, upsert: true }
        );
      });

      return newGroup;
    },
  },
  {
    key: 'updateGroup',
    prototype: '(id: ID!, group: GroupInput!): Group',
    mutation: true,
    run: async ({ id, group }, { user }) => {
      const existing = await GroupUser.exists({
        group: id,
        user,
        isAdmin: true,
      });
      if (!existing) {
        throw Error(ERROR_MESSAGE.ADMINS_ONLY);
      }

      const newGroup = await Group.findByIdAndUpdate(id, group, {
        new: true,
      });
      return newGroup;
    },
  },

  {
    key: 'updatePractice',
    prototype: '(id: ID!, group: PracticeInput!): Practice',
    mutation: true,
    run: async ({ id, group }, { user }) => {
      const existing = await ProviderPractice.exists({
        practice: id,
        user,
        isAdmin: true,
      });
      if (!existing) {
        throw Error(ERROR_MESSAGE.ADMINS_ONLY);
      }

      const newGroup = await Practice.findByIdAndUpdate(id, group, {
        new: true,
      });
      return newGroup;
    },
  },
  {
    key: 'myPractices',
    prototype: ': [Practice]',
    run: async (_, { user }) => {
      if (user.role === 'patient') {
        throw Error(ERROR_MESSAGE.PROVIDERS_ONLY);
      }

      const providerPractices = await ProviderPractice.find({
        user,
      }).populate('practice');

      return providerPractices.map((p) => p.practice);
    },
  },
];
