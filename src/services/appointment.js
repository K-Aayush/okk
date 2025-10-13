import moment from 'moment-timezone';
import mongoose from 'mongoose';

import AppointmentReminderJob from '../backgroundJobs/appointments/jobs/reminder';
import AppointmentMarkCompleteStatusJob from '../backgroundJobs/appointments/jobs/markCompleteStatus';
import { Appointment } from '../db';
import {
  sendAppointmentEmail,
  sendAppointmentCancellationEmail,
} from '../services/mailer';
import {
  sendAppointmentCancellationSMS,
  sendAppointmentSMS,
} from '../services/twilio';
import {
  formatTitleAndName,
  createCalendarLinks,
  getNotificationInfo,
  createCallToken,
  buildPracticeUrlForUser,
} from '../utils';
import { getUserPractice } from '../utils/practice';

export const cancelBackgroundJob = (appointmentId) => {
  AppointmentReminderJob.removeJob(appointmentId);
  AppointmentMarkCompleteStatusJob.removeJob(appointmentId);
};

export const addAppointment = async (
  creator,
  patient,
  providers,
  reason,
  time,
  session
) => {
  if (!providers || providers.length === 0) {
    return false;
  }
  let providerIds = [];
  if (
    providers.length > 1 &&
    providers[0].toString() === providers[1].toString()
  ) {
    providerIds = [providers[0]];
  } else {
    providerIds = providers;
  }

  const checkAppointment = await Appointment.findOne({
    time,
    providers: providerIds.length > 1 ? providerIds[1] : providerIds[0],
    status: { $in: ['scheduled', 'active'] },
  });
  if (checkAppointment) {
    return false;
  }

  const _id = mongoose.Types.ObjectId().toString();
  const appointmentUsers = [providerIds[0]];
  if (providerIds.length > 1) {
    appointmentUsers.push(providerIds[1]);
  } else {
    appointmentUsers.push(patient?._id || patient);
  }

  const accessTokens = [];
  for (let userId of appointmentUsers) {
    accessTokens.push({
      user: userId,
      token: createCallToken(_id, userId),
    });
  }

  const newAppointments = await Appointment.create(
    [
      {
        _id,
        creator,
        patient,
        providers: providerIds,
        reason,
        time,
        accessTokens,
        status: 'scheduled',
      },
    ],
    { session }
  );

  const newAppointmentId = newAppointments[0]._id;

  // registering crons
  const reminderJobDelay =
    new Date(time).getTime() - new Date().getTime() - 1000 * 60;

  if (reminderJobDelay >= 0) {
    const reminderJob = new AppointmentReminderJob({
      id: newAppointmentId,
    });
    reminderJob.enqueueDelay = reminderJobDelay;
    reminderJob.enqueue();
  }

  const completeJobDelay = reminderJobDelay + 60 * 1000 + 4 * 3600 * 1000;
  if (completeJobDelay) {
    const completeJob = new AppointmentMarkCompleteStatusJob({
      id: newAppointmentId,
    });
    completeJob.enqueueDelay = completeJobDelay;
    completeJob.enqueue();
  }

  return newAppointmentId;
};

