import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const sampleMeds = [
  {
    name: 'Carvedilol 10mg',
    strength: '10mg',
    dosageForm: 'Tablet',
    ndc: 'testndc-carvedilol-10',
    route: 'Oral',
  },
  {
    name: 'Carvedilol 20mg',
    strength: '20mg',
    dosageForm: 'Tablet',
    ndc: 'testndc-carvedilol-20',
    route: 'Oral',
  },
  {
    name: 'Carvedilol 40mg',
    strength: '40mg',
    dosageForm: 'Tablet',
    ndc: 'testndc-carvedilol-40',
    route: 'Oral',
  },
  {
    name: 'Carvedilol 80mg',
    strength: '80mg',
    dosageForm: 'Tablet',
    ndc: 'testndc-carvedilol-80',
    route: 'Oral',
  },
  {
    name: 'Lasix 20mg',
    strength: '20mg',
    dosageForm: 'Tablet',
    ndc: 'testndc-Lasix-20',
    route: 'Oral',
  },
  {
    name: 'Lasix 40mg',
    strength: '40mg',
    dosageForm: 'Tablet',
    ndc: 'testndc-Lasix-40',
    route: 'Oral',
  },
  {
    name: 'Lasix 80mg',
    strength: '80mg',
    dosageForm: 'Tablet',
    ndc: 'testndc-Lasix-80',
    route: 'Oral',
  },
  {
    name: 'Metformin 500mg',
    strength: '500mg',
    dosageForm: 'Tablet',
    ndc: 'testndc-Metformin-500',
    route: 'Oral',
  },
  {
    name: 'Metformin 750mg',
    strength: '750mg',
    dosageForm: 'Tablet',
    ndc: 'testndc-Metformin-750',
    route: 'Oral',
  },
  {
    name: 'Metformin 850mg',
    strength: '850mg',
    dosageForm: 'Tablet',
    ndc: 'testndc-Metformin-850',
    route: 'Oral',
  },
  {
    name: 'Metformin 1000mg',
    strength: '1000mg',
    dosageForm: 'Tablet',
    ndc: 'testndc-Metformin-1000',
    route: 'Oral',
  },
  {
    name: 'Spironolactone 25mg',
    strength: '25mg',
    dosageForm: 'Tablet',
    ndc: 'testndc-Spironolactone-25',
    route: 'Oral',
  },
  {
    name: 'Spironolactone 50mg',
    strength: '50mg',
    dosageForm: 'Tablet',
    ndc: 'testndc-Spironolactone-50',
    route: 'Oral',
  },
  {
    name: 'Spironolactone 100mg',
    strength: '100mg',
    dosageForm: 'Tablet',
    ndc: 'testndc-Spironolactone-100',
    route: 'Oral',
  },
];

class DBankService {
  constructor() {
    this.apiKey = process.env.DBANK_KEY;
    this.apiBaseUri = process.env.DBANK_API_URL;
  }

  async searchMedication(query) {
    return sampleMeds.filter((med) =>
      med.name.toLowerCase().includes(query.toLowerCase())
    );
    // const apiResult = await this._makeApiRequest(
    //   'get',
    //   `drug_names/simple?q=${query}`
    // );
    // return apiResult.products.map((product) => {
    //   return {
    //     name: product.name,
    //     strength: {
    //       unit: product['strength_unit'],
    //       value: product['strength_number'],
    //     },
    //     dosageForm: product['dosage_form'][0],
    //     ndc: product['ndc_product_codes'][0],
    //     route: product.route,
    //   };
    // });
  }

  _makeApiRequest(method, endpoint, data = null) {
    return axios({
      method,
      url: `${this.apiBaseUri}/${endpoint}`,
      data,
      headers: {
        Authorization: this.apiKey,
        'Content-Type': 'application/json',
      },
    })
      .then((res) => {
        return res.data;
      })
      .catch((error) => {
        console.error('DrugBank api call failed - ', error);
        return Promise.reject(error);
      });
  }
}

export default DBankService;
