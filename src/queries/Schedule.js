import mongoose from 'mongoose';
import moment from 'moment';
import { ProviderPractice, User, Appointment } from '../db';
import { hourToDate } from '../utils/time';

export default [
  {
    key: 'operationSchedule',
    prototype: ': [Schedule!]',
    run: async ({}, { user }) => {
      if (user.role !== 'provider') {
        throw new Error('Invalid user type');
      }

      const provider = await ProviderPractice.findById(
        user.activeProviderPractice
      );

      return provider.operationSchedule;
    },
  },
  {
    key: 'availableTimes',
    prototype:
      '(provider: ID!, from: Date!, to: Date!, offset: Int): [TimeRange!]',
    run: async ({ provider: providerId, from, to, offset }, { user }) => {
      const provider = await User.findById(providerId).populate([
        'activeProviderPractice',
      ]);
      if (!provider) {
        throw new Error('Provider does not exist');
      }
      const schedules = provider.activeProviderPractice?.operationSchedule;
      if (!schedules || schedules.length === 0) {
        return null;
      }
      const providerOffset = parseInt(provider.timezoneOffset || offset, 10);
      const fromLocal = moment(from).utcOffset(providerOffset);
      const toLocal = moment(to).utcOffset(providerOffset);
      let start = fromLocal.clone();
      start.set({ hour: 0, minute: 0, second: 0, milliseconds: 0 });
      const hours = [];
      while (start.isBefore(toLocal)) {
        const weekday = start.weekday();
        const schedule = schedules.find((elem) => elem.days.includes(weekday));
        if (schedule) {
          const duration = schedule.duration;
          const dayStart = hourToDate(schedule.from, start);
          let dayEnd = hourToDate(schedule.to, start);
          if (dayEnd.isAfter(toLocal)) {
            dayEnd = toLocal;
          }
          if (start.isBefore(dayStart)) {
            start = dayStart;
          }
          if (start.isBefore(dayEnd)) {
            let end = start.clone();
            end.add(duration, 'm');
            const scheduledAppointments = await Appointment.find({
              providers: providerId,
              status: { $in: ['scheduled', 'active', 'completed'] },
              time: { $gte: dayStart.toDate(), $lt: dayEnd.toDate() },
            });
            while (!start.isBefore(dayStart) && !end.isAfter(dayEnd)) {
              if (!start.isBefore(fromLocal)) {
                let canAdd = true;
                if (schedule.breakOn) {
                  for (let breakHours of schedule.breaks) {
                    const breakStart = hourToDate(breakHours.from, dayStart);
                    const breakTo = hourToDate(breakHours.to, dayStart);
                    if (start.isBefore(breakTo) && end.isAfter(breakStart)) {
                      canAdd = false;
                      break;
                    }
                  }
                }
                if (canAdd) {
                  for (let appointment of scheduledAppointments) {
                    const appointmentTime = moment(appointment.time);
                    if (
                      !start.isAfter(appointmentTime) &&
                      end.isAfter(appointmentTime)
                    ) {
                      canAdd = false;
                      break;
                    }
                  }
                  if (canAdd) {
                    hours.push({
                      start: start.toDate(),
                      end: end.toDate(),
                    });
                  }
                }
              }
              start = end;
              end = start.clone();
              end.add(duration, 'm');
            }
          }
        }

        start.set({ hour: 0, minute: 0, second: 0, milliseconds: 0 });
        start.add(1, 'd');
      }

      return hours;
    },
  },
  {
    key: 'updateOperationSchedule',
    prototype: '(schedule: [ScheduleInput!]): Boolean',
    mutation: true,
    run: async ({ schedule }, { user }) => {
      if (user.role !== 'provider') {
        throw new Error('Invalid user type');
      }
      const session = await mongoose.startSession();

      await session.withTransaction(async () => {
        await ProviderPractice.update(
          { _id: user.activeProviderPractice },
          { operationSchedule: schedule },
          { session }
        );
      });

      session.endSession();

      return true;
    },
  },
];