export const sendAppointmentNotifications = async (
  appointmentId,
  creator,
  sendSmsEmail = true
) => {
  const newAppointment = await Appointment.findById(appointmentId)
    .populate([
      'patient',
      {
        path: 'providers',
        populate: {
          path: 'activeProviderPractice',
          populate: 'practice',
        },
      },
      'creator',
    ])
    .lean();

  const time = newAppointment.time;
  const bookingUser =
    creator?.role === 'patient'
      ? newAppointment.patient
      : newAppointment.providers[0];
  const appointedUser =
    creator?.role === 'patient'
      ? newAppointment.providers[0]
      : newAppointment.providers.length > 1
      ? newAppointment.providers[1]
      : newAppointment.patient;
  const bookingUserPractice = await getUserPractice(bookingUser);
  const appointedUserPractice = await getUserPractice(appointedUser);

  let portalUrl, googleLink;
  // disable for patient
  if (appointedUser.role === 'provider') {
    if (sendSmsEmail) {
      const practiceName = bookingUserPractice?.name || '';
      const providerName = formatTitleAndName(bookingUser);
      const apptTime = moment.tz(time, appointedUser.timezone);
      const timeString = apptTime.format('MM-DD-YYYY, ddd, hh:mm a z');
      const meetToken = newAppointment.accessTokens?.find(
        (token) => token.user.toString() === appointedUser._id.toString()
      );
      const meetUrl = await buildPracticeUrlForUser(
        `/join-call?token=${encodeURIComponent(meetToken?.token)}`,
        appointedUser
      );
      portalUrl = await buildPracticeUrlForUser(`/`, appointedUser);

      const calendarLinks = createCalendarLinks({
        title: `${practiceName} appointment with ${providerName}`,
        description: 'Call or Video appointment',
        start: new Date(time),
        duration: [5, 'minute'],
        guests: [],
      });
      googleLink = calendarLinks.googleLink;

      const { email, sms } = await getNotificationInfo(appointedUser);
      email &&
        sendAppointmentEmail(email, practiceName, {
          subject: `Your ${practiceName} appointment with ${providerName} is confirmed.`,
          header: practiceName,
          body: 'Your virtual visit has been confirmed.',
          cardHeader: `Call or Video appointment with ${providerName}`,
          cardBody1: `${practiceName} appointment`,
          cardBody2: `On: ${timeString}`,
          portalUrl,
          calendarUrl: googleLink,
        });
      sms &&
        sendAppointmentSMS(sms, {
          header: `Your ${practiceName} appointment with ${providerName} is confirmed for:`,
          time: timeString,
          portalUrl,
          calendarUrl: googleLink,
        });
    }
  }

  // disable for patient
  if (bookingUser.role === 'provider') {
    if (sendSmsEmail) {
      const bookedPracticeName = appointedUserPractice?.name || '';
      const bookedUserName = formatTitleAndName(appointedUser);
      const bookingUserApptTime = moment.tz(time, bookingUser.timezone);
      const bookingApptTimeString = bookingUserApptTime.format(
        'MM-DD-YYYY, ddd, hh:mm a z'
      );
      const bookingMeetToken = newAppointment.accessTokens?.find(
        (token) => token.user.toString() === bookingUser._id.toString()
      );
      const bookingMeetUrl = await buildPracticeUrlForUser(
        `/join-call?token=${encodeURIComponent(bookingMeetToken?.token)}`,
        bookingUser
      );
      const bookingPortalUrl = await buildPracticeUrlForUser(`/`, bookingUser);

      const { googleLink: bookingGoogleLink } = createCalendarLinks({
        title: `${bookedPracticeName} appointment with ${bookedUserName}`,
        description: 'Call or Video appointment',
        start: new Date(time),
        duration: [5, 'minute'],
        guests: [],
      });

      const { email, sms } = await getNotificationInfo(bookingUser);
      email &&
        sendAppointmentEmail(email, bookedPracticeName, {
          subject: `Your ${bookedPracticeName} appointment with ${bookedUserName} is confirmed.`,
          header: bookedPracticeName,
          body: 'Your virtual visit has been confirmed.',
          cardHeader: `Call or Video appointment with ${bookedUserName}`,
          cardBody1: `${bookedPracticeName} appointment`,
          cardBody2: `On: ${bookingApptTimeString}`,
          portalUrl: bookingPortalUrl,
          calendarUrl: bookingGoogleLink,
        });
      sms &&
        sendAppointmentSMS(sms, {
          header: `Your ${bookedPracticeName} appointment with ${bookedUserName} is confirmed for:`,
          time: bookingApptTimeString,
          portalUrl: bookingPortalUrl,
          calendarUrl: bookingGoogleLink,
        });
    }
  }

  return { appointment: newAppointment, portalUrl, calendarUrl: googleLink };
};

