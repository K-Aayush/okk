import { MEMBER_DESIGNATIONS } from '../constants';
import { User, PatientPractice, ProviderPractice } from '../db';

export const getFullName = (user) => {
  if (!user) {
    return '';
  }

  return [user.firstName, user.lastName].filter((n) => !!n).join(' ');
};

export const formatMemberDesignation = (key) => {
  const value = MEMBER_DESIGNATIONS[key];

  return value || key;
};

export const formatTitleAndName = (user) => {
  if (!user) {
    return '';
  }
  if (!user.role) {
    return user.name;
  }
  if (user.role === 'patient') {
    return getFullName(user);
  }
  return (
    getFullName(user) +
    (user.memberDesignation
      ? `, ${formatMemberDesignation(user.memberDesignation)}`
      : '')
  );
};

export const formatAddress = (address) => {
  if (address) {
    return `${address.addressLine1}, ${address.city}, ${address.state}, ${address.zipcode}`;
  }

  return '';
};

export const formatPhoneNumber = (value) => {
  if (!value) return value;
  const currentValue = value.replace(/[^\d]/g, '');
  const cvLength = currentValue.length;

  if (cvLength < 4) return currentValue;
  if (cvLength < 7) {
    return `(${currentValue.slice(0, 3)}) ${currentValue.slice(3)}`;
  }
  if (cvLength > 10) {
    return currentValue;
  }
  return `(${currentValue.slice(0, 3)}) ${currentValue.slice(
    3,
    6
  )}-${currentValue.slice(6, 10)}`;
};

export const uriFromPractice = (practiceName) => {
  return practiceName?.replace(/[^A-Za-z0-9]/g, '').toLowerCase() || '';
};

export const buildPracticeUrlForUser = async (url, userOrId) => {
  const user =
    typeof userOrId === 'string' || !userOrId.role
      ? await User.findById(userOrId.toString())
      : userOrId;
  let practice, originalUrl;
  if (user.role === 'patient') {
    const patientPractice = await PatientPractice.findOne({ user: user._id })
      .populate('practice')
      .lean();
    practice = patientPractice?.practice;
    originalUrl = `${process.env.HOST_URL_PATIENT}${
      url.startsWith('/') ? url : `/${url}`
    }`;
    if (!practice) {
      return originalUrl;
    }
  } else {
    const providerPractice = await ProviderPractice.findOne({ user: user._id })
      .populate('practice')
      .lean();
    practice = providerPractice?.practice;
    const hostUrl =
      user.memberDesignation === 'pharmacist'
        ? process.env.HOST_URL_PHARMACIST
        : process.env.HOST_URL_PROVIDER;
    originalUrl = `${hostUrl}${url.startsWith('/') ? url : `/${url}`}`;
    if (!practice) {
      return originalUrl;
    }
  }
  if (!originalUrl.startsWith('https://')) {
    return originalUrl;
  }
  return `https://${uriFromPractice(practice.name)}.${originalUrl.substring(
    8
  )}`;
};

export const extractEmailFromDirectMessageEmailField = (email) => {
  const startPos = email.indexOf('<') + 1;
  const endPos = email.indexOf('>');
  return email.substr(startPos, endPos - startPos);
};

export const extractPathFromUrl = (url) => {
  const regex = /^(?:https?:\/\/)[^/]+(\/[^?#]*)?/;
  const match = url.match(regex);
  return match ? match[1].substr(1) || '' : null;
};
