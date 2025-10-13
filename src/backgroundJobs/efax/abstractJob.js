import QueueService from './queue';
import { AbstractJobImplementation } from '../abstractJob';

class AbstractEFaxJob extends AbstractJobImplementation {
  static enqueueService = QueueService;
}

export default AbstractEFaxJob;
