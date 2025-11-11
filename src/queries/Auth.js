import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import jwkToPem from 'jwk-to-pem';

import { PendingUser, User, Practice, ProviderPractice } from '../db';
import {
  createAuthResponse,
  createAuthError,
  checkDuplicatedInfo,
  isPharmacist,
  getFullName,
} from '../utils';
import { sendMessage } from '../services/twilio';
import {
  sendRegCode,
  sendResetPasswordEmail,
  sendResetPasswordSuccessEmail,
} from '../services/mailer';
import { ERROR_MESSAGE } from '../constants';
import { GraphQLUserError } from '../errors';

// Simple in-memory JWKS cache
let cognitoJwksCache = null;
let cognitoJwksFetchedAt = 0;
const COGNITO_JWKS_TTL_MS = 60 * 60 * 1000; // 1h

async function getCognitoPemForKid(kid) {
  const region = process.env.COGNITO_REGION;
  const poolId = process.env.COGNITO_USER_POOL_ID;
  if (!region || !poolId) {
    throw new Error(
      'Cognito env vars missing (COGNITO_REGION / COGNITO_USER_POOL_ID)'
    );
  }
  const now = Date.now();
  if (!cognitoJwksCache || now - cognitoJwksFetchedAt > COGNITO_JWKS_TTL_MS) {
    const url = `https://cognito-idp.${region}.amazonaws.com/${poolId}/.well-known/jwks.json`;
    const { data } = await axios.get(url);
    cognitoJwksCache = data.keys;
    cognitoJwksFetchedAt = now;
  }
  const jwk = cognitoJwksCache.find((k) => k.kid === kid);
  if (!jwk) throw new Error('Cognito key not found for kid');
  // JWK found; do not log key material for security reasons.
  return jwkToPem(jwk);
}

async function verifyCognitoIdToken(idToken) {
  // Decode header to get kid
  const decodedHeader = jwt.decode(idToken, { complete: true });
  // Basic validation of header and
  // Removed logging of decodedHeader to avoid exposing token metadata.
  if (!decodedHeader || !decodedHeader.header?.kid) {
    console.log('Invalid Cognito token header');
    // Sensitive token header not logged
    throw new Error('Invalid Cognito token header');
  } else {
    // Cognito token header is valid.
  }
  const pem = await getCognitoPemForKid(decodedHeader.header.kid);
  const payload = jwt.verify(idToken, pem, {
    issuer: `https://cognito-idp.${process.env.COGNITO_REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`,
  });
  // Optional audience/client check
  if (
    process.env.COGNITO_APP_CLIENT_ID &&
    payload.aud &&
    payload.aud !== process.env.COGNITO_APP_CLIENT_ID &&
    payload.client_id &&
    payload.client_id !== process.env.COGNITO_APP_CLIENT_ID
  ) {
    throw new Error('Cognito token audience mismatch');
  }
  return payload;
}

