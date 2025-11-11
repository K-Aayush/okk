import mongoose from 'mongoose';

import { Appointment } from '../db';
import socketManager from '../services/socket-manager';
import SOCKET_EVENTS from '../services/socket-manager/constants';
import {
  addAppointment,
  sendAppointmentNotifications,
  sendAppointmentCancellationNotifications,
  sendAppointmentRescheduleNotifications,
  cancelBackgroundJob,
} from '../services/appointment';

export default [
  {
    key: 'bookAppointment',
    prototype: '(appointment: AppointmentInput!): Appointment',
    mutation: true,
    run: async ({ appointment }, { user }) => {
      let newAppointmentId;
      const { patient, provider, reason, time } = appointment;
      const session = await mongoose.startSession();

      await session.withTransaction(async () => {
        newAppointmentId = await addAppointment(
          user._id,
          patient,
          [user.role === 'provider' ? user._id : provider, provider],
          reason,
          time,
          session
        );
        if (newAppointmentId === false) {
          throw new Error('Appointment time unavailable.');
        }
      });

      session.endSession();

      socketManager.sendMessage(patient, SOCKET_EVENTS.APPOINTMENTS);
      socketManager.sendMessage(provider, SOCKET_EVENTS.APPOINTMENTS);
      socketManager.sendMessage(user._id, SOCKET_EVENTS.APPOINTMENTS);

      const appointmentData = await sendAppointmentNotifications(
        newAppointmentId,
        user
      );
      return appointmentData.appointment;
    },
  },
  {
    key: 'cancelAppointment',
    prototype: '(appointment: ID!): Boolean',
    mutation: true,
    run: async ({ appointment: appointmentId }, { user }) => {
      const session = await mongoose.startSession();
      const appointment = await Appointment.findById(appointmentId);

      if (!appointment) {
        return false;
      }
      if (
        user._id.toString() !== appointment.providers[0].toString() &&
        (appointment.providers.length > 1
          ? user._id.toString() !== appointment.providers[1].toString()
          : user._id.toString() !== appointment.patient.toString())
      ) {
        return false;
      }

      await session.withTransaction(async () => {
        await Appointment.findByIdAndUpdate(
          appointmentId,
          { status: 'cancelled' },
          { session }
        );
      });

      cancelBackgroundJob(appointmentId);

      session.endSession();
      for (let provider of appointment.providers) {
        socketManager.sendMessage(provider, SOCKET_EVENTS.APPOINTMENTS);
      }
      socketManager.sendMessage(
        appointment.patient,
        SOCKET_EVENTS.APPOINTMENTS
      );
      sendAppointmentCancellationNotifications(appointmentId);
      return true;
    },
  },
  {
    key: 'rescheduleAppointment',
    prototype:
      '(appointment: ID!, newAppointment: AppointmentInput!): Appointment',
    mutation: true,
    run: async ({ appointment: appointmentId, newAppointment }, { user }) => {
      const appointment = await Appointment.findById(appointmentId);
      if (!appointment) {
        throw new Error('Appointment not found');
      }
      let newAppointmentId;
      const { patient, provider, reason, time } = newAppointment;
      const session = await mongoose.startSession();

      await session.withTransaction(async () => {
        await Appointment.findByIdAndUpdate(
          appointmentId,
          {
            status: 'rescheduled',
          },
          { session }
        );
        cancelBackgroundJob(appointmentId);
        newAppointmentId = await addAppointment(
          user._id,
          patient,
          [user._id, provider],
          reason,
          time,
          session
        );
        if (newAppointmentId === false) {
          throw new Error('Appointment time unavailable.');
        }
      });

      session.endSession();

      socketManager.sendMessage(patient, SOCKET_EVENTS.APPOINTMENTS);
      socketManager.sendMessage(provider, SOCKET_EVENTS.APPOINTMENTS);

      const appointmentData = await sendAppointmentRescheduleNotifications(
        appointmentId,
        newAppointmentId,
        user
      );
      return appointmentData.appointment;
    },
  },
  {
    key: 'appointments',
    prototype: '(from: Date, to: Date, patient: ID): [Appointment]',
    run: async ({ from, to, patient }, { user }) => {
      const conditions = {
        time: { $gte: from, $lt: to },
      };
      if (user.role === 'provider') {
        conditions.providers = user._id;
        if (patient) {
          conditions.patient = patient;
        }
      } else {
        conditions.patient = user._id;
        conditions.providers = { $size: 1 };
      }
      const appointments = await Appointment.find(conditions)
        .sort({ time: 1 })
        .populate(['creator', 'patient', 'providers'])
        .lean();
      return appointments;
    },
  },
];
