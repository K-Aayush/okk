import AbstractJobFactory from '../abstractFactory';

// import actual job implementation
import CreateRecordJob from './jobs/createRecord';

const JOB_IMPLEMENTATIONS = [CreateRecordJob];

const jobImplementations = {};
JOB_IMPLEMENTATIONS.forEach((clazz) => {
  jobImplementations[clazz.type] = clazz;
});

export default class extends AbstractJobFactory {
  static jobImplementations = jobImplementations;
}
