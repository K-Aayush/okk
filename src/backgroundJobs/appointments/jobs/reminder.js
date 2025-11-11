import AppointmentJob from '../abstractJob';
import { Appointment } from '../../../db';
import { sendAppointmentReminderNowSMS } from '../../../services/twilio';
import { sendAppointmentReminderNowEmail } from '../../../services/mailer';
import {
  buildPracticeUrlForUser,
  createCalendarLinks,
  formatTitleAndName,
  getNotificationInfo,
} from '../../../utils';
import socketManager from '../../../services/socket-manager';
import SOCKET_EVENTS from '../../../services/socket-manager/constants';
import moment from 'moment';

const YELLOW = '#FFF36A';
class AppointmentReminderJob extends AppointmentJob {
  static type = 'appointmentReminderJob';

  static generateJobId(id) {
    return `appt-reminder-now-${id}`;
  }

  serializeData() {
    return this.data;
  }

  ///
  /// Needs to be changed to work with provider-provider appointment
  ///

  async deserializeData() {
    // fetching appointment model from database
    const appointmentId = this.data.id;
    const appointment = await Appointment.findById(appointmentId).populate([
      {
        path: 'providers',
        populate: { path: 'activeProviderPractice', populate: ['practice'] },
      },
      'patient',
    ]);
    return {
      appointment,
    };
  }

  async run() {
    const { appointment } = await this.deserializeData();
    if (!appointment) {
      return;
    }

    const users = [appointment.providers[0]];

    if (appointment.providers.length > 1) {
      users.push(appointment.providers[1]);
    } else {
      users.push(appointment.patient);
    }

    for (let i = 0; i < 2; i++) {
      const otherUser = users[(i + 1) % 2];
      const user = users[i];

      const practiceName =
        otherUser.role === 'patient'
          ? user.activeProviderPractice.practice.name
          : otherUser.activeProviderPractice.practice.name;

      const time = moment.tz(appointment.time, user.timezone);
      const timeString = time.format('MM-DD-YYYY, ddd, hh:mm a z');
      const meetToken = appointment.accessTokens?.find(
        (token) => token.user.toString() === user._id.toString()
      );
      const meetUrl = await buildPracticeUrlForUser(
        `/join-call?token=${encodeURIComponent(meetToken?.token)}`,
        user
      );
      const portalUrl = await buildPracticeUrlForUser(`/`, user);

      const { googleLink } = createCalendarLinks({
        title: `${practiceName} appointment with ${formatTitleAndName(
          otherUser
        )}`,
        description: 'Call or Video appointment',
        start: new Date(appointment.time),
        duration: [5, 'minute'],
        guests: [],
      });

      const { email, sms } = await getNotificationInfo(user);

      // disable notification for patient
      if (user.role === 'provider') {
        email &&
          (await sendAppointmentReminderNowEmail(email, practiceName, {
            subject: `Don't forget your ${practiceName} appointment with ${formatTitleAndName(
              otherUser
            )} is NOW`,
            header: practiceName,
            body: `${practiceName} appointment <span style="background-color:${YELLOW}">NOW</span>`,
            cardHeader: `Call or Video appointment with ${formatTitleAndName(
              otherUser
            )}`,
            cardBody1: `${practiceName} appointment`,
            cardBody2: `<span style="background-color:${YELLOW}">NOW:</span> ${timeString}`,
            portalUrl,
            calendarUrl: googleLink,
          }));
        sms &&
          (await sendAppointmentReminderNowSMS(sms, {
            header: `Don't forget your ${practiceName} appointment with ${formatTitleAndName(
              otherUser
            )} is NOW`,
            time: timeString,
            portalUrl,
            calendarUrl: googleLink,
          }));
      }

      socketManager.sendMessage(user._id, SOCKET_EVENTS.APPOINTMENT_REMINDER, {
        appointment,
        user: otherUser,
        patient: appointment.patient,
      });
    }
  }
}

export default AppointmentReminderJob;
