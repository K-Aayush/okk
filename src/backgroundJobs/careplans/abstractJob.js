import QueueService from './queue';
import { AbstractJobImplementation } from '../abstractJob';

class AbstractCareplanJob extends AbstractJobImplementation {
  static enqueueService = QueueService;
}

export default AbstractCareplanJob;
