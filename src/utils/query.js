import uniqBy from 'lodash/uniqBy';
import mongoose from 'mongoose';

import {
  Contact,
  ProviderPractice,
  PatientPractice,
  User,
  GroupUser,
} from '../db';

const { ObjectId } = mongoose.Types;

export const populateProvider = (providerField) => ({
  path: providerField,
  populate: {
    path: 'activeProviderPractice',
    populate: 'practice',
  },
});

export const populateNote = (noteField) => ({
  path: noteField,
  populate: [
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
  ],
});

export const populateCareplan = (cpField) => ({
  path: cpField,
  populate: [
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
  ],
});

export const getProviderContactIdsFromProvider = async (user) => {
  const providerPractices = await ProviderPractice.find(
    {
      user: user._id,
    },
    { practice: 1 }
  );
  const practiceIds = providerPractices.map(
    (providerPractice) => providerPractice.practice
  );
  const internalProviders = await ProviderPractice.find({
    practice: { $in: practiceIds },
    user: {
      $ne: user,
    },
  });
  const internalProviderIds = (internalProviders || []).map((ip) => ip.user);
  const contacts = await Contact.find({
    $or: [{ user1: user }, { user2: user }],
  });
  const individualIds = (contacts || []).map((c) => {
    if (c.user1.toString() === user._id.toString()) {
      return c.user2;
    }
    return c.user1;
  });

  const mergedIds = uniqBy([...internalProviderIds, ...individualIds], (v) =>
    v.toString()
  );

  return mergedIds;
};

export const getProviderContactIdsFromPatient = async (user) => {
  const providers = await PatientPractice.aggregate([
    {
      $match: {
        user: ObjectId(user._id),
      },
    },
    {
      $lookup: {
        from: 'providerpractices',
        localField: 'practice',
        foreignField: 'practice',
        as: 'providerpractice',
      },
    },
    {
      $unwind: '$providerpractice',
    },
    {
      $replaceRoot: { newRoot: '$providerpractice' },
    },
  ]);

  const ids = (providers || []).map((p) => p.user);

  return ids;
};

export const aggregateUsers = async ({
  ids,
  role,
  including = true,
  query,
  skip,
  limit,
}) => {
  const ID_MATCH = {
    INCLUDING: { _id: { $in: ids } },
    EXCLUDING: { _id: { $nin: ids } },
  };
  const idMatch = including ? ID_MATCH.INCLUDING : ID_MATCH.EXCLUDING;

  const users = await User.aggregate([
    {
      $addFields: {
        fullName: {
          $concat: ['$firstName', ' ', '$lastName'],
        },
      },
    },
    {
      $match: {
        role,
        fullName: new RegExp(query, 'ig'),
        ...idMatch,
      },
    },
    {
      $lookup: {
        from: 'providerpractices',
        localField: 'activeProviderPractice',
        foreignField: '_id',
        as: 'activeProviderPractice',
      },
    },
    {
      $unwind: {
        path: '$activeProviderPractice',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: 'practices',
        localField: 'activeProviderPractice.practice',
        foreignField: '_id',
        as: 'activeProviderPractice.practice',
      },
    },
    {
      $unwind: {
        path: '$activeProviderPractice.practice',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $sort: {
        fullName: 1,
      },
    },
    {
      $skip: skip,
    },
    {
      $limit: limit,
    },
  ]);

  return users || [];
};

export const checkProviderProviderContact = async (userId1, userId2) => {
  const user1 = await User.findById(userId1).populate({
    path: 'activeProviderPractice',
    populate: 'practice',
  });
  const user2 = await User.findById(userId2).populate({
    path: 'activeProviderPractice',
    populate: 'practice',
  });

  if (
    String(user1.activeProviderPractice?.practice._id) ===
    String(user2.activeProviderPractice?.practice._id)
  ) {
    return true;
  }

  const existing = await Contact.exists({
    $or: [
      { user1: userId1, user2: userId2 },
      { user1: userId2, user2: userId1 },
    ],
  });

  return existing;
};

export const checkProviderPatientContact = async (userId1, userId2) => {
  const provider = await User.findById(userId1).populate({
    path: 'activeProviderPractice',
    populate: 'practice',
  });

  const existing = await PatientPractice.exists({
    practice: provider.activeProviderPractice?.practice,
    user: userId2,
  });

  return existing;
};

export const checkPatientPatientContact = async (userId1, userId2) => {
  const existing = await Contact.exists({
    $or: [
      { user1: userId1, user2: userId2 },
      { user1: userId2, user2: userId1 },
    ],
  });

  return existing;
};

export const isPracticeAdmin = async (practice, user) => {
  const existing = await ProviderPractice.exists({
    practice,
    user,
    isAdmin: true,
  });

  return existing;
};

export const isGroupAdmin = async (group, user) => {
  const existing = await GroupUser.exists({
    group,
    user,
    isAdmin: true,
  });

  return existing;
};
