import mongoose from 'mongoose';
import { Practice, ProviderPractice, User } from '../../db';
import { checkExistingDMAddress } from '../../utils/direct-message';

export default [
  {
    key: 'practice',
    prototype: '(id: ID): Practice!',
    run: async ({ id }) => {
      return await Practice.findById(id);
    },
  },
  {
    key: 'practices',
    prototype: ': [Practice!]',
    run: async ({}, {}) => {
      return await Practice.find();
    },
  },
  {
    key: 'updatePractice',
    prototype: '(id: ID, group: PracticeInput!): Practice',
    mutation: true,
    run: async ({ id, group }, { user }) => {
      if (id) {
        let existingPractice = await Practice.findById(id).lean();
        if (!existingPractice) {
          throw Error('Practice does not exist!');
        }
        existingPractice = { ...existingPractice, ...group };

        const dmDomain = existingPractice.directMessageDomain;
        const existingAddress = await checkExistingDMAddress(dmDomain, id);
        if (existingAddress) {
          throw Error(
            `Direct Message domain already exists${
              existingAddress.message ? ` (${existingAddress.message})` : ''
            }`
          );
        }

        await Practice.findByIdAndUpdate(id, existingPractice);
        return existingPractice;
      }
      throw Error('Practice does not exist!');
    },
  },
  {
    key: 'practiceMembers',
    prototype: '(id: ID!): [PracticeMember!]',
    run: async ({ id: practiceId }, {}) => {
      const practice = await Practice.findById(practiceId);
      if (!practice) {
        throw Error('Practice does not exists');
      }
      let aggregate = [
        {
          $match: {
            practice: mongoose.Types.ObjectId(practiceId),
            deactivated: { $ne: true },
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
            localField: 'user.activeProviderPractice',
            foreignField: '_id',
            as: 'activeProviderPractice',
          },
        },
        { $unwind: '$activeProviderPractice' },
        {
          $match: {
            'activeProviderPractice.practice':
              mongoose.Types.ObjectId(practiceId),
          },
        },
      ];
      if (practice.isGazuntitePractice) {
        aggregate = aggregate.concat([
          {
            $lookup: {
              from: 'providerpractices',
              let: {
                activePracticeId: '$activeProviderPractice.practice',
                userId: '$user._id',
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$user', '$$userId'] },
                        { $ne: ['$deactivated', true] },
                        {
                          $ne: [
                            '$practice',
                            mongoose.Types.ObjectId(practiceId),
                          ],
                        },
                      ],
                    },
                  },
                },
                {
                  $lookup: {
                    from: 'practices',
                    localField: 'practice',
                    foreignField: '_id',
                    as: 'practice',
                  },
                },
                { $unwind: '$practice' },
                {
                  $addFields: {
                    isPrimaryPractice: {
                      $eq: ['$practice._id', '$$activePracticeId'],
                    },
                  },
                },
              ],
              as: 'otherPractices',
            },
          },
        ]);
      }

      const members = await ProviderPractice.aggregate(aggregate);
      return members;
    },
  },
  {
    key: 'practiceMembersTrackingStatus',
    prototype: '(id: ID!): [PracticeMemberTrackingStatus!]',
    run: async ({ id }, { user }) => {
      return await ProviderPractice.find({ practice: id })
        .populate('user')
        .lean();
    },
  },
  {
    key: 'updatePracticeMember',
    prototype:
      '(id: ID!, disableTracking: Boolean!, directMessageAddress: String, practiceMemberships: [AssignPracticeMemberInput!]): Boolean',
    mutation: true,
    run: async (
      { id, disableTracking, directMessageAddress, practiceMemberships },
      { user }
    ) => {
      const providerPractice = await ProviderPractice.findById(id);
      if (!providerPractice) {
        throw Error('Can not find the member');
      }
      const userId = providerPractice.user;

      const existingAddress = await checkExistingDMAddress(
        directMessageAddress,
        id
      );

      if (existingAddress) {
        throw Error(
          `Email already exists${
            existingAddress.message ? ` (${existingAddress.message})` : ''
          }`
        );
      }

      // update disableTracking field & directMessageAddress
      await ProviderPractice.findByIdAndUpdate(id, {
        disableTracking,
        directMessageAddress,
      });

      // split deactivated and activated practice ids
      const deactivatedPractices = [];
      const activatedPractices = [];
      if (!practiceMemberships || practiceMemberships.length === 0) {
        return true;
      }
      practiceMemberships.forEach((elem) => {
        if (elem.isMember) {
          activatedPractices.push(mongoose.Types.ObjectId(elem.practice));
        } else {
          deactivatedPractices.push(mongoose.Types.ObjectId(elem.practice));
        }
      });

      // deactivate practices
      await ProviderPractice.updateMany(
        {
          user: userId,
          practice: { $in: deactivatedPractices },
        },
        { deactivated: true }
      );

      // activate practices for existing membership or create membership(ProviderPractice) if not exists
      for (const practiceId of activatedPractices) {
        const result = await ProviderPractice.updateOne(
          {
            user: userId,
            practice: practiceId,
          },
          {
            $set: {
              deactivated: false,
            },
            $setOnInsert: {
              practice: practiceId,
              user: userId,
            },
          },
          {
            upsert: true,
            setDefaultsOnInsert: true,
          }
        );
      }

      // Updating medical licenses for user using mongodb hook
      await User.findByIdAndUpdate(userId, {});
      return true;
    },
  },
];
