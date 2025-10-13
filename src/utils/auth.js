import jwt from 'jsonwebtoken';

import { User, Practice, PatientPractice, AdminUser } from '../db';
import { buildPracticeUrlForUser } from './string';

export const createAuthResponse = async (
  user,
  timezoneOffset,
  timezone,
  isTempAuth
) => {
  const token = jwt.sign(
    { _id: user._id, role: user.role, isTempAuth },
    process.env.SUPER_PASSWORD
  );

  if (timezone && user.timezone !== timezone) {
    user.timezone = timezone;
    await user.save();
  }
  if (timezoneOffset && user.timezoneOffset !== timezoneOffset) {
    user.timezoneOffset = timezoneOffset;
    await user.save();
  }

  await user.execPopulate({
    path: 'activeProviderPractice',
    populate: 'practice',
  });

  if (isTempAuth) {
    user.isTempAuth = true;
  }

  if (user.role === 'patient') {
    const patientPractice = await PatientPractice.findOne({
      user: user._id,
    })
      .populate('practice')
      .lean();
    user.patientPractice = patientPractice.practice;
  }

  return {
    error: null,
    token,
    user,
  };
};

export const getUser = async (token) => {
  if (token) {
    const decoded = jwt.verify(token, process.env.SUPER_PASSWORD);
    const { _id, role, isTempAuth } = decoded;

    const user = await User.findById(_id)
      .populate({
        path: 'activeProviderPractice',
        populate: 'practice',
      })
      .exec();
    if (isTempAuth) {
      user.isTempAuth = true;
    }

    if (user.role === 'patient') {
      const patientPractice = await PatientPractice.findOne({
        user: _id,
      })
        .populate('practice')
        .lean();
      user.patientPractice = patientPractice.practice;
    }

    return user;
  }

  return null;
};

export const getAdminUser = async (token) => {
  if (token) {
    const decoded = jwt.verify(token, process.env.SUPER_PASSWORD);
    const { _id, role, email } = decoded;
    const adminUserCount = await AdminUser.countDocuments();
    if (adminUserCount > 0) {
      return await AdminUser.findById(_id);
    } else if (
      _id === 'admin_init_id' &&
      email === 'john.harrison@gazuntite.com'
    ) {
      return { _id, email, firstName: 'John', lastName: 'Harrison' };
    }
  }

  return null;
};

export const createInvitationUrl = async (userId, role) => {
  const token = jwt.sign(
    { _id: userId, role: role },
    process.env.SUPER_PASSWORD
  );

  return await buildPracticeUrlForUser(
    `/onboard?invitationToken=${token}`,
    userId
  );
};

export const createContactUrl = async (userId) => {
  return await buildPracticeUrlForUser('/invitations', userId);
};

export const checkDuplicatedInfo = async (isUserModel, info, currentId) => {
  const fields = Object.keys(info);

  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i];
    const rule = info[field];

    if (rule.value) {
      let existing = false;
      let query = { [field]: rule.value };

      if (isUserModel) {
        if (field === 'phone') {
          query = {
            $or: [
              { 'phones.mobile': rule.value },
              { 'phones.work': rule.value },
              { 'phones.home': rule.value },
            ],
          };
        }
        existing = await User.exists({
          ...query,
          status: { $exists: true },
          _id: { $ne: currentId },
        });
      } else {
        existing = await Practice.exists({
          ...query,
          _id: { $ne: currentId },
        });
      }

      if (existing) return rule.message;
    }
  }

  return null;
};

export const isPharmacist = (user) => user.memberDesignation === 'pharmacist';
