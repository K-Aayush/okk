import admin from "firebase-admin";

import providerServiceAccount from "./provider-mobile-firebase-adminsdk.json";
import patientServiceAccount from "./patient-mobile-firebase-adminsdk.json";

export const providerAdmin = admin.initializeApp(
  {
    credential: admin.credential.cert(providerServiceAccount),
  },
  "providerAdmin"
);
export const patientAdmin = admin.initializeApp(
  {
    credential: admin.credential.cert(patientServiceAccount),
  },
  "patientAdmin"
);

export const getAdmin = (isProvider) =>
  isProvider ? providerAdmin : patientAdmin;
