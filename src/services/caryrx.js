import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

class CaryRXService {
  constructor() {
    this.apiKey = process.env.CARYRX_KEY;
    this.apiBaseUri = process.env.CARYRX_API_URL;
    // if (!process.env.HOST_URL.startsWith('http://localhost')) {
    //   this.registerPrescriptionCallback();
    //   this.registerOrderCallback();
    // }
  }

  // async searchPatient(firstName, lastName, email) {
  //   const apiResult = await this._makeApiRequest('post', 'patients/find', {
  //     first_name: firstName,
  //     last_name: lastName,
  //     email,
  //   });
  //   return apiResult.id;
  // }

  // async addPatient(firstName, lastName, dob, email, phoneNo) {
  //   const apiResult = await this._makeApiRequest('post', 'patients', {
  //     first_name: firstName,
  //     last_name: lastName,
  //     dob,
  //     email,
  //     phone_number: phoneNo,
  //   });
  //   return apiResult.id;
  // }

  // async addPatientLocation(patientId, address1, address2, city, state, zip) {
  //   const apiResult = await this._makeApiRequest(
  //     'post',
  //     `patients/${patientId}/location`,
  //     {
  //       address_to_street1: address1,
  //       address_to_street2: address2,
  //       address_to_city: city,
  //       address_to_state: state,
  //       address_to_zip: zip,
  //     }
  //   );
  //   return apiResult.id;
  // }

  // async addPayments(patientId, label, number, exp, cvc) {
  //   const apiResult = await this._makeApiRequest('post', 'paymentmethods', {
  //     patient_id: patientId,
  //     label,
  //     cc_number: number,
  //     exp_date: exp,
  //     security_code: cvc,
  //   });
  //   return apiResult.id;
  // }

  // async createPrescription(
  //   patientId,
  //   medication,
  //   quantity,
  //   refills,
  //   daysSupply,
  //   data
  // ) {
  //   const apiResult = await this._makeApiRequest('post', 'prescriptions', {
  //     patientId,
  //     medication_name: medication,
  //     qty_written: quantity,
  //     refills_written: refills,
  //     days_supply: daysSupply,
  //     data,
  //   });
  //   return apiResult.id;
  // }

  // async createOrder(
  //   patientLocationId,
  //   patientId,
  //   prescriptions,
  //   shippingMethod
  // ) {
  //   return this._makeApiRequest('post', 'orders', {
  //     shipping_method: shippingMethod || 'sameday_delivery',
  //     patient_location_id: patientLocationId,
  //     patient_id: patientId,
  //     prescriptions,
  //   });
  // }

  // async registerPrescriptionCallback() {
  //   return this._makeApiRequest('post', 'prescriptions/events', {
  //     callbackUrl: `https://api.gazuntite.com/caryrx/callback/prescription`,
  //   });
  // }

  // async registerOrderCallback() {
  //   return this._makeApiRequest('post', 'orders/events', {
  //     callbackUrl: `https://api.gazuntite.com/caryrx/callback/order`,
  //   });
  // }

  // _makeApiRequest(method, endpoint, data = null) {
  //   return axios({
  //     method,
  //     url: `${this.apiBaseUri}/${endpoint}`,
  //     data,
  //     headers: {
  //       apikey: this.apiKey,
  //       'Content-Type': 'application/json',
  //     },
  //   })
  //     .then((res) => {
  //       return res.data;
  //     })
  //     .catch((error) => {
  //       console.error('CaryRX api call failed - ', error);
  //       return Promise.reject(error);
  //     });
  // }
}

export default new CaryRXService();
