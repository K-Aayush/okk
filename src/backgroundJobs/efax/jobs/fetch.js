import _ from 'lodash';

import EFaxJob from '../abstractJob';
import EFaxService from '../../../services/efax';

class EFaxFetchInboxJob extends EFaxJob {
  static type = 'eFaxFetchInboxJob';

  static generateJobId() {
    return `efax-fetch-inbox`;
  }

  serializeData() {
    return this.data;
  }

  async run() {
    try {
      new EFaxService().fetchUnreadMessages();
    } catch (error) {}
  }
}

export default EFaxFetchInboxJob;
