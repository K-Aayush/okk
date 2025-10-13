import RecordJob from '../abstractJob';
import { createRecord } from '../../../services/record';

class CreateRecordJob extends RecordJob {
  static type = 'createREcordJob';

  static generateJobId(id) {
    return `create-record-${id}`;
  }

  serializeData() {
    return this.data;
  }

  async deserializeData() {
    return this.data;
  }

  async run() {
    const { record } = await this.deserializeData();
    if (!record) {
      return;
    }
    await createRecord(record);
  }
}

export default CreateRecordJob;