export const sendAppointmentRescheduleNotifications = async (
  previousAppointmentId,
  newAppointmentId,
  creator
) => {
  const previousAppointment = await Appointment.findById(previousAppointmentId)
    .populate([
      'patient',
      {
        path: 'providers',
        populate: {
          path: 'activeProviderPractice',
          populate: 'practice',
        },
      },
      'creator',
    ])
    .lean();
  const newAppointment = await Appointment.findById(newAppointmentId)
    .populate([
      'patient',
      {
        path: 'providers',
        populate: {
          path: 'activeProviderPractice',
          populate: 'practice',
        },
      },
      'creator',
    ])
    .lean();

  const time = newAppointment.time;
  const previousTime = previousAppointment.time;
  const bookingUser =
    creator?.role === 'patient'
      ? newAppointment.patient
      : newAppointment.providers[0];
  const appointedUser =
    creator?.role === 'patient'
      ? newAppointment.providers[0]
      : newAppointment.providers.length > 1
      ? newAppointment.providers[1]
      : newAppointment.patient;
  const bookingUserPractice = await getUserPractice(bookingUser);
  const appointedUserPractice = await getUserPractice(appointedUser);

  let portalUrl, googleLink;
  // disable for patient
  if (appointedUser.role === 'provider') {
    const practiceName = bookingUserPractice?.name || '';
    const providerName = formatTitleAndName(bookingUser);
    const apptTime = moment.tz(time, appointedUser.timezone);
    const timeString = apptTime.format('MM-DD-YYYY, ddd, hh:mm a z');
    const previousApptTime = moment.tz(previousTime, appointedUser.timezone);
    const previousApptTimeString = previousApptTime.format(
      'MM-DD-YYYY, ddd, hh:mm a z'
    );
    //
    const meetToken = newAppointment.accessTokens?.find(
      (token) => token.user.toString() === appointedUser._id.toString()
    );
    const meetUrl = await buildPracticeUrlForUser(
      `/join-call?token=${encodeURIComponent(meetToken?.token)}`,
      appointedUser
    );
    portalUrl = await buildPracticeUrlForUser(`/`, appointedUser);

    const calendarLinks = createCalendarLinks({
      title: `${practiceName} appointment with ${providerName}`,
      description: 'Call or Video appointment',
      start: new Date(time),
      duration: [5, 'minute'],
      guests: [],
    });
    googleLink = calendarLinks.googleLink;

    const { email, sms } = await getNotificationInfo(appointedUser);
    email &&
      sendAppointmentEmail(email, practiceName, {
        subject: `Your ${practiceName} appointment with ${providerName} has been rescheduled.`,
        header: practiceName,
        body: `Your virtual visit at ${previousApptTimeString} has been rescheduled.`,
        cardHeader: `Call or Video appointment with ${providerName}`,
        cardBody1: `${practiceName} appointment`,
        cardBody2: `On: ${timeString}`,
        portalUrl,
        calendarUrl: googleLink,
      });
    sms &&
      sendAppointmentSMS(sms, {
        header: `Your ${practiceName} appointment with ${providerName} at ${previousApptTimeString} has been rescheduled for:`,
        time: timeString,
        portalUrl,
        calendarUrl: googleLink,
      });
  }

  // disable for patient
  if (bookingUser.role === 'provider') {
    const bookedPracticeName = appointedUserPractice?.name || '';
    const bookedUserName = formatTitleAndName(appointedUser);
    const bookingUserApptTime = moment.tz(time, bookingUser.timezone);
    const bookingApptTimeString = bookingUserApptTime.format(
      'MM-DD-YYYY, ddd, hh:mm a z'
    );
    const bookingUserPreviousApptTime = moment.tz(
      previousTime,
      bookingUser.timezone
    );
    const bookingPreviousApptTimeString = bookingUserPreviousApptTime.format(
      'MM-DD-YYYY, ddd, hh:mm a z'
    );
    //
    const bookingMeetToken = newAppointment.accessTokens?.find(
      (token) => token.user.toString() === bookingUser._id.toString()
    );
    const bookingMeetUrl = await buildPracticeUrlForUser(
      `/join-call?token=${encodeURIComponent(bookingMeetToken?.token)}`,
      bookingUser
    );
    const bookingPortalUrl = await buildPracticeUrlForUser(`/`, bookingUser);

    const { googleLink: bookingGoogleLink } = createCalendarLinks({
      title: `${bookedPracticeName} appointment with ${bookedUserName}`,
      description: 'Call or Video appointment',
      start: new Date(time),
      duration: [5, 'minute'],
      guests: [],
    });

    const { email, sms } = await getNotificationInfo(bookingUser);
    email &&
      sendAppointmentEmail(email, bookedPracticeName, {
        subject: `Your ${bookedPracticeName} appointment with ${bookedUserName} has been rescheduled.`,
        header: bookedPracticeName,
        body: `Your virtual visit at ${bookingPreviousApptTimeString} has been rescheduled.`,
        cardHeader: `Call or Video appointment with ${bookedUserName}`,
        cardBody1: `${bookedPracticeName} appointment`,
        cardBody2: `On: ${bookingApptTimeString}`,
        portalUrl: bookingPortalUrl,
        calendarUrl: bookingGoogleLink,
      });
    sms &&
      sendAppointmentSMS(sms, {
        header: `Your ${bookedPracticeName} appointment with ${bookedUserName} at ${bookingPreviousApptTimeString} has been rescheduled for:`,
        time: bookingApptTimeString,
        portalUrl: bookingPortalUrl,
        calendarUrl: bookingGoogleLink,
      });
  }

  return { appointment: newAppointment, portalUrl, calendarUrl: googleLink };
};

