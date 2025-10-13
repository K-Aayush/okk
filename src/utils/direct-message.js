import mongoose from 'mongoose';

import { Practice, ProviderPractice, User } from '../db';
import {
  sendDMArrivalEmail,
  sendDMArrivalEmailtoPCP,
} from '../services/mailer';
import { sendDMArrivalSMS, sendDMArrivalSMStoPCP } from '../services/twilio';
import { formatTitleAndName } from './string';
import { getNotificationInfo } from './notification';

export const getDirectMessageReplyAddresses = async () => {
  return await ProviderPractice.find({
    directMessageAddress: { $nin: ['', null], $exists: true },
  })
    .populate(['user', 'practice'])
    .lean();
};

export const checkExistingDMAddress = async (address, id) => {
  if (!address || address.length === 0) {
    return false;
  }

  const trimmedAddress = address.trim().toLowerCase();

  const existingProviderAddress = await ProviderPractice.findOne({
    directMessageAddress: trimmedAddress,
    _id: { $ne: mongoose.Types.ObjectId(id) },
  }).populate(['user', 'practice']);
  if (existingProviderAddress) {
    return {
      _id: existingProviderAddress._id,
      type: 'provider',
      message: `${formatTitleAndName(existingProviderAddress.user)} of ${
        existingProviderAddress.practice?.name
      }`,
    };
  }
  const existingPractice = await Practice.findOne({
    directMessageDomain: trimmedAddress,
    _id: { $ne: mongoose.Types.ObjectId(id) },
  });
  if (existingPractice) {
    return {
      _id: existingPractice._id,
      type: 'practice',
      message: `Direct Message domain of ${existingPractice.name}`,
    };
  }
  return false;
};

export const sendNotificationEmailAndSMSForNewDM = async (message) => {
  const practiceId = message.practice;
  if (!practiceId) {
    return;
  }
  const providers = await ProviderPractice.aggregate([
    { $match: { practice: practiceId, isLicensed: true } },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    { $match: { 'user.specialty': message.specialty } },
  ]);
  const providerEmails = providers.map((provider) => provider.user.email);
  const providerPhones = providers
    .map((provider) => {
      let phone;
      if (provider.user.phones?.preference) {
        phone = provider.user.phones[provider.user.phones.preference];
      }
      if (!phone) {
        phone =
          provider.user.phones.mobile ||
          provider.user.phones.work ||
          provider.user.phones.home;
      }
      return phone;
    })
    .filter((number) => !!number);

  const url = `${process.env.HOST_URL_PROVIDER}/coordinate/direct-messages`;

  let providerName;
  if (message.sender) {
    const sender = await User.findById(message.sender);
    providerName = formatTitleAndName(sender);
  } else {
    const practice = await Practice.findById(message.practice);
    providerName = practice.name;
  }

  const messageParams = {
    providerName,
    portalUrl: url,
  };

  // Send SMS notification to specialists
  if (providerPhones?.length > 0) {
    for (let phoneNo of providerPhones) {
      await sendDMArrivalSMS(phoneNo, messageParams);
    }
  }

  // Send email notification to specialists
  if (providerEmails?.length > 0) {
    await sendDMArrivalEmail(providerEmails, messageParams);
  }
};

export const sendNotificationEmailAndSMSForNewDMtoPCP = async (message) => {
  if (!message.sender) {
    return;
  }
  const sender = await User.findById(message.sender);
  if (!sender) {
    return;
  }

  const { email, sms } = await getNotificationInfo(sender);
  const url = process.env.HOST_URL_PROVIDER;

  email && (await sendDMArrivalEmailtoPCP(email, { portalUrl: url }));

  sms && (await sendDMArrivalSMStoPCP(sms, { portalUrl: url }));
};
