import AbstractJobFactory from '../abstractFactory';

// import actual job implementation
import CareplanTaskReminderJob from './jobs/taskReminder';

const JOB_IMPLEMENTATIONS = [CareplanTaskReminderJob];

const jobImplementations = {};
JOB_IMPLEMENTATIONS.forEach((clazz) => {
  jobImplementations[clazz.type] = clazz;
});

export default class extends AbstractJobFactory {
  static jobImplementations = jobImplementations;
}
