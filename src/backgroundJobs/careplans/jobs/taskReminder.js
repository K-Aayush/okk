import _ from 'lodash';

import CareplanJob from '../abstractJob';
import { Careplan } from '../../../db';
import { sendCPTaskReminderNowSMS } from '../../../services/twilio';
import { sendCPTaskReminderNowEmail } from '../../../services/mailer';
import { getNextCareplanTaskScheduleTime } from '../../../services/careplan';
import {
  buildPracticeUrlForUser,
  formatTitleAndName,
} from '../../../utils/string';

class CareplanTaskReminderJob extends CareplanJob {
  static type = 'careplanTaskReminderJob';

  static generateJobId(id) {
    return `careplan-task-reminder-${id}`;
  }

  serializeData() {
    return this.data;
  }

  async deserializeData() {
    // fetching appointment model from database
    const careplanId = this.data.careplan;
    const careplan = await Careplan.findById(careplanId).populate([
      'user',
      {
        path: 'creator',
        populate: ['practice', 'user'],
      },
    ]);
    const { tasks, time } = this.data;
    return {
      careplan,
      tasks,
      time,
    };
  }

  async run() {
    const { careplan, tasks, time } = await this.deserializeData();
    if (!careplan?.isActive) {
      return;
    }

    const { user: patient, creator } = careplan;

    // Send Email and SMS
    const portalUrl = await buildPracticeUrlForUser('', patient);
    const practiceName = await creator.practice.name;
    const phoneNumber = patient.phones?.mobile;

    let sendReminder = true;

    if (time) {
      const nowTimestamp = new Date().getTime();
      const taskTimestamp = new Date(time).getTime();
      if (nowTimestamp - taskTimestamp >= 5 * 60 * 1000) {
        sendReminder = false;
      }
    }

    if (sendReminder) {
      let detail = '';
      if (tasks) {
        const taskTypes = [];
        tasks.forEach((task) => {
          if (!taskTypes.includes(_.capitalize(task.type))) {
            taskTypes.push(_.capitalize(task.type));
          }
        });
        detail = taskTypes.join(', ');
      }
      //disable for patient
      // sendCPTaskReminderNowEmail(patient.email, practiceName, {
      //   patientName: formatTitleAndName(patient),
      //   detail,
      //   portalUrl,
      // });

      // if (!!phoneNumber) {
      //   sendCPTaskReminderNowSMS(phoneNumber, {
      //     header: `Your Care Plan task is due now.`,
      //     detail,
      //     portalUrl,
      //   });
      // }
    }

    const { time: nextTaskTime, tasks: nextTasks } =
      getNextCareplanTaskScheduleTime(patient, careplan);

    if (!!nextTaskTime) {
      const taskReminderJob = new CareplanTaskReminderJob({
        id: patient._id,
        careplan: careplan._id,
        time: nextTaskTime,
        tasks: nextTasks,
      });
      taskReminderJob.enqueueDelay =
        nextTaskTime.toDate().getTime() - new Date().getTime();
      taskReminderJob.enqueue();
    }
  }
}

export default CareplanTaskReminderJob;
