import authQueries from './Auth';
import appointmentQueries from './Appointment';
import callQueries from './Call';
import careplanQueries from './Careplan';
import responseQueries from './Response';
import chatQueries from './Chat';
import contactQueries from './Contact';
import userQueries from './User';
import patientQueries from './Patient';
import storageQueries from './Storage';
import noteQueries from './Note';
import diagnosisQueries from './Diagnosis';
import medicationQueries from './Medication';
import recordQueries from './Record';
import reportQueries from './Report';
import inviteQueries from './Invite';
import groupQueries from './GroupAndPractice';
import pharmacyQueries from './Pharmacy';
import scheduleQueries from './Schedule';
import alertsQueries from './Alerts';
import directMessageQueries from './DirectMessage';
import eFaxQueries from './EFax';
import medicalLicenseQueries from './MedicalLicense';
import practiceQueries from './Practice';
import providerQueries from './Provider';
import { GraphQLUserError } from '../errors';

const allQueries = [
  ...authQueries,
  ...appointmentQueries,
  ...callQueries,
  ...careplanQueries,
  ...responseQueries,
  ...chatQueries,
  ...contactQueries,
  ...userQueries,
  ...patientQueries,
  ...storageQueries,
  ...noteQueries,
  ...diagnosisQueries,
  ...medicationQueries,
  ...recordQueries,
  ...reportQueries,
  ...inviteQueries,
  ...groupQueries,
  ...pharmacyQueries,
  ...scheduleQueries,
  ...alertsQueries,
  ...directMessageQueries,
  ...eFaxQueries,
  ...medicalLicenseQueries,
  ...practiceQueries,
  ...providerQueries,
];

const authenticate = (func, isPublic) => (args, context) => {
  if (!isPublic && !context.user) {
    throw new GraphQLUserError('Invalid Auth!');
  }
  return func(args, context);
};

export const queries = allQueries
  .filter(({ mutation }) => !mutation)
  .map(({ key, prototype }) => `${key}${prototype}`)
  .join(',\n  ');

export const mutations = allQueries
  .filter(({ mutation }) => mutation)
  .map(({ key, prototype }) => `${key}${prototype}`)
  .join(',\n  ');

export const root = allQueries.reduce(
  (cur, { key, isPublic, run }) => ({
    ...cur,
    [key]: authenticate(run, isPublic),
  }),
  {}
);
