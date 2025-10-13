import AppointmentJobsProcessor from './appointments/processor';
import CareplansJobsProcessor from './careplans/processor';
import DirectMessageJobsProcessor from './direct-message/processor';
import RecordJobsProcessor from './records/processor';
import EFaxJobsProcessor from './efax/processor';

import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';

export default class {
  run(app) {
    console.log('Background processing started');
    AppointmentJobsProcessor.run();
    CareplansJobsProcessor.run();
    DirectMessageJobsProcessor.run();
    // EFaxJobsProcessor.run();
    RecordJobsProcessor.run();
    AppointmentJobsProcessor.init();
    CareplansJobsProcessor.init();
    DirectMessageJobsProcessor.init();
    // EFaxJobsProcessor.init();
    RecordJobsProcessor.init();

    const queues = [
      AppointmentJobsProcessor.jobQueue,
      CareplansJobsProcessor.jobQueue,
      DirectMessageJobsProcessor.jobQueue,
      // EFaxJobsProcessor.jobQueue,
      RecordJobsProcessor.jobQueue,
    ];
    const serverAdapter = new ExpressAdapter();

    createBullBoard({
      queues: queues.map((queue) => new BullAdapter(queue)),
      serverAdapter: serverAdapter,
    });

    serverAdapter.setBasePath('/background/queues');
    app.use('/background/queues', serverAdapter.getRouter());
  }
}
