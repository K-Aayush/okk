import mongoose from 'mongoose';

import { ERROR_MESSAGE } from '../constants';
import {
  Contact,
  Invite,
  ProviderPractice,
  PatientPractice,
  User,
  GroupUser,
  Practice,
  Group,
} from '../db';
import {
  checkProviderProviderContact,
  checkProviderPatientContact,
  isPracticeAdmin,
  isGroupAdmin,
  equalId,
  createInvitationUrl,
  createContactUrl,
  getNotificationInfo,
  checkDuplicatedInfo,
  isPharmacist,
} from '../utils';
import socketManager from '../services/socket-manager';
import SOCKET_EVENTS from '../services/socket-manager/constants';
import { sendContactEmail, sendOnboardingEmail } from '../services/mailer';
import { sendContactSMS, sendOnboardingSMS } from '../services/twilio';

const getCategorizedInvites = async (
  user,
  received,
  category,
  page = 0,
  pageSize = 1000
) => {
  const match = {};
  const userLookup = (received, role) => [
    {
      $lookup: {
        from: 'users',
        let: { user: received ? '$inviter' : '$invitee' },
        as: received ? 'inviter' : 'invitee',
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ['$$user', '$_id'] }, { $eq: ['$role', role] }],
              },
            },
          },
        ],
      },
    },
    {
      $unwind: received ? '$inviter' : '$invitee',
    },
    {
      $project: {
        _id: 1,
        [received ? 'inviter' : 'invitee']: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  ];
  const groupLookup = (received) => [
    {
      $match: received ? {} : { invitee: { $exists: false } },
    },
    {
      $lookup: {
        from: 'practices',
        let: { practice: '$practice' },
        as: 'practice',
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ['$$practice', '$_id'],
              },
            },
          },
        ],
      },
    },
    {
      $unwind: {
        path: '$practice',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: 'groups',
        let: { group: '$group' },
        as: 'group',
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ['$$group', '$_id'],
              },
            },
          },
        ],
      },
    },
    {
      $unwind: {
        path: '$group',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 1,
        practice: 1,
        group: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  ];
  let lookup;

  if (received) {
    match.invitee = user._id;
  } else {
    match.inviter = user._id;
  }

  if (category === 'providers') {
    match.group = { $exists: false };
    match.practice = { $exists: false };
    lookup = userLookup(received, 'provider');
  } else if (category === 'patients') {
    match.group = { $exists: false };
    match.practice = { $exists: false };
    lookup = userLookup(received, 'patient');
  } else if (category === 'groups') {
    match.$or = [
      {
        group: { $exists: true },
      },
      {
        practice: { $exists: true },
      },
    ];
    lookup = groupLookup(received);
  }

  const stages = [
    {
      $match: match,
    },
    ...lookup,
    {
      $sort: {
        updatedAt: -1,
      },
    },
  ];

  const gross = await Invite.aggregate(stages).count('total');
  const total = gross[0]?.total || 0;

  const invites = await Invite.aggregate([
    ...stages,
    {
      $skip: page * pageSize,
    },
    {
      $limit: pageSize,
    },
  ]);

  return {
    received,
    category,
    invites: invites || [],
    total,
  };
};

