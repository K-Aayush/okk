import mongoose from 'mongoose';
import moment from 'moment';

import {
  Careplan,
  DirectMessageInboxItem,
  Note,
  PatientPractice,
  ProviderPractice,
  Record,
  User,
} from '../db';
import { sendOnboardingEmail } from '../services/mailer';
import { sendOnboardingSMS } from '../services/twilio';
import {
  createInvitationUrl,
  checkDuplicatedInfo,
  getNotificationInfo,
  checkDateForPeriod,
} from '../utils';
import { ERROR_MESSAGE } from '../constants';

const getPatientDirectMessageCount = async (patient, user, period) => {
  if (
    user.role === 'patient' ||
    !user.activeProviderPractice?.practice?.isGazuntitePractice
  ) {
    return 0;
  }
  const checkDate = checkDateForPeriod(period || 'all');
  const conditions = { $or: [{ note: { $exists: false } }, { note: null }] };
  if (patient) {
    conditions['patientInfo.id'] = patient.athenaId;
  }
  if (period && period !== 'all') {
    conditions['createTime'] = { $gt: checkDate };
  }

  if (user.specialty && !user.activeProviderPractice.disableTracking) {
    if (user.specialty === 'Cardiologist') {
      conditions.specialty = { $in: ['Cardiologist', 'E-Consult'] };
    } else {
      conditions.specialty = user.specialty;
    }
  }

  const messages = await DirectMessageInboxItem.aggregate([
    {
      $match: conditions,
    },
    {
      $lookup: {
        from: 'providerpractices',
        localField: 'practice',
        foreignField: 'practice',
        as: 'providerpractices',
      },
    },
    {
      $match: {
        providerpractices: {
          $elemMatch: {
            user: user._id,
            isLicensed: true,
            deactivated: { $ne: true },
          },
        },
      },
    },
    { $sort: { createTime: -1 } },
  ]);
  return messages.length;
};

const getPatientNewNoteCount = async (patient, user, period) => {
  if (
    user.role === 'patient' ||
    !user.activeProviderPractice?.practice?.isGazuntitePractice
  ) {
    return 0;
  }
  const conditions = {
    $or: [
      {
        practices:
          user.activeProviderPractice.practice?._id ||
          user.activeProviderPractice.practice,
      },
      {
        'shares.with':
          user.activeProviderPractice?._id || user.activeProviderPractice,
      },
    ],
    seen: { $ne: user._id },
    user: patient?._id || patient,
    isDraft: false,
    creator: {
      $ne:
        user.activeProviderPractice.practice?._id ||
        user.activeProviderPractice.practice,
    },
  };
  if (period && period !== 'all') {
    const checkDate = checkDateForPeriod(period || 'all');
    conditions['createdAt'] = { $gt: checkDate };
  }

  return await Note.countDocuments(conditions);
};

