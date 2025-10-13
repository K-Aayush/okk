import mongoose from 'mongoose';
import { Appointment, Call, User } from '../db';
import { canJoinCall } from '../utils/call';
import {
  createVideoRoomAccessToken,
  makePSTNCall,
  dropPSTNCall,
} from '../services/twilio';
import { checkDateForPeriod, createAuthResponse } from '../utils';
import socketManager from '../services/socket-manager';
import SOCKET_EVENTS from '../services/socket-manager/constants';

export default [
  {
    key: 'instantCall',
    prototype: '(user: String!, referredPatient: String): Call',
    run: async ({ user: calleeId, referredPatient }, { user }) => {
      const callee = await User.findById(calleeId).lean();
      if (!callee) {
        throw new Error('User not found');
      }
      if (user.role === 'patient' && callee.role === 'provider') {
        referredPatient = user._id;
      } else if (user.role === 'patient' && callee.role === 'patient') {
        referredPatient = null;
      }
      let call = await Call.findOne({
        callType: 'unscheduled',
        'attendees.user': { $all: [user._id, calleeId] },
        referredPatient,
      })
        .populate(['attendees.user', 'referredPatient'])
        .sort({ createdAt: -1 });

      if (!call || !canJoinCall(call)) {
        call = await createCall(
          'unscheduled',
          [user._id, calleeId],
          referredPatient
        );
      }

      socketManager.sendMessage(calleeId, SOCKET_EVENTS.MEET_NOW, {
        caller: user._id,
        referredPatient,
      });

      return Object.assign({}, call.toObject(), {
        token: createVideoRoomAccessToken(call._id, user._id),
      });
    },
  },
  {
    key: 'pstnCall',
    prototype:
      '(user: ID!, number: String!, type: String!, referredPatient: ID): Call',
    run: async (
      {
        user: calleeId,
        number: phone,
        type,
        referredPatient: referredPatientId,
      },
      { user }
    ) => {
      const callee = await User.findById(calleeId);
      const call = await createCall(
        'unscheduled',
        [user._id, calleeId],
        referredPatientId,
        true
      );

      const callMasking = user.phones?.masking;
      let fromNumber = user.phones.mobile || user.phones.work;
      if (callMasking) {
        if (callMasking === 'mobile' && user.phones.mobile) {
          fromNumber = user.phones.mobile;
        } else if (
          callMasking === 'work' &&
          user.activeProviderPractice.practice.phone
        ) {
          fromNumber = user.activeProviderPractice.practice.phone;
        } else if (callMasking === 'home' && user.phones.home) {
          fromNumber = user.phones.home;
        }
      }
      fromNumber = '540-246-0638';

      const pstnResult = await makePSTNCall(fromNumber, phone, call._id);
      await Call.findOneAndUpdate(
        {
          _id: call._id,
        },
        {
          pstnInfo: {
            type,
            number: phone,
            sid: pstnResult.sid,
          },
        }
      );

      return Object.assign({}, call.toObject(), {
        token: createVideoRoomAccessToken(call._id, user._id),
      });
    },
  },
  {
    key: 'appointmentCall',
    prototype: '(appointment: ID!): Call',
    run: async ({ appointment: appointmentId }, { user }) => {
      const appointment = await Appointment.findById(appointmentId);
      if (!appointment) {
        throw new Error('Appointment not found');
      }
      let call = await Call.findOne({
        appointment: appointmentId,
        'attendees.user': user._id,
      })
        .sort({ createdAt: -1 })
        .populate(['attendees.user', 'referredPatient']);
      const participantIds =
        appointment.providers.length > 1
          ? appointment.providers
          : [appointment.providers[0], appointment.patient];
      if (!call || (call.status !== 'active' && call.status !== 'scheduled')) {
        call = await createCall(
          'scheduled',
          participantIds,
          appointment.patient,
          false,
          appointmentId
        );
      }

      const appointmentUpdateStatus = {
        status: 'active',
        joined: appointment.joined || [],
      };
      if (!appointmentUpdateStatus.joined.includes(user._id)) {
        appointmentUpdateStatus.joined.push(user._id);
      }

      await Appointment.findOneAndUpdate(
        { _id: appointmentId },
        appointmentUpdateStatus
      );

      for (let participantId of participantIds) {
        socketManager.sendMessage(
          participantId,
          SOCKET_EVENTS.APPOINTMENT_UPDATE,
          {
            appointment: appointmentId,
            payload: {
              status: 'active',
              joined: user._id,
            },
          }
        );
      }

      return Object.assign({}, call.toObject(), {
        token: createVideoRoomAccessToken(call._id, user._id),
      });
    },
  },
  {
    key: 'updateCallStatus',
    prototype: '(call: String!, status: String!, time: Date!): Boolean',
    mutation: true,
    run: async ({ call: callId, status, time }, { user }) => {
      const call = await Call.findById(callId);
      if (!call) {
        throw new Error('Call does not exists!');
      }

      if (
        status === 'started' &&
        (call.status === 'scheduled' || call.status === 'active')
      ) {
        if (!call.startTime) {
          call.startTime = time;
        }
        call.status = 'active';
      }

      if (status === 'ended' && call.status === 'active' && !!call.startTime) {
        call.endTime = time;
        call.status = 'completed';
      }

      if (call.isPSTN && status === 'ended') {
        dropPSTNCall(call.pstnInfo.sid);
      }

      await call.save();
      return true;
    },
  },
  {
    key: 'callHistory',
    prototype: '(user: ID, period: String): [CallHistory]',
    run: async ({ user: userId, period }, { user }) => {
      const checkDate = checkDateForPeriod(period || 'all');
      const conditions = {
        'attendees.user': user._id,
      };
      if (userId) {
        conditions.$or = [
          { 'attendees.user': userId },
          { referredPatient: userId },
        ];
      }
      if (period !== 'all') {
        conditions.createdAt = { $gt: checkDate };
      }
      return await Call.find(conditions)
        .sort({ createdAt: -1 })
        .populate(['attendees.user', 'referredPatient']);
    },
  },
  {
    key: 'callFromToken',
    prototype: '(token: String!): CallFromToken',
    isPublic: true,
    run: async ({ token }, { user }) => {
      const appointment = await Appointment.findOne({
        'accessTokens.token': token,
        status: { $in: ['scheduled', 'active'] },
      })
        .populate(['creator', 'patient', 'provider'])
        .lean();
      if (!appointment) {
        throw new Error('Invalid token');
      }
      const tokenUser = appointment.accessTokens.find(
        (tokenObject) => tokenObject.token === token
      );
      if (!tokenUser) {
        throw new Error('Invalid token');
      }
      if (user) {
        if (user._id.toString() !== tokenUser.user.toString()) {
          throw new Error('Invalid token');
        }
        return { me: { user }, appointment };
      }
      const authUser = await User.findById(tokenUser.user)
        .populate({
          path: 'activeProviderPractice',
          populate: 'practice',
        })
        .exec();
      if (!authUser) {
        throw new Error('Invalid token');
      }
      const authResponse = await createAuthResponse(authUser, null, null, true);
      return {
        me: authResponse,
        appointment,
      };
    },
  },
];

const createCall = async (
  type,
  participantIds,
  patientId = null,
  isPSTN = false,
  appointmentId = null
) => {
  const call = await Call.create([
    {
      attendees: participantIds.map((userId) => {
        return {
          user: userId,
        };
      }),
      status: type === 'scheduled' ? 'scheduled' : 'active',
      callType: type,
      isPSTN,
      referredPatient: patientId,
      appointment: appointmentId,
    },
  ]);
  return await Call.findById(call[0]._id)
    .populate('attendees.user')
    .populate('referredPatient')
    .exec();
};
