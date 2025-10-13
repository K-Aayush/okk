import _ from 'lodash';

import DirectMessageJob from '../abstractJob';
import DataMotionService from '../../../services/datamotion';
import MaxMDService from '../../../services/MaxMd/max-md';
import { Specialty } from '../../../db';

class DirectMessageFetchInboxJob extends DirectMessageJob {
  static type = 'directMessageFetchInboxJob';

  static generateJobId() {
    return `direct-message-fetch-inbox`;
  }

  serializeData() {
    return this.data;
  }

  async run() {
    try {
      // new DataMotionService().fetchUnreadMessages();
      const specialties = await Specialty.find().lean();
      for (const specialty of specialties) {
        if (specialty.title.toLowerCase() === 'pcp') {
          continue;
        }
        const service = new MaxMDService(specialty.dmAddress, specialty.title);
        await service.fetchUnreadMessages();
      }
    } catch (error) {}
  }
}

export default DirectMessageFetchInboxJob;