export default [
  {
    key: 'registerProvider',
    prototype:
      '(provider: ProviderInput!, timezoneOffset: Int, timezone: String): Auth',
    mutation: true,
    run: async ({ provider, timezoneOffset, timezone }, { user }) => {
      try {
        const { user: newUser, notifications, ...restData } = provider;
        const info = {
          email: {
            value: newUser.email,
            message: ERROR_MESSAGE.DUPLICATE_EMAIL,
          },
          'phones.mobile': {
            value: newUser.phones.mobile,
            message: ERROR_MESSAGE.DUPLICATE_PHONE_NUMBER,
          },
          npi: {
            value: provider.npi,
            message: ERROR_MESSAGE.DUPLICATE_NPI,
          },
        };

        const errorMessage = await checkDuplicatedInfo(true, info, user._id);
        if (errorMessage !== null) {
          throw Error(errorMessage);
        }

        const updated = await User.findByIdAndUpdate(
          user._id,
          {
            ...newUser,
            ...restData,
            password: bcrypt.hashSync(newUser.password, 10),
            status: 'onboarded',
          },
          {
            new: true,
          }
        ).exec();

        return createAuthResponse(updated, timezoneOffset, timezone);
      } catch (error) {
        return createAuthError(error);
      }
    },
  },
  {
    key: 'registerPractice',
    prototype: '(practice: PracticeInput!): Auth',
    mutation: true,
    run: async ({ practice }, { user }) => {
      try {
        const info = {
          email: {
            value: practice.email,
            message: ERROR_MESSAGE.DUPLICATE_EMAIL,
          },
          npi: {
            value: practice.npi,
            message: ERROR_MESSAGE.DUPLICATE_NPI,
          },
          phone: {
            value: practice.phone,
            message: ERROR_MESSAGE.DUPLICATE_PHONE_NUMBER,
          },
        };

        const errorMessage = await checkDuplicatedInfo(false, info);

        if (errorMessage !== null) {
          throw Error(errorMessage);
        }

        const isPharmacy = isPharmacist(user);
        const newPractice = new Practice({
          ...practice,
          isPharmacy,
        });
        await newPractice.save();
        const providerPractice = new ProviderPractice({
          practice: newPractice,
          user,
          isAdmin: true,
        });
        await providerPractice.save();
        user.activeProviderPractice = providerPractice;
        await user.save();

        return createAuthResponse(user);
      } catch (error) {
        createAuthError(error);
      }
    },
  },
  {
    key: 'login',
    prototype:
      '(email: String!, password: String, pin: String, role: String, timezoneOffset: Int, timezone: String, isProvider: Boolean): Auth',
    mutation: true,
    isPublic: true,
    run: async ({
      email,
      password,
      pin,
      role,
      timezoneOffset,
      timezone,
      isProvider,
    }) => {
      if (!email) {
        throw Error('Empty email');
      }

      const searchCondition = {
        email,
        role,
      };

      if (role === 'provider') {
        searchCondition.memberDesignation = isProvider
          ? {
              $ne: 'pharmacist',
            }
          : 'pharmacist';
      }

      const user = await User.findOne(searchCondition)
        .populate({
          path: 'activeProviderPractice',
          populate: {
            path: 'practice',
            model: 'Practice',
          },
        })
        .exec();

      if (user) {
        if (password) {
          if (bcrypt.compareSync(password, user.password || '')) {
            return createAuthResponse(user, timezoneOffset, timezone);
          }
        }
        if (pin) {
          if (user.pin === pin) {
            return createAuthResponse(user, timezoneOffset, timezone);
          }
        }
      }

      throw new GraphQLUserError('Invalid credentials');
    },
  },
  {
    key: 'cognitoLogin',
    prototype: '(idToken: String!, accessToken: String!): Auth',
    mutation: true,
    isPublic: true,
    run: async ({ idToken, accessToken }) => {
      if (!idToken) {
        throw Error('Empty idToken');
      }

      let claims;
      try {
        claims = await verifyCognitoIdToken(idToken);
      } catch (e) {
        console.error('[cognitoLogin] verify failed:', e.message);
        throw Error('Invalid Cognito token');
      }

      const email = claims.email;
      if (!email) {
        throw Error('Cognito token missing email');
      }

      // Decide role: temporary default to 'provider'
      const role = 'provider'; // may eventually derive from claims (e.g., claims["custom:role"])
      let user = await User.findOne({ email, role }).exec();

      if (!user) {
        // Minimal upsert; temporary designation
        user = new User({
          email,
          role,
          firstName: claims.given_name || '',
          lastName: claims.family_name || '',
          memberDesignation: 'doctor', // or placeholder
          status: 'onboarded', // or 'pending'
        });
        await user.save();
      }

      // Optionally update names if changed
      let updated = false;
      if (claims.given_name && claims.given_name !== user.firstName) {
        user.firstName = claims.given_name;
        updated = true;
      }
      if (claims.family_name && claims.family_name !== user.lastName) {
        user.lastName = claims.family_name;
        updated = true;
      }
      if (updated) await user.save();

      // Leverage existing response builder (no timezone from Cognito, pass nulls for now)
      return createAuthResponse(user, null, null);
    },
  },
  {
    key: 'requestResetPassword',
    prototype: '(email: String!): Boolean',
    mutation: true,
    isPublic: true,
    run: async ({ email }) => {
      if (!email || email.trim().length === 0) {
        return false;
      }
      const user = await User.findOne({ email });

      if (!user) {
        return false;
      }

      let expireAt = new Date();
      expireAt.setTime(expireAt.getTime() + 3600 * 1000);
      const resetPasswordToken = jwt.sign(
        { _id: user._id, email, expireAt },
        process.env.SUPER_PASSWORD
      );
      await User.updateOne({ _id: user._id }, { resetPasswordToken });
      let hostUrl;
      if (user.role === 'provider') {
        hostUrl =
          user.memberDesignation === 'pharmacist'
            ? process.env.HOST_URL_PHARMACIST
            : process.env.HOST_URL_PROVIDER;
      } else {
        hostUrl = process.env.HOST_URL_PATIENT;
      }
      sendResetPasswordEmail(
        email,
        getFullName(user),
        `${hostUrl}/auth/reset-password?token=${resetPasswordToken}`
      );
      return true;
    },
  },
  {
    key: 'checkResetPasswordToken',
    prototype: '(token: String!): String!',
    isPublic: true,
    run: async ({ token }) => {
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.SUPER_PASSWORD);
      } catch (error) {
        return 'INVALID_TOKEN';
      }
      const { _id, email, expireAt } = decoded;
      const user = await User.findById(_id);

      if (!user || email.toLowerCase() !== user.email.toLowerCase()) {
        return 'INVALID_TOKEN';
      }

      const now = new Date();
      if (now.getTime() > new Date(expireAt).getTime()) {
        return 'TOKEN_EXPIRED';
      }

      return 'VALID_TOKEN';
    },
  },
  {
    key: 'resetPassword',
    prototype: '(token: String!, security: UserSecurityInput!): String!',
    mutation: true,
    isPublic: true,
    run: async ({ token, security }) => {
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.SUPER_PASSWORD);
      } catch (error) {
        return 'INVALID_TOKEN';
      }
      const { _id, email, expireAt } = decoded;
      const user = await User.findById(_id);

      if (!user || email.toLowerCase() !== user.email.toLowerCase()) {
        return 'INVALID_TOKEN';
      }

      const now = new Date();
      if (now.getTime() > new Date(expireAt).getTime()) {
        return 'TOKEN_EXPIRED';
      }

      const data = {};
      if (security.password?.length > 0) {
        data.password = bcrypt.hashSync(security.password, 10);
      } else {
        return 'FAILED';
      }

      if (security.pin?.length === 4) {
        data.pin = security.pin;
      } else {
        return 'FAILED';
      }

      if (Object.keys(data).length > 0) {
        await User.findByIdAndUpdate(_id, data);
        sendResetPasswordSuccessEmail(email, getFullName(user));
        return 'SUCCESS';
      }

      return 'FAILED';
    },
  },
  {
    key: 'me',
    prototype: ': AuthUser',
    run: async (_, { user }) => {
      return user;
    },
  },
  {
    key: 'updateMe',
    prototype: '(provider: ProviderInput!): Auth',
    mutation: true,
    run: async ({ provider }, { user }) => {
      try {
        const { user: newUser, ...restData } = provider;

        const info = {
          email: {
            value: newUser.email,
            message: ERROR_MESSAGE.DUPLICATE_EMAIL,
          },
          'phones.mobile': {
            value: newUser.phones.mobile,
            message: ERROR_MESSAGE.DUPLICATE_PHONE_NUMBER,
          },
          'phones.work': {
            value: newUser.phones.work,
            message: ERROR_MESSAGE.DUPLICATE_PHONE_NUMBER,
          },
          'phones.home': {
            value: newUser.phones.home,
            message: ERROR_MESSAGE.DUPLICATE_PHONE_NUMBER,
          },
          npi: {
            value: provider.npi,
            message: ERROR_MESSAGE.DUPLICATE_NPI,
          },
        };

        const errorMessage = await checkDuplicatedInfo(true, info, user._id);

        if (errorMessage !== null) {
          throw Error(errorMessage);
        }

        const updated = await User.findByIdAndUpdate(
          user._id,
          {
            ...newUser,
            ...restData,
          },
          {
            new: true,
          }
        );

        return createAuthResponse(updated);
      } catch (error) {
        return createAuthError(error);
      }
    },
  },
  {
    key: 'updateSecurity',
    prototype: '(security: UserSecurityInput!): Boolean',
    mutation: true,
    run: async ({ security }, { user }) => {
      const data = {};
      if (security.currentPassword && security.password) {
        if (bcrypt.compareSync(security.currentPassword, user.password)) {
          data.password = bcrypt.hashSync(security.password, 10);
        } else {
          throw Error('The current password is wrong.');
        }
      }

      if (security.currentPin && security.pin) {
        if (security.currentPin === user.pin) {
          data.pin = security.pin;
        } else {
          throw Error('The current 4-digit code is wrong.');
        }
      }

      if (Object.keys(data).length > 0) {
        await User.findByIdAndUpdate(user._id, data);

        return true;
      }

      return false;
    },
  },
  {
    key: 'requestCode',
    prototype: '(fullName: String!, email: String!, phone: String!): Boolean',
    mutation: true,
    isPublic: true,
    run: async (data) => {
      const { fullName, email, phone } = data;
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

      const code = Math.ceil(Math.random() * 100000)
        .toString()
        .padStart(5, '0');

      await PendingUser.updateOne(
        {
          email,
        },
        {
          fullName,
          email,
          phone,
          code,
        },
        {
          upsert: true,
        }
      ).exec();
      sendRegCode(email, fullName, code);
      sendMessage(
        phone,
        `Your Gazuntite invitation code is ${code}\n\n
        @gazuntite.com #${code}`
      );

      return true;
    },
  },
  {
    key: 'verifyCode',
    prototype: '(email: String!, code: String!): Auth',
    mutation: true,
    isPublic: true,
    run: async ({ email, code }) => {
      const pendingUser = await PendingUser.findOne({ email }).exec();

      if (pendingUser.code !== code.toUpperCase()) {
        throw Error('The code is wrong. Please try again.');
      }

      const existing = await User.exists({ email, status: 'onboarded' });
      if (existing) {
        throw Error(ERROR_MESSAGE.DUPLICATE_EMAIL);
      }

      const firstName = pendingUser.fullName.split(' ').slice(0, -1).join(' ');
      const lastName = pendingUser.fullName.split(' ').slice(-1).join(' ');

      const user = await User.findOneAndUpdate(
        {
          email,
        },
        {
          firstName,
          lastName,
          email,
          phones: {
            mobile: pendingUser.phone,
          },
          role: 'provider',
        },
        {
          upsert: true,
          new: true,
        }
      ).exec();

      return createAuthResponse(user);
    },
  },
  {
    key: 'registerPatient',
    prototype:
      '(password: String!, pin: String!, timezoneOffset: Int, timezone: String): Auth',
    mutation: true,
    run: async ({ password, pin, timezoneOffset, timezone }, { user }) => {
      try {
        const updated = await User.findByIdAndUpdate(
          user._id,
          {
            password: bcrypt.hashSync(password, 10),
            status: 'onboarded',
            pin,
          },
          {
            new: true,
          }
        ).exec();

        return createAuthResponse(updated, timezoneOffset, timezone);
      } catch (error) {
        return createAuthError(error);
      }
    },
  },
];