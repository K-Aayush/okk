import Bull from 'bull';
import AbstractQueueService from '../abstractQueueService';

export default class extends AbstractQueueService {
  static jobQueue;

  static init() {
    this.jobQueue = new Bull('{direct-message-jobs}', {
      redis: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        keyPrefix: 'gaz',
      },
    });
  }
}
