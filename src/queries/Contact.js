import {
  Contact,
  GroupUser,
  Invite,
  PatientPractice,
  ProviderPractice,
} from '../db';
import { isPharmacist } from '../utils';
import { equalId } from '../utils/mongo';
import {
  aggregateUsers,
  getProviderContactIdsFromPatient,
  getProviderContactIdsFromProvider,
} from '../utils/query';

export default [
  {
    key: 'contacts',
    prototype:
      '(query: String, category: String, page: Int, pageSize: Int): [Contact]',
    run: async (
      { query = '', category, page = 0, pageSize = 100 },
      { user }
    ) => {
      // category can be one of ['providers', 'patients', 'providersPatients', 'groups']
      if (user.role === 'provider') {
        const result = [];
        if (category === 'providers' || category === 'providersPatients') {
          const contactIds = await getProviderContactIdsFromProvider(user);

          const contacts = await aggregateUsers({
            ids: contactIds,
            role: 'provider',
            including: true,
            query,
            skip: page * pageSize,
            limit: pageSize,
          });

          result.push(...contacts);
        }
        if (category === 'patients' || category === 'providersPatients') {
          const providerPractices = await ProviderPractice.find(
            {
              user: user._id,
            },
            { practice: 1 }
          );
          const practiceIds = providerPractices.map(
            (providerPractice) => providerPractice.practice
          );
          const patientIds = (
            await PatientPractice.find({
              practice: { $in: practiceIds },
            })
          ).map((p) => p.user._id);
          const contacts = await aggregateUsers({
            ids: patientIds,
            role: 'patient',
            including: true,
            query,
            skip: page * pageSize,
            limit: pageSize,
          });

          result.push(...contacts);
        }
        if (category === 'groups') {
          const practices = await ProviderPractice.find({
            user,
          }).populate('practice');
          const groups = await GroupUser.find({
            user,
          }).populate('group');

          result.push(
            ...practices?.map((p) => p.practice),
            ...groups?.map((g) => g.group)
          );
        }

        return result;
      } else {
        if (category === 'providers') {
          const contactIds = await getProviderContactIdsFromPatient(user);

          const contacts = await aggregateUsers({
            ids: contactIds,
            role: 'provider',
            including: true,
            query,
            skip: page * pageSize,
            limit: pageSize,
          });

          return contacts;
        } else if (category === 'patients') {
          const friendIds = (
            await Contact.find({
              $or: [{ user1: user }, { user2: user }],
            })
          ).map((c) => {
            if (equalId(c.user1, user._id)) {
              return c.user2;
            }
            return c.user1;
          });

          const contacts = await aggregateUsers({
            ids: friendIds,
            role: 'patient',
            including: true,
            query,
            skip: page * pageSize,
            limit: pageSize,
          });

          return contacts;
        } else {
          const groups = await GroupUser.find({
            user,
          }).populate('group');

          return [...groups?.map((g) => g.group)];
        }
      }
    },
  },
  {
    key: 'leads',
    prototype:
      '(query: String, category: String, page: Int, pageSize: Int): [Lead]',
    run: async (
      { query = '', category, page = 0, pageSize = 100 },
      { user }
    ) => {
      if (user.role === 'provider') {
        if (category === 'providers') {
          const contactIds = await getProviderContactIdsFromProvider(user);

          const contacts = await aggregateUsers({
            ids: [...contactIds, user._id],
            role: 'provider',
            including: false,
            query,
            skip: page * pageSize,
            limit: pageSize,
          });

          const pendingContacts = await Invite.find({
            inviter: user,
            invitee: { $exists: true },
            practice: { $exists: false },
            group: { $exists: false },
          });

          return contacts.map((c) => {
            const pendingContact = pendingContacts.find((pc) =>
              equalId(pc.invitee, c._id)
            );

            return {
              contact: c,
              inviteId: pendingContact?._id,
              outgoing: true,
            };
          });
        } else if (category === 'patients') {
          const practiceId = user.activeProviderPractice?.practice._id;
          const patientIds = (
            await PatientPractice.find({
              practice: practiceId,
            })
          ).map((p) => p.user._id);

          const contacts = await aggregateUsers({
            ids: patientIds,
            role: 'patient',
            including: false,
            query,
            skip: page * pageSize,
            limit: pageSize,
          });
          const pendingContacts = await Invite.find({
            inviter: user,
            invitee: { $exists: true },
            practice: { $exists: false },
            group: { $exists: false },
          });

          return contacts.map((c) => {
            const pendingContact = pendingContacts.find((pc) =>
              equalId(pc.invitee, c._id)
            );

            return {
              contact: c,
              inviteId: pendingContact?._id,
              outgoing: true,
            };
          });
        } else {
          const isPharmacy = isPharmacist(user);

          const practices = await ProviderPractice.aggregate([
            {
              $match: {
                user: { $ne: user._id },
              },
            },
            {
              $group: {
                _id: '$practice',
              },
            },
            {
              $lookup: {
                from: 'practices',
                localField: '_id',
                foreignField: '_id',
                as: 'practice',
              },
            },
            {
              $unwind: '$practice',
            },
            {
              $match: {
                'practice.name': new RegExp(query, 'ig'),
                'practice.isPharmacy': isPharmacy,
              },
            },
          ]);

          const pendingPractices = await Invite.find({
            inviter: user,
            invitee: { $exists: false },
            practice: { $exists: true },
          });
          const practiceContacts = practices?.map(({ practice }) => {
            const pendingPractice = pendingPractices.find((pp) =>
              equalId(pp.practice, practice._id)
            );

            return {
              contact: practice,
              inviteId: pendingPractice?._id,
              outgoing: true,
            };
          });

          const groups = await GroupUser.aggregate([
            {
              $match: {
                user: { $ne: user._id },
              },
            },
            {
              $group: {
                _id: '$group',
              },
            },
            {
              $lookup: {
                from: 'groups',
                localField: '_id',
                foreignField: '_id',
                as: 'group',
              },
            },
            {
              $unwind: '$group',
            },

            {
              $match: {
                'group.name': new RegExp(query, 'ig'),
              },
            },
          ]);

          const pendingGroups = await Invite.find({
            inviter: user,
            invitee: { $exists: false },
            group: { $exists: true },
          });
          const groupContacts = groups?.map(({ group }) => {
            const pendingGroup = pendingGroups.find((pg) =>
              equalId(pg.group, group._id)
            );

            return {
              contact: group,
              inviteId: pendingGroup?._id,
              outgoing: true,
            };
          });

          return [...(practiceContacts || []), ...(groupContacts || [])];
        }
      } else {
        if (category === 'providers') {
          const contactIds = await getProviderContactIdsFromPatient(user);

          const contacts = await aggregateUsers({
            ids: contactIds,
            role: 'provider',
            including: false,
            query,
            skip: page * pageSize,
            limit: pageSize,
          });

          const pendingContacts = await Invite.find({
            inviter: user,
            invitee: { $exists: true },
            practice: { $exists: false },
            group: { $exists: false },
          });

          return contacts.map((c) => {
            const pendingContact = pendingContacts.find((pc) =>
              equalId(pc.invitee, c._id)
            );

            return {
              contact: c,
              inviteId: pendingContact?._id,
              outgoing: true,
            };
          });
        } else if (category === 'patients') {
          const friendIds = (
            await Contact.find({
              $or: [{ user1: user }, { user2: user }],
            })
          ).map((c) => {
            if (equalId(c.user1, user._id)) {
              return c.user2;
            }
            return c.user1;
          });

          const contacts = await aggregateUsers({
            ids: [...friendIds, user._id],
            role: 'patient',
            including: false,
            query,
            skip: page * pageSize,
            limit: pageSize,
          });
          const pendingContacts = await Invite.find({
            inviter: user,
            invitee: { $exists: true },
            practice: { $exists: false },
            group: { $exists: false },
          });

          return contacts.map((c) => {
            const pendingContact = pendingContacts.find((pc) =>
              equalId(pc.invitee, c._id)
            );

            return {
              contact: c,
              inviteId: pendingContact?._id,
              outgoing: true,
            };
          });
        } else {
          const groups = await GroupUser.aggregate([
            {
              $match: {
                user: { $ne: user._id },
              },
            },
            {
              $group: {
                _id: '$group',
              },
            },
            {
              $lookup: {
                from: 'groups',
                localField: '_id',
                foreignField: '_id',
                as: 'group',
              },
            },
            {
              $unwind: '$group',
            },

            {
              $match: {
                'group.name': new RegExp(query, 'ig'),
              },
            },
          ]);

          const pendingGroups = await Invite.find({
            inviter: user,
            invitee: { $exists: false },
            group: { $exists: true },
          });
          const groupContacts = groups?.map(({ group }) => {
            const pendingGroup = pendingGroups.find((pg) =>
              equalId(pg.group, group._id)
            );

            return {
              contact: group,
              inviteId: pendingGroup?._id,
              outgoing: true,
            };
          });

          return groupContacts || [];
        }
      }
    },
  },
];
