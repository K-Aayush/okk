import deviceController from './controllers/devices';
import twilioController from './controllers/twilio';
//import caryrxController from './controllers/caryrx';

export default (app) => {
  app.post('/devices/scale', deviceController.scale.bind(deviceController));
  app.post('/devices/bpm', deviceController.bpm.bind(deviceController));

  app.get('/callback/verify-number', twilioController.verifyCallback);

  // app.post(
  //   '/caryrx/callback/prescription',
  //   caryrxController.prescriptionCallback
  // );
  // app.post('/caryrx/callback/order', caryrxController.orderCallback);
};
