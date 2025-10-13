export default class {
  static jobQueue;
  static backoffDelays;

  static async enqueueJob(data, options) {
    const defaultOptions = { removeOnComplete: true, removeOnFail: true };
    if (this.backoffDelays) {
      defaultOptions.attempts = this.backoffDelays.length + 1; // +1 is for first enqueue try
      defaultOptions.backoff = {
        type: 'customBackoffStrategy',
      };
    }
    const enqueueOptions = Object.assign({}, defaultOptions, options);
    if (data.meta.jobId) {
      const job = await this.jobQueue.getJob(data.meta.jobId);
      if (!!job) {
        job.remove();
      }
      enqueueOptions.jobId = data.meta.jobId;
    }
    return this.jobQueue.add(data, enqueueOptions);
  }
}