export const sendAppointmentCancellationNotifications = async (
  appointmentId
) => {
  const newAppointment = await Appointment.findById(appointmentId)
    .populate([
      'patient',
      {
        path: 'providers',
        populate: {
          path: 'activeProviderPractice',
          populate: 'practice',
        },
      },
    ])
    .lean();

  if (!newAppointment) {
    return;
  }

  const time = newAppointment.time;
  const bookingUser = newAppointment.providers[0];
  const appointedUser =
    newAppointment.providers.length > 1
      ? newAppointment.providers[1]
      : newAppointment.patient;
  const bookingUserPractice = await getUserPractice(bookingUser);
  const appointedUserPractice = await getUserPractice(appointedUser);

  // disable for patient
  if (appointedUser.role === 'provider') {
    const practiceName = bookingUserPractice?.name || '';
    const providerName = formatTitleAndName(bookingUser);
    const apptTime = moment.tz(time, appointedUser.timezone);
    const timeString = apptTime.format('MM-DD-YYYY, ddd, hh:mm a z');
    const portalUrl = await buildPracticeUrlForUser(`/`, appointedUser);

    const { email, sms } = await getNotificationInfo(appointedUser);
    email &&
      sendAppointmentCancellationEmail(email, practiceName, {
        subject: `${practiceName} appointment with ${providerName} has been cancelled.`,
        header: practiceName,
        body: `Your ${practiceName} appointment with ${providerName} at ${timeString} has been cancelled.`,
        portalUrl,
      });
    sms &&
      sendAppointmentCancellationSMS(sms, {
        header: `Your ${practiceName} appointment with ${providerName} at ${timeString} has been cancelled.`,
        portalUrl,
      });
  }

  // disable for patient
  if (bookingUser.role === 'provider') {
    const bookedPracticeName = appointedUserPractice?.name || '';
    const bookedUserName = formatTitleAndName(appointedUser);
    const bookingUserApptTime = moment.tz(time, bookingUser.timezone);
    const bookingApptTimeString = bookingUserApptTime.format(
      'MM-DD-YYYY, ddd, hh:mm a z'
    );
    const bookingPortalUrl = await buildPracticeUrlForUser(`/`, bookingUser);

    const { email, sms } = await getNotificationInfo(bookingUser);
    email &&
      sendAppointmentCancellationEmail(email, bookedPracticeName, {
        subject: `${bookedPracticeName} appointment with ${bookedUserName} has been cancelled.`,
        header: bookedPracticeName,
        body: `Your ${bookedPracticeName} appointment with ${bookedUserName} at ${bookingApptTimeString} has been cancelled.`,
        portalUrl: bookingPortalUrl,
      });
    sms &&
      sendAppointmentCancellationSMS(sms, {
        header: `Your ${bookedPracticeName} appointment with ${bookedUserName} at ${bookingApptTimeString} has been cancelled.`,
        portalUrl: bookingPortalUrl,
      });
  }
};
