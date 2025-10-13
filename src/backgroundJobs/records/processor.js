import QueueService from './queue';
import JobFactory from './factory';

export default class {
  static jobQueue;

  static init() {
    QueueService.init();
    this.jobQueue = QueueService.jobQueue;
  }

  static run() {
    if (!this.jobQueue) {
      this.init();
    }
    this.jobQueue.process(async (job, done) => {
      const type = job.data.meta.type;
      const data = job.data;
      const jobImplementation = JobFactory.findJob(type, data);
      if (!jobImplementation) {
        done(new Error(`Cannot find the job implementation of type - ${type}`));
      } else {
        try {
          await jobImplementation.run();
          done();
        } catch (error) {
          data.meta.failedStep = jobImplementation.failedStep;
          data.data = jobImplementation.serializeData();
          job.update(data);
          done(error);
        }
      }
    });

    this.jobQueue
      .on('failed', (job, error) => {
        console.error(error);
      })
      .on('error', (error) => {
        console.error(error);
      });
  }
}
