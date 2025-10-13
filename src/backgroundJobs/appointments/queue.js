import Bull from 'bull';
import AbstractQueueService from '../abstractQueueService';

const backoffDelays = [
  0, // immediate retry on first fail
  10 * 1000, // 10 seconds
  60 * 1000, // 1 min
];

export default class extends AbstractQueueService {
  static jobQueue;
  static backoffDelays;

  static init() {
    this.jobQueue = new Bull('{appointment-jobs}', {
      redis: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        keyPrefix: 'gaz',
      },
      settings: {
        backoffStrategies: {
          customBackoffStrategy: (attemptsMade) => {
            return backoffDelays[
              Math.min(attemptsMade - 1, backoffDelays.length - 1)
            ];
          },
        },
      },
    });
    this.backoffDelays = backoffDelays;
  }
}
