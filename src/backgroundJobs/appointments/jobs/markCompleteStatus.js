import mongoose from 'mongoose';
import AppointmentJob from '../abstractJob';
import { Appointment } from '../../../db';
import socketManager from '../../../services/socket-manager';
import SOCKET_EVENTS from '../../../services/socket-manager/constants';

class AppointmentMarkCompleteStatusJob extends AppointmentJob {
  static type = 'appointmentMarkCompleteStatusJob';

  static generateJobId(id) {
    return `appt-mark-complete-status-${id}`;
  }

  serializeData() {
    return this.data;
  }

  async deserializeData() {
    const appointmentId = this.data.id;
    const appointment = await Appointment.findById(appointmentId);
    return {
      appointment,
    };
  }

  async run() {
    const { appointment } = await this.deserializeData();

    if (!appointment) {
      return;
    }
    if (appointment.status === 'active' || appointment.status === 'scheduled') {
      const session = await mongoose.startSession();
      await session.withTransaction(async () => {
        await Appointment.updateOne(
          { _id: appointment._id },
          { status: 'completed' },
          { session }
        );
      });

      session.endSession();
      appointment.providers?.forEach((providerId) =>
        socketManager.sendMessage(providerId, SOCKET_EVENTS.APPOINTMENTS)
      );
      if (appointment.providers?.length === 1) {
        socketManager.sendMessage(
          appointment.patient,
          SOCKET_EVENTS.APPOINTMENTS
        );
      }
      return true;
    }
  }
}

export default AppointmentMarkCompleteStatusJob;