export default [
  {
    key: 'individualInvites',
    prototype:
      '(received: Boolean!, category: String!, page: Int, pageSize: Int): IndividualInvites',
    run: async (
      { received, category, page = 0, pageSize = 1000 },
      { user }
    ) => {
      const data = await getCategorizedInvites(
        user,
        received,
        category,
        page,
        pageSize
      );

      return data;
    },
  },
  {
    key: 'allInvites',
    prototype: '(page: Int, pageSize: Int): [IndividualInvites]',
    run: async ({ page = 0, pageSize = 1000 }, { user }) => {
      const receivedArr = [true, false];
      const categoriesArr = ['providers', 'patients', 'groups'];
      const allInvites = [];

      for (const received of receivedArr) {
        for (const category of categoriesArr) {
          try {
            const invites = await getCategorizedInvites(
              user,
              received,
              category,
              page,
              pageSize
            );
            allInvites.push(invites);
          } catch (err) {
            console.error(err);
          }
        }
      }

      return allInvites;
    },
  },
  {
    key: 'adminPracticeInvites',
    prototype: ': [PracticeInvite]',
    run: async (_, { user }) => {
      if (user.role === 'patient') {
        throw Error(ERROR_MESSAGE.PROVIDERS_ONLY);
      }

      const practiceInvites = await ProviderPractice.aggregate([
        {
          $match: {
            user: user._id,
            isAdmin: true,
          },
        },
        {
          $lookup: {
            from: 'invites',
            let: { practice: '$practice' },
            as: 'invites',
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ['$$practice', '$practice'],
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  received: {
                    $sum: { $cond: [{ $ifNull: ['$invitee', false] }, 0, 1] },
                  },
                  sent: {
                    $sum: { $cond: [{ $ifNull: ['$invitee', false] }, 1, 0] },
                  },
                },
              },
            ],
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
        {
          $unwind: '$practice',
        },
        {
          $project: {
            practice: 1,
            totalReceived: {
              $ifNull: [{ $first: '$invites.received' }, 0],
            },
            totalSent: {
              $ifNull: [{ $first: '$invites.sent' }, 0],
            },
          },
        },
      ]);

      return practiceInvites || [];
    },
  },
  {
    key: 'adminGroupInvites',
    prototype: ': [GroupInvite]',
    run: async (_, { user }) => {
      const groupInvites = await GroupUser.aggregate([
        {
          $match: {
            user: user._id,
            isAdmin: true,
          },
        },
        {
          $lookup: {
            from: 'invites',
            let: { group: '$group' },
            as: 'invites',
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ['$$group', '$group'],
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  received: {
                    $sum: { $cond: [{ $ifNull: ['$invitee', false] }, 0, 1] },
                  },
                  sent: {
                    $sum: { $cond: [{ $ifNull: ['$invitee', false] }, 1, 0] },
                  },
                },
              },
            ],
          },
        },
        {
          $lookup: {
            from: 'groups',
            localField: 'group',
            foreignField: '_id',
            as: 'group',
          },
        },
        {
          $unwind: '$group',
        },
        {
          $project: {
            group: 1,
            totalReceived: {
              $ifNull: [{ $first: '$invites.received' }, 0],
            },
            totalSent: {
              $ifNull: [{ $first: '$invites.sent' }, 0],
            },
          },
        },
      ]);

      return groupInvites;
    },
  },
  {
    key: 'inviteExistingUsersToGroup',
    prototype:
      '(inviteeIds: [ID]!, groupId: ID!, isPractice: Boolean!): Boolean',
    mutation: true,
    run: async ({ inviteeIds, groupId, isPractice }, { user }) => {
      const isAdmin = isPractice
        ? await isPracticeAdmin(groupId, user)
        : await isGroupAdmin(groupId, user);
      if (!isAdmin) {
        throw Error(ERROR_MESSAGE.ADMINS_ONLY);
      }

      for (const inviteeId of inviteeIds) {
        try {
          if (isPractice) {
            const invitee = await User.findById(inviteeId);
            if (invitee.role === 'patient') {
              throw Error(ERROR_MESSAGE.PATIENTS_NOT_ALLOWED_TO_JOIN_PRACTICE);
            }
          }

          let alreadyJoined;
          if (isPractice) {
            alreadyJoined = await ProviderPractice.exists({
              practice: groupId,
              user: inviteeId,
            });
          } else {
            alreadyJoined = await GroupUser.exists({
              group: groupId,
              user: inviteeId,
            });
          }

          if (alreadyJoined) {
            throw Error(ERROR_MESSAGE.ALREADY_MEMBER);
          }

          const groupParams = isPractice
            ? { practice: groupId }
            : { group: groupId };

          await Invite.findOneAndUpdate(
            {
              ...groupParams,
              inviter: user,
              invitee: inviteeId,
            },
            {},
            { upsert: true }
          );

          const group = isPractice
            ? await Practice.findById(groupId)
            : await Group.findById(groupId);
          const invitee = await User.findById(inviteeId);

          const inviterLabel = `${user.firstName} ${user.lastName}`;
          const link = await createContactUrl(invitee);
          const params = {
            subject: `Gazuntite Join Request`,
            header: `Welcome to ${group.name}`,
            line: `You have been invited by ${inviterLabel} to join ${group.name}`,
            link,
          };

          const { email, sms } = await getNotificationInfo(invitee);
          //disable for patient
          if (invitee.role !== 'patient') {
            email && sendContactEmail(email, params);
            sms && sendContactSMS(sms, params);
          }
        } catch (err) {
          console.error(err);
        }

        socketManager.sendMessage(inviteeId, SOCKET_EVENTS.INVITE_UPDATE);
      }

      return true;
    },
  },
  {
    key: 'requestToJoinGroup',
    prototype: '(groupId: ID!, isPractice: Boolean!): Boolean',
    mutation: true,
    run: async ({ groupId, isPractice }, { user }) => {
      if (isPractice) {
        if (user.role === 'patient') {
          throw Error(ERROR_MESSAGE.PATIENTS_NOT_ALLOWED_TO_JOIN_PRACTICE);
        }
      }

      let alreadyJoined;
      if (isPractice) {
        alreadyJoined = await ProviderPractice.exists({
          practice: groupId,
          user: user._id,
        });
      } else {
        alreadyJoined = await GroupUser.exists({
          group: groupId,
          user: user._id,
        });
      }

      if (alreadyJoined) {
        throw Error(ERROR_MESSAGE.ALREADY_MEMBER);
      }

      const groupParams = isPractice
        ? { practice: groupId }
        : { group: groupId };

      await Invite.findOneAndUpdate(
        {
          ...groupParams,
          inviter: user,
        },
        {},
        { upsert: true }
      );

      const group = isPractice
        ? await Practice.findById(groupId)
        : await Group.findById(groupId);
      const admins = isPractice
        ? await ProviderPractice.find({
            practice: groupId,
            isAdmin: true,
          }).populate('user')
        : await GroupUser.find({
            group: groupId,
            isAdmin: true,
          }).populate('user');

      const inviterLabel =
        `${user.firstName} ${user.lastName}` +
        (user.role === 'provider' ? ` (${user.memberDesignation})` : '');
      const params = {
        subject: `Gazuntite Join Request`,
        header: `Gazuntite Join Request`,
        line: `${inviterLabel} sent a request to join ${group.name}`,
        link: '',
      };

      for (const admin of admins) {
        params.link = await createContactUrl(admin.user);
        const { email, sms } = await getNotificationInfo(admin.user);
        //disable for patient
        if (admin.user?.role !== 'patient') {
          email && sendContactEmail(email, params);
          sms && sendContactSMS(sms, params);
        }
        socketManager.sendMessage(admin.user._id, SOCKET_EVENTS.INVITE_UPDATE);
      }

      return true;
    },
  },
  {
    key: 'inviteExistingUser',
    prototype: '(inviteeId: ID!): Boolean',
    mutation: true,
    run: async ({ inviteeId }, { user }) => {
      const invitee = await User.findById(inviteeId);
      let alreadyInContact;

      if (user.role === 'provider') {
        if (!user.activeProviderPractice) {
          const groupName = isPharmacist(user) ? 'Pharmacy' : 'Practice';
          throw Error(`Please create or join a ${groupName} first.`);
        }

        if (invitee.role === 'provider') {
          alreadyInContact = await checkProviderProviderContact(
            user._id,
            inviteeId
          );
        } else if (invitee.role === 'patient') {
          alreadyInContact = await checkProviderPatientContact(
            user._id,
            inviteeId
          );
        }

        if (alreadyInContact) {
          throw Error(ERROR_MESSAGE.ALREADY_CONTACT);
        }
      } else if (user.role === 'patient') {
        if (invitee.role === 'provider') {
          alreadyInContact = await checkProviderPatientContact(
            inviteeId,
            user._id
          );
        } else if (invitee.role === 'patient') {
          alreadyInContact = await checkPatientPatientContact(
            inviteeId,
            user._id
          );
        }

        if (alreadyInContact) {
          throw Error(ERROR_MESSAGE.ALREADY_CONTACT);
        }
      }

      await Invite.findOneAndUpdate(
        {
          inviter: user,
          invitee: inviteeId,
        },
        {},
        { upsert: true }
      );

      const inviterLabel =
        `${user.firstName} ${user.lastName}` +
        (user.role === 'provider' ? ` (${user.memberDesignation})` : '');
      const link = await createContactUrl(invitee);
      const params = {
        subject: `Gazuntite Contact Request`,
        header: `Gazuntite Contact Request`,
        line: `${inviterLabel} has sent you a contact request.`,
        link,
      };
      // disable for patient
      if (invitee.role !== 'patient') {
        const { email, sms } = await getNotificationInfo(invitee);
        email && sendContactEmail(email, params);
        sms && sendContactSMS(sms, params);
      }
      socketManager.sendMessage(invitee, SOCKET_EVENTS.INVITE_UPDATE);

      return true;
    },
  },
  {
    key: 'inviteNewUserToGroup',
    prototype:
      '(fullName: String!, email: String!, phone: String!, role: String!, groupId: ID!, isPractice: Boolean!): Boolean',
    mutation: true,
    run: async (
      { fullName, email, phone, role, groupId, isPractice },
      { user }
    ) => {
      const info = {
        email: {
          value: email,
          message: ERROR_MESSAGE.DUPLICATE_EMAIL,
        },
        phone: {
          value: phone,
          message: ERROR_MESSAGE.DUPLICATE_PHONE_NUMBER,
        },
      };

      const errorMessage = await checkDuplicatedInfo(true, info);

      if (errorMessage !== null) {
        throw Error(errorMessage);
      }

      const isAdmin = isPractice
        ? await isPracticeAdmin(groupId, user)
        : await isGroupAdmin(groupId, user);
      if (!isAdmin) {
        throw Error(ERROR_MESSAGE.ADMINS_ONLY);
      }

      if (isPractice) {
        const invitee = await User.findById(inviteeId);
        if (invitee.role === 'patient') {
          throw Error(ERROR_MESSAGE.PATIENTS_NOT_ALLOWED_TO_JOIN_PRACTICE);
        }
      }

      const firstName = fullName.split(' ').slice(0, -1).join(' ');
      const lastName = fullName.split(' ').slice(-1).join(' ');
      let newUser;

      const session = await mongoose.startSession();

      await session.withTransaction(async () => {
        newUser = await User.findOneAndUpdate(
          {
            role,
            firstName,
            lastName,
            email,
            phones: {
              mobile: phone,
            },
          },
          {},
          { session, upsert: true, new: true }
        );

        const groupParams = isPractice
          ? { practice: groupId }
          : { group: groupId };

        await Invite.findOneAndUpdate(
          {
            ...groupParams,
            inviter: user,
            invitee: newUser,
          },
          {},
          { session, upsert: true }
        );

        const group = isPractice
          ? await Practice.findById(groupId)
          : await Group.findById(groupId);

        const inviterLabel =
          `${user.firstName} ${user.lastName}` +
          (user.role === 'provider' ? ` (${user.memberDesignation})` : '');
        const invitationLink = await createInvitationUrl(
          newUser._id.toString(),
          role
        );
        const params = {
          subject: `You have been invited to sign up Gazuntite`,
          header: `Welcome to Gazuntite ${group.name}`,
          line: `You have been invited by ${inviterLabel} to join ${group.name}`,
          link: invitationLink,
        };
        const { email: notificationEmail, sms } = await getNotificationInfo(
          newUser
        );
        notificationEmail && sendOnboardingEmail(notificationEmail, params);
        sms && sendOnboardingSMS(sms, params);
        socketManager.sendMessage(user, SOCKET_EVENTS.INVITE_UPDATE);
      });

      session.endSession();

      return true;
    },
  },
  {
    key: 'inviteNewUser',
    prototype:
      '(fullName: String!, email: String!, phone: String!, role: String!): User',
    mutation: true,
    run: async ({ fullName, email, phone, role }, { user }) => {
      const info = {
        email: {
          value: email,
          message: ERROR_MESSAGE.DUPLICATE_EMAIL,
        },
        phone: {
          value: phone,
          message: ERROR_MESSAGE.DUPLICATE_PHONE_NUMBER,
        },
      };

      const errorMessage = await checkDuplicatedInfo(true, info);

      if (errorMessage !== null) {
        throw Error(errorMessage);
      }

      const firstName = fullName.split(' ').slice(0, -1).join(' ');
      const lastName = fullName.split(' ').slice(-1).join(' ');
      let newUser;

      if (user.role === 'provider') {
        if (!user.activeProviderPractice) {
          const groupName = isPharmacist(user) ? 'Pharmacy' : 'Practice';
          throw Error(`Please create or join a ${groupName} first.`);
        }

        if (role === 'providers') {
          const session = await mongoose.startSession();

          await session.withTransaction(async () => {
            const newUsers = await User.create(
              [
                {
                  role: 'provider',
                  firstName,
                  lastName,
                  email,
                  phones: {
                    mobile: phone,
                  },
                },
              ],
              { session }
            );
            newUser = newUsers[0];

            await Invite.create(
              [
                {
                  inviter: user,
                  invitee: newUser,
                },
              ],
              { session }
            );
          });

          session.endSession();
        } else if (role === 'patients') {
          const session = await mongoose.startSession();

          await session.withTransaction(async () => {
            const newUsers = await User.create(
              [
                {
                  role: 'patient',
                  firstName,
                  lastName,
                  email,
                  phones: {
                    mobile: phone,
                  },
                },
              ],
              { session }
            );
            newUser = newUsers[0];

            await PatientPractice.create(
              [
                {
                  practice: user.activeProviderPractice?.practice,
                  user: newUser,
                },
              ],
              { session }
            );
          });

          session.endSession();
        }
      } else {
        if (role === 'providers') {
          throw Error('Patient can not add a provider manually.');
        }

        const session = await mongoose.startSession();

        await session.withTransaction(async () => {
          const newUsers = await User.create(
            [
              {
                role: 'patient',
                firstName,
                lastName,
                email,
                phones: {
                  mobile: phone,
                },
              },
            ],
            { session }
          );
          newUser = newUsers[0];

          await Invite.create(
            [
              {
                inviter: user,
                invitee: newUser,
              },
            ],
            { session }
          );
        });

        session.endSession();
      }

      const inviterLabel =
        `${user.firstName} ${user.lastName}` +
        (user.role === 'provider' ? ` (${user.memberDesignation})` : '');
      const invitationLink = await createInvitationUrl(
        newUser._id.toString(),
        role
      );

      const params = {
        subject: `You have been invited to sign up Gazuntite`,
        header: `Welcome to Gazuntite`,
        line: `You have been invited by ${inviterLabel} to join the Gazuntite network.`,
        link: invitationLink,
      };
      const { email: notificationEmail, sms } = await getNotificationInfo(
        newUser
      );
      notificationEmail && sendOnboardingEmail(notificationEmail, params);
      sms && sendOnboardingSMS(sms, params);

      return newUser;
    },
  },
  {
    key: 'acceptOrDeclineInvite',
    prototype: '(id: ID!, accepting: Boolean!): Boolean',
    mutation: true,
    run: async ({ id, accepting }, { user }) => {
      const invite = await Invite.findOne({ _id: id }).populate([
        'group',
        'practice',
        {
          path: 'inviter',
          populate: 'activeProviderPractice',
        },
        {
          path: 'invitee',
          populate: 'activeProviderPractice',
        },
      ]);

      if (!invite) {
        throw Error(ERROR_MESSAGE.INVALID_INVITE);
      }

      // Practice Join
      if (invite.practice) {
        let member;
        if (invite.invitee) {
          if (!equalId(invite.invitee._id, user._id)) {
            throw Error(ERROR_MESSAGE.NO_PERMISSION);
          }
          member = user;
        } else {
          const isAdmin = await isPracticeAdmin(invite.practice, user);
          if (!isAdmin) {
            throw Error(ERROR_MESSAGE.ADMINS_ONLY);
          }
          member = invite.inviter;
        }

        if (accepting) {
          const pp = await ProviderPractice.findOneAndUpdate(
            {
              practice: invite.practice,
              user: member,
            },
            {},
            {
              upsert: true,
              new: true,
            }
          );
          member.activeProviderPractice = pp;
          await member.save();
        }
      }
      // Group Join
      else if (invite.group) {
        let member;
        if (invite.invitee) {
          if (!equalId(invite.invitee._id, user._id)) {
            throw Error(ERROR_MESSAGE.NO_PERMISSION);
          }
          member = user;
        } else {
          const isAdmin = await isGroupAdmin(invite.group, user);
          if (!isAdmin) {
            throw Error(ERROR_MESSAGE.ADMINS_ONLY);
          }
          member = invite.inviter;
        }

        if (accepting) {
          await GroupUser.findOneAndUpdate(
            {
              group: invite.group,
              user: member,
            },
            {},
            {
              upsert: true,
            }
          );
        }
      }
      // Individual
      else {
        if (equalId(invite.invitee._id, id)) {
          throw Error(ERROR_MESSAGE.NO_PERMISSION);
        }

        if (accepting) {
          if (
            invite.inviter.role === 'provider' &&
            invite.invitee.role === 'provider'
          ) {
            await Contact.findOneAndUpdate(
              {
                user1: invite.inviter,
                user2: invite.invitee,
              },
              {},
              {
                upsert: true,
              }
            );
          } else if (
            invite.inviter.role === 'provider' &&
            invite.invitee.role === 'patient'
          ) {
            await PatientPractice.findOneAndUpdate(
              {
                practice: invite.inviter.activeProviderPractice.practice,
                user: invite.invitee,
              },
              {},
              { upsert: true }
            );
          } else if (
            invite.inviter.role === 'patient' &&
            invite.invitee.role === 'provider'
          ) {
            await PatientPractice.findOneAndUpdate(
              {
                practice: invite.invitee.activeProviderPractice.practice,
                user: invite.inviter,
              },
              {},
              { upsert: true }
            );
          } else if (
            invite.inviter.role === 'patient' &&
            invite.invitee.role === 'patient'
          ) {
            await Contact.findOneAndUpdate(
              {
                user1: invite.inviter,
                user2: invite.invitee,
              },
              {},
              { upsert: true }
            );
          }
        }
      }

      socketManager.sendMessage(invite.invitee, SOCKET_EVENTS.INVITE_UPDATE);

      await invite.remove();

      return true;
    },
  },
  {
    key: 'cancelInvite',
    prototype: '(id: ID!): Boolean',
    mutation: true,
    run: async ({ id }, { user }) => {
      const invite = await Invite.findById(id);
      if (!equalId(invite.inviter, user._id)) {
        throw Error(ERROR_MESSAGE.NO_PERMISSION);
      }

      socketManager.sendMessage(invite.invitee, SOCKET_EVENTS.INVITE_UPDATE);

      await invite.remove();

      return true;
    },
  },
];
