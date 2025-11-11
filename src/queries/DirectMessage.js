import mongoose from 'mongoose';
import moment from 'moment';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand, S3 } from '@aws-sdk/client-s3';
import { fromEnv } from '@aws-sdk/credential-providers';

import {
  DirectMessageInboxItem,
  Note,
  ProviderPractice,
  Specialty,
  User,
} from '../db';
import MaxMDService from '../services/MaxMd/max-md';
import {
  formatAddress,
  formatTitleAndName,
  generateDMReplyNotePdf,
  extractPathFromUrl,
  getNotificationInfo,
  getVitalTypeAttr,
} from '../utils';
import { checkDateForPeriod, displayTime } from '../utils/time';
import { getDirectMessageReplyAddresses } from '../utils/direct-message';
import socketManager from '../services/socket-manager';
import SOCKET_EVENTS from '../services/socket-manager/constants';
import { sendDMResponseSMS } from '../services/twilio';
import { sendDMResponseEmail } from '../services/mailer';
import * as Sentry from '@sentry/node';

export default [
  {
    key: 'directMessage',
    prototype: '(id: ID!): DirectMessage',
    run: async ({ id }, { user }) => {
      if (user.role === 'patient') {
        return null;
      }
      const messageItem = await DirectMessageInboxItem.findById(id)
        .populate(['practice', 'note', 'sender'])
        .lean();
      const patient = await User.findOne({
        athenaId: messageItem.patientInfo.id,
      });
      return { ...messageItem, patient };
    },
  },
  {
    key: 'directMessages',
    prototype: '(period: String!, practice: ID, patient: ID): [DirectMessage]',
    run: async ({ period, practice, patient: patientId }, { user }) => {
      if (
        user.role === 'patient' ||
        !user.activeProviderPractice?.practice?.isGazuntitePractice
      ) {
        return [];
      }
      const checkDate = checkDateForPeriod(period || 'all');
      const conditions = {};
      if (patientId) {
        const patient = await User.findById(patientId);
        if (!patient) {
          return [];
        }
        conditions['patientInfo.id'] = patient.athenaId;
      }
      if (period !== 'all') {
        conditions['createTime'] = { $gt: checkDate };
      }

      if (user.specialty && !user.activeProviderPractice.disableTracking) {
        if (user.specialty === 'Cardiologist') {
          conditions.specialty = { $in: ['Cardiologist', 'E-Consult'] };
        } else {
          conditions.specialty = user.specialty;
        }
      }

      if (practice) {
        conditions.practice = mongoose.Types.ObjectId(practice);
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
        {
          $lookup: {
            from: 'users',
            localField: 'patientInfo.id',
            foreignField: 'athenaId',
            as: 'patients',
          },
        },
        {
          $addFields: {
            patient: {
              $arrayElemAt: ['$patients', 0],
            },
          },
        },
      ]);
      return await DirectMessageInboxItem.populate(messages, [
        'practice',
        'note',
        'sender',
      ]);
    },
  },
  {
    key: 'sentDMsPCP',
    prototype: '(period: String!, practice: ID, patient: ID): [DirectMessage]',
    run: async ({ period, practice, patient: patientId }, { user }) => {
      if (
        user.role === 'patient' ||
        !(
          !user.activeProviderPractice?.practice?.isGazuntitePractice ||
          user.specialty === 'PCP'
        )
      ) {
        return [];
      }
      const checkDate = checkDateForPeriod(period || 'all');
      const conditions = { sender: user._id };
      if (patientId) {
        const patient = await User.findById(patientId);
        if (!patient) {
          return [];
        }
        conditions['patientInfo.id'] = patient.athenaId;
      }
      if (period !== 'all') {
        conditions['createTime'] = { $gt: checkDate };
      }

      if (practice) {
        conditions.practice = mongoose.Types.ObjectId(practice);
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
                // isLicensed: true,
                deactivated: { $ne: true },
              },
            },
          },
        },
        { $sort: { createTime: -1 } },
        {
          $lookup: {
            from: 'users',
            localField: 'patientInfo.id',
            foreignField: 'athenaId',
            as: 'patients',
          },
        },
        {
          $addFields: {
            patient: {
              $arrayElemAt: ['$patients', 0],
            },
          },
        },
      ]);
      return await DirectMessageInboxItem.populate(messages, [
        'practice',
        'note',
        'sender',
      ]);
    },
  },
  {
    key: 'shareNoteByDirectMessage',
    mutation: true,
    prototype: '(note: ID!, to: ID!): Boolean',
    run: async ({ note: noteId, to }, { user }) => {
      if (user.role === 'patient') {
        return false;
      }
      try {
        const note = await Note.findById(noteId).populate([
          'user',
          {
            path: 'creator',
            populate: ['practice', 'user', 'directMessageInbox'],
          },
        ]);
        if (!note) {
          return false;
        }
        const specialty = note.directMessage?.specialty || user.specialty;
        let specialtyDMAddress;
        if (specialty) {
          specialtyDMAddress = await Specialty.findOne({
            title: specialty,
          });
          specialtyDMAddress = specialtyDMAddress.dmAddress;
        }
        const dmReplyProvider = await ProviderPractice.findById(to).populate([
          'practice',
          'user',
        ]);
        if (!dmReplyProvider || !dmReplyProvider.directMessageAddress) {
          throw Error('Recipient does not exist');
        }

        const recipient = dmReplyProvider.user;

        let objective;
        if (note.content.objective) {
          objective = [];
          const vitals = note.content.objective;
          Object.keys(vitals).forEach((type) => {
            if (
              type === 'bloodPressure2' ||
              !vitals[type] ||
              vitals[type] === ''
            ) {
              return;
            }
            const attrs = getVitalTypeAttr(type);
            objective.push({
              title: attrs.name,
              value:
                type === 'bloodPressure'
                  ? `${vitals[type]} sys / ${vitals['bloodPressure2']} dia`
                  : `${vitals[type]} ${attrs.unitShort || attrs.unit}`,
            });
          });
        }

        let diagnosis;
        if (note.content.diagnosis) {
          diagnosis = [];
          note.content.diagnosis.forEach((item) => {
            if (!item?.code || !item?.description) {
              return;
            }
            diagnosis.push({ title: item.code, value: item.description });
          });
        }

        let attachments;
        if (note.content.attachments) {
          attachments = [];
          note.content.attachments.forEach((item) => {
            if (item.category === 'note') {
            } else if (item.category === 'directMessage') {
            } else if (item.category === 'chat') {
            } else {
              attachments.push({ title: item.originalName, url: item.url });
            }
          });
        }

        let noteSignDateString = '';
        try {
          const noteSignDate = note.signDate
            ? moment.tz(note.signDate, recipient.timezone)
            : null;
          if (noteSignDate) {
            noteSignDateString = `${displayTime(
              noteSignDate,
              'MM/DD/YYYY'
            )} at ${displayTime(noteSignDate, 'h:mmA')}`;
          }
        } catch (error) {}

        const data = {
          patient: {
            name: formatTitleAndName(note.user),
            id: note.user.athenaId,
            dob: note.user.dob,
            address: formatAddress(note.user.address),
            mobile: note.user.phones?.mobile || '',
            home: note.user.phones?.home || '',
          },
          from: {
            name: formatTitleAndName(note.creator.user),
          },
          to: {
            practice: dmReplyProvider.practice.name || '',
            address: formatAddress(dmReplyProvider.practice.address) || '',
            phone: dmReplyProvider.practice.phone || '',
          },
          recipient: {
            name: `${formatTitleAndName(recipient)}`,
            email: recipient.email,
          },
          createTime: noteSignDateString,
          subjective: note.content.subjective
            ? note.content.subjective.replace(
                /\n/g,
                '<p class="line-break"></p>'
              )
            : null,
          objective,
          assessment: note.content.assessment
            ? note.content.assessment.replace(
                /\n/g,
                '<p class="line-break"></p>'
              )
            : null,
          attachments,
          diagnosis,
          plan: note.content.plan
            ? note.content.plan.replace(/\n/g, '<p class="line-break"></p>')
            : null,
          signature: note.signature,
          siteUrl: process.env.HOST_URL_PROVIDER,
        };

        const pdfBuffer = await generateDMReplyNotePdf(data);

        // Gazuntite portal chat URL
        const chatUrl = `${process.env.HOST_URL_PROVIDER}/chat?memberIds=${note.creator.user._id}&referredPatientId=${note.user._id}`;

        // MaxMD message body
        const messageBody = `Open your Gazuntite account for further assistance at <a href="${chatUrl}" target="_blank">${chatUrl}</a>`;
        const messageInfo = {
          subject: `${formatTitleAndName(note.user)}, ID #${
            note.user.athenaId
          }, DOB: ${note.user.dob}`,
          attachment: `${formatTitleAndName(note.user)}_ID#${
            note.user.athenaId
          }.pdf`,
          body: messageBody,
        };

        // MaxMD Version of send message
        await new MaxMDService(specialtyDMAddress, specialty).sendMessage(
          dmReplyProvider.directMessageAddress,
          messageInfo,
          pdfBuffer.toString('base64')
        );
        const newDMShares = note.directMessageShare || [];
        newDMShares.push({ to, sharedAt: new Date() });

        await Note.findByIdAndUpdate(noteId, {
          directMessageShare: newDMShares,
        });

        const messageParams = {
          patientId: note.user.athenaId,
          providerName: formatTitleAndName(note.creator.user),
          portalUrl: chatUrl,
        };

        const smsParams = {
          patientId: note.user.athenaId,
          providerName: formatTitleAndName(note.creator.user),
          chatUrl,
        };

        const { email, sms } = await getNotificationInfo(recipient);

        // Send SMS notification to dm reply address recipient
        sms && (await sendDMResponseSMS(sms, smsParams));

        // Send email notification to dm reply address recipient
        email && (await sendDMResponseEmail(email, messageParams));

        // await new DataMotionService().sendMessage(
        //   to,
        //   messageInfo,
        //   pdfBuffer.toString('base64')
        // );
      } catch (error) {
        // Report error
        Sentry.captureException(error, {
          extra: {
            message: 'Direct message query error',
            payload: {
              noteId,
              to,
            },
            detail: JSON.stringify(error),
          },
        });
        return false;
      }
      return true;
    },
  },
  {
    key: 'requestDirectMessageAttachmentUrl',
    prototype: '(id: ID!): String',
    run: async ({ id }, { user }) => {
      if (user.role !== 'provider') {
        throw new Error('Invalid request');
      }
      const messageItem = await DirectMessageInboxItem.findById(id).lean();
      if (!messageItem?.attachment?.fileUrl) {
        return null;
      }
      const s3 = new S3({
        region: process.env.AWS_REGION,
        credentials: fromEnv(),
      });
      const fileUrl = decodeURIComponent(messageItem.attachment.fileUrl);
      const fileName = fileUrl.startsWith('https://')
        ? extractPathFromUrl(fileUrl)
        : fileUrl;
      const s3Params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: fileName,
        Expires: 500,
      };

      const data = await getSignedUrl(s3, new GetObjectCommand(s3Params));

      return data;
    },
  },
  {
    key: 'directMessageReplyAddresses',
    prototype: ': [DirectMessageReplyAddress!]',
    run: async ({}, { user }) => {
      return await getDirectMessageReplyAddresses();
    },
  },
  {
    key: 'createNoteFromDirectMessage',
    prototype: '(message: ID!): ID',
    mutation: true,
    run: async ({ message: messageId }, { user }) => {
      if (user.role !== 'provider') {
        throw Error('Can not create note.');
      }
      const directMessage = await DirectMessageInboxItem.findById(messageId);
      if (!directMessage) {
        throw Error('Direct message does not exist.');
      }
      const existingNote = await Note.findOne({ directMessage: messageId });
      if (existingNote) {
        if (
          existingNote.creator == user.activeProviderPractice._id.toString()
        ) {
          return existingNote._id;
        }
        throw Error('Note already created by other provider.');
      }
      const patient = await User.findOne({
        athenaId: directMessage.patientInfo.id,
      });
      if (!patient) {
        throw Error('Patient does not exist.');
      }
      if (
        !user.activeProviderPractice.practice.isGazuntitePractice ||
        user.activeProviderPractice.disableTracking
      ) {
        throw Error('Can not create a note.');
      }
      const newNote = await Note.create({
        content: {
          attachments: [
            { category: 'directMessage', directMessage: messageId },
          ],
        },
        creator: user.activeProviderPractice._id,
        directMessage: messageId,
        isDraft: true,
        user: patient._id,
      });
      await DirectMessageInboxItem.findOneAndUpdate(
        { _id: messageId },
        { note: newNote._id }
      );
      socketManager.sendMessage(user._id, SOCKET_EVENTS.PATIENT_NOTES, {
        patient,
      });
      return newNote._id;
    },
  },
];
