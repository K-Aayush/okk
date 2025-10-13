import mongoose from 'mongoose';
import { Careplan, CareplanResponse, PatientPractice, User } from './db';
import {
  getNextCareplanTaskScheduleTime,
  getActiveCareplan,
  getDailyResponse,
  updateMeasureResponse,
  updateProgressChanges,
} from './services/careplan';
import { checkAlerts } from './services/careplan-alerts';

class TestController {
  async test(request, res) {
    // const userId = '62fb28d1ff19810f6735f8a1';
    // const date = new Date('2022-08-04T00:00:00.000Z');
    // const userResponse = {
    //   measure: 'vital',
    //   time: new Date('2022-08-04T08:00:00.000Z'),
    //   response: {
    //     weight: 130,
    //   },
    // };
    // const patient = await User.findById(userId);
    // const careplan = await getActiveCareplan(userId);
    // const session = await mongoose.startSession();
    // let response, progressChanges;
    // await session.withTransaction(async () => {
    //   response = await getDailyResponse(patient, date, careplan, session);
    //   const responseContent = response.responses;
    //   progressChanges = await updateMeasureResponse(
    //     responseContent,
    //     userResponse,
    //     careplan
    //   );
    //   // await CareplanResponse.findOneAndUpdate(
    //   //   { _id: response._id },
    //   //   { responses: responseContent },
    //   //   { session }
    //   // );
    // });
    // session.endSession();
    // checkAlerts(careplan._id, userResponse, progressChanges);
    // return res.send({ progressChanges });
  }
}

export default new TestController();
