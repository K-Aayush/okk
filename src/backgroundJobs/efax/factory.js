import AbstractJobFactory from '../abstractFactory';

// import actual job implementation
import FetchInboxJob from './jobs/fetch';

const JOB_IMPLEMENTATIONS = [FetchInboxJob];

const jobImplementations = {};
JOB_IMPLEMENTATIONS.forEach((clazz) => {
  jobImplementations[clazz.type] = clazz;
});

export default class extends AbstractJobFactory {
  static jobImplementations = jobImplementations;
}
