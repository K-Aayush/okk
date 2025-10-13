import QueueService from './queue';
import JobFactory from './factory';
import FetchInboxJob from './jobs/fetch';

export default class {
  static jobQueue;

  static init() {
    QueueService.init();
    this.jobQueue = QueueService.jobQueue;
  }

  static async run() {
    if (!this.jobQueue) {
      this.init();
    }

    await this.jobQueue.obliterate({ force: true });

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
          done(error);
        }
      }
    });

    this.jobQueue
      .on('completed', () => {
        // Repeat jobs after 30 sec
        const newJob = new FetchInboxJob();
        newJob.enqueueDelay = 30 * 1000;
        newJob.enqueue();
      })
      .on('failed', (job, error) => {
        console.error(error);
        // Report error
        // Repeat jobs after 30 sec
        const newJob = new FetchInboxJob();
        newJob.enqueueDelay = 30 * 1000;
        newJob.enqueue();
      })
      .on('error', (error) => {
        console.error(error);
        // Report error
        // Repeat jobs after 30 sec
        const newJob = new FetchInboxJob();
        newJob.enqueueDelay = 30 * 1000;
        newJob.enqueue();
      });
    new FetchInboxJob().enqueue();
  }
}
