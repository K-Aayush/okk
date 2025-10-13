import QueueService from './queue';
import { AbstractJobImplementation } from '../abstractJob';

class AbstractRecordJob extends AbstractJobImplementation {
  static enqueueService = QueueService;
}

export default AbstractRecordJob;