export default [
  {
    key: 'createPatient',
    prototype: '(patient: PatientInput!): PatientPractice',
    mutation: true,
    run: async ({ patient }, { user: provider }) => {
      const info = {
        email: {
          value: patient.user.email,
          message: ERROR_MESSAGE.DUPLICATE_EMAIL,
        },
        phone: {
          value: patient.user.phones.mobile,
          message: ERROR_MESSAGE.DUPLICATE_PHONE_NUMBER,
        },
        ssn: {
          value: patient.ssn,
          message: ERROR_MESSAGE.DUPLICATE_SSN,
        },
      };

      const errorMessage = await checkDuplicatedInfo(true, info);

      if (errorMessage !== null) {
        throw Error(errorMessage);
      }

      const existing = await User.exists({ email: patient.user.email });

      if (existing) {
        throw Error('There is already a patient with the given email address.');
      }

      const session = await mongoose.startSession();
      let newPatient;
      let newPatientPractice;

      await session.withTransaction(async () => {
        const { user, ...restData } = patient;
        const newUsers = await User.create(
          [
            {
              role: 'patient',
              ...user,
              ...restData,
            },
          ],
          { session }
        );
        newPatient = newUsers[0];
        const newPatientPractices = await PatientPractice.create(
          [
            {
              user: newPatient,
              practice: provider.activeProviderPractice?.practice,
            },
          ],
          { session }
        );
        newPatientPractice = newPatientPractices[0];
      });

      session.endSession();

      const providerInviteLabel = `${provider.activeProviderPractice?.practice?.name} (${provider.memberDesignation})`;
      const patientId = newPatient._id.toString();
      const practiceName =
        provider.activeProviderPractice?.practice?.name || '';
      const invitationLink = await createInvitationUrl(patientId, 'patient');

      const params = {
        subject: `You have been invited to join ${practiceName}`,
        header: `Welcome to ${practiceName}`,
        line: `You have been invited by ${providerInviteLabel} to join the remote care services of the ${practiceName}.`,
        link: invitationLink,
      };
      //disable for patient
      const { email, sms } = await getNotificationInfo(newPatient);
      if (email) {
        sendOnboardingEmail(email, params);
        sms && sendOnboardingSMS(sms, params);
      }

      return newPatientPractice;
    },
  },
  {
    key: 'updatePatient',
    prototype: '(id: ID!, patient: PatientInput!): User',
    mutation: true,
    run: async ({ id, patient }, { user: authUser }) => {
      // Allow everyone to update patient's profile
      /*
      if (!equalId(id, authUser._id)) {
        throw Error(ERROR_MESSAGE.NO_PERMISSION);
      }
      */

      const { user = {}, ...restData } = patient;
      const info = {
        email: {
          value: user.email,
          message: ERROR_MESSAGE.DUPLICATE_EMAIL,
        },
        phone: {
          value: user.phones?.mobile,
          message: ERROR_MESSAGE.DUPLICATE_PHONE_NUMBER,
        },
        ssn: {
          value: patient.ssn,
          message: ERROR_MESSAGE.DUPLICATE_SSN,
        },
      };

      const errorMessage = await checkDuplicatedInfo(true, info, id);
      if (errorMessage !== null) {
        throw Error(errorMessage);
      }

      const data = {
        ...user,
        ...restData,
      };
      const updated = await User.findByIdAndUpdate(id, data, {
        new: true,
      });

      return updated;
    },
  },
  {
    key: 'updatePatientAthenaId',
    prototype: '(patient: ID!, athenaId: String!): Boolean',
    mutation: true,
    run: async ({ patient: patientId, athenaId }, { user: authUser }) => {
      if (authUser.role !== 'provider') {
        return false;
      }
      const patient = await User.findById(patientId);
      if (patient?.role !== 'patient') {
        return false;
      }
      await User.updateOne({ _id: patientId }, { athenaId });
      return true;
    },
  },
  {
    key: 'patients',
    prototype:
      '(query: String, birthday: String, inPractice: String, page: Int, pageSize: Int): [User]',
    run: async (
      { query, birthday, inPractice, page = 0, pageSize = 100 },
      { user }
    ) => {
      // inPractice can be one of ['yes', 'no', 'all']
      const aggregate = User.aggregate([{ $match: { role: 'patient' } }]);

      if (query) {
        aggregate
          .addFields({
            fullName: { $concat: ['$firstName', ' ', '$lastName'] },
          })
          .match({
            $or: [{ fullName: new RegExp(query, 'ig') }, { ssn: query }],
          });
      }
      if (birthday) {
        aggregate.match({
          dob: birthday,
        });
      }

      if (inPractice !== 'all') {
        const providerPractices = await ProviderPractice.find(
          {
            user: user._id,
          },
          { practice: 1 }
        );
        const practiceIds = providerPractices.map(
          (providerPractice) => providerPractice.practice
        );

        aggregate
          .lookup({
            from: 'patientpractices',
            let: { userId: '$_id' },
            as: 'patientpractices',
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$user', '$$userId'] },
                      {
                        $in: ['$practice', practiceIds],
                      },
                    ],
                  },
                },
              },
              {
                $count: 'count',
              },
            ],
          })
          .match({
            'patientpractices.count': {
              $exists: inPractice === 'yes',
            },
          });
      }

      aggregate.skip(page * pageSize).limit(pageSize);

      const patients = await aggregate;

      return patients;
    },
  },
  {
    key: 'monthlyPatientStatus',
    prototype: '(year: Int!, month: Int!): MonthlyPatientStatus',
    run: async ({ year, month }, { user }) => {
      const practiceId = user.activeProviderPractice?.practice?._id;

      const from = moment
        .utc()
        .set({
          year,
          month: month - 1,
          date: 1,
          hour: 0,
          minute: 0,
          second: 0,
          milliseconds: 0,
        })
        .utcOffset(user.timezoneOffset || -300, true);
      const to = from.clone().add(1, 'months');

      const records =
        (await Record.aggregate([
          {
            $match: {
              $and: [
                { practice: practiceId },
                { startedAt: { $gte: from.toDate() } },
                { startedAt: { $lt: to.toDate() } },
              ],
            },
          },
          {
            $group: {
              _id: '$patient',
              subTotal: { $sum: '$totalTime' },
            },
          },
        ])) || [];

      const totalPatients = records.length;
      const totalSeconds = records.reduce((acc, cur) => acc + cur.subTotal, 0);
      const averageSeconds =
        totalPatients === 0 ? 0 : Math.ceil(totalSeconds / totalPatients);

      const activePatientCount = await Careplan.countDocuments({
        isActive: true,
        practices: practiceId,
      });

      return {
        totalPatients: activePatientCount,
        totalSeconds,
        averageSeconds,
      };
    },
  },
  {
    key: 'paymentMethods',
    prototype: '(patient: ID): [PaymentMethod]',
    run: async ({ patient: patientId }, { user }) => {
      return [];
      const patient =
        user.role === 'provider' ? await User.findById(patientId) : user;
      if (!patient) {
        throw new Error('Patient not found!');
      }

      return patient.paymentMethods;
    },
  },
  {
    key: 'addPaymentMethod',
    prototype:
      '(patient: ID, type: String!, number: String!, exp: String!, cvc: String!): PaymentMethod',
    mutation: true,
    run: async ({ patient: patientId, type, number, exp, cvc }, { user }) => {
      return [];
      const patient =
        user.role === 'provider' ? await User.findById(patientId) : user;
      if (!patient) {
        throw new Error('Patient not found');
      }
      // if (!patient.caryrx?.id) {
      //   let caryRXPatientId = await caryRXService.searchPatient(
      //     patient.firstName,
      //     patient.lastName,
      //     patient.email
      //   );
      //   if (!caryRXPatientId) {
      //     caryRXPatientId = await caryRXService.addPatient(
      //       patient.firstName,
      //       patient.lastName,
      //       patient.dob,
      //       patient.email,
      //       patient.phones.mobile || patient.phones.home
      //     );
      //   }
      //   patient.caryrx = {
      //     id: caryRXPatientId,
      //   };
      // }
      // if (!patient.caryrx.locationId) {
      //   const address = patient.address;
      //   const carryRXPaitentLocationId = await caryRXService.addPatientLocation(
      //     patient.caryrx.id,
      //     address.addressLine1,
      //     address.addressLine2,
      //     address.city,
      //     address.state,
      //     address.zipcode
      //   );
      //   patient.caryrx.locationId = carryRXPaitentLocationId;
      // }
      // const caryRXPaymentMethodId = await caryRXService.addPayments(
      //   patient.caryrx.id,
      //   `${patient.firstName} ${patient.lastName}`,
      //   number,
      //   exp,
      //   cvc
      // );
      // patient.caryrx.paymentsId = caryRXPaymentMethodId;
      // let isDefault = false;
      // if (!(patient.paymentMethods?.length > 0)) {
      //   isDefault = true;
      // }
      // patient.paymentMethods.push({
      //   type,
      //   last4Digits: number.substr(-4),
      //   isDefault,
      // });
      const paymentMethodData = {
        cardType: type,
        last4Digits: number.substr(-4),
        isDefault: true,
      };
      patient.paymentMethods = [paymentMethodData];
      await patient.save();
      return paymentMethodData;
    },
  },
  {
    key: 'patientRecordNotifications',
    prototype: '(patient: ID!, period: String): PatientRecordNotifications',
    run: async ({ patient: patientId, period }, { user }) => {
      const patient = await User.findById(patientId);
      if (!patient) {
        return {};
      }
      const directMessageCount = await getPatientDirectMessageCount(
        patient,
        user,
        period
      );
      const newNoteCount = await getPatientNewNoteCount(patient, user, period);
      return { directMessageCount, newNoteCount };
    },
  },
];
