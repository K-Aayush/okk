import * as Sentry from '@sentry/node';

export class AbstractJobImplementation {
  static isCronJob = false;
  static type;
  static enqueueService;
  failedStep;
  failedCount;
  enqueueDelay = 0;

  constructor(data) {
    if (!!data && !!data.meta && !!data.data) {
      // initialization by job factory
      this.failedStep = data.meta.failedStep || 0;
      this.data = data.data;
    } else {
      // direct initialization by class
      this.failedStep = 0;
      this.data = data || {};
    }
  }

  enqueue() {
    const data = this.serializeData();
    const jobData = {
      meta: {
        type: this.type,
        failedStep: this.failedStep,
      },
      data: data,
    };
    if (data.id) {
      const jobId = this.constructor.generateJobId(data.id);
      jobData.meta.jobId = jobId;
    }
    return this.constructor.enqueueService.enqueueJob(jobData, {
      delay: this.enqueueDelay,
    });
  }

  serializeData() {
    return {};
  }

  deserializeData() {
    return {};
  }

  async run() {
    return new Promise((resolve, reject) => {
      reject(new Error("Can't run a abstract job"));
    });
  }

  get type() {
    return this.constructor.type;
  }

  static generateJobId() {
    return null;
  }

  static async removeJob(id) {
    const jobId = this.generateJobId(id);
    const job = await this.enqueueService.jobQueue.getJob(jobId);
    try {
      if (!!job) {
        await job.remove();
      }
      return true;
    } catch (error) {
      // Report Error
      Sentry.captureException(error, {
        extra: {
          message: `Job remove error of type ${job.data.meta.type}`,
          payload: job.data,
          detail: JSON.stringify(error),
        },
      });
    }
    return false;
  }
}

export class AbstractCronJobImplementation extends AbstractJobImplementation {
  static isCronJob = true;
  cronTimeZone = 'UTC';
  /**
   * Cron Expression e.g. '0 0 0 * * 1' - Every Monday
   * For more information, please refer to https://github.com/harrisiirak/cron-parser
   **/
  cronExpression;

  enqueue() {
    const jobData = {
      meta: {
        type: this.type,
        failedStep: this.failedStep,
      },
      data: this.serializeData(),
    };
    return this.constructor.enqueueService.enqueueJob(jobData, {
      repeat: {
        cron: this.cronExpression,
        tz: this.cronTimeZone,
      },
      jobId: this.type,
    });
  }
}
