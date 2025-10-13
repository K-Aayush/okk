import AbstractJobFactory from '../abstractFactory';

// import actual job implementation
import AppointmentReminderJob from './jobs/reminder';
import AppointmentMarkCompleteStatusJob from './jobs/markCompleteStatus';

const JOB_IMPLEMENTATIONS = [
  AppointmentReminderJob,
  AppointmentMarkCompleteStatusJob,
];

const jobImplementations = {};
JOB_IMPLEMENTATIONS.forEach((clazz) => {
  jobImplementations[clazz.type] = clazz;
});

export default class extends AbstractJobFactory {
  static jobImplementations = jobImplementations;
}
