import QueueService from './queue';
import { AbstractJobImplementation } from '../abstractJob';

class AbstractDirectMessageJob extends AbstractJobImplementation {
  static enqueueService = QueueService;
}

export default AbstractDirectMessageJob;
