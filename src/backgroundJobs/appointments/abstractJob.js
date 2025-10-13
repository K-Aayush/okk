import QueueService from './queue';
import { AbstractJobImplementation } from '../abstractJob';

class AbstractAppointmentJob extends AbstractJobImplementation {
  static enqueueService = QueueService;
}

export default AbstractAppointmentJob;
