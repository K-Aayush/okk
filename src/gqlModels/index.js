import Address from './Address';
import Alerts from './Alerts';
import Appointment from './Appointment';
import Auth from './Auth';
import Call from './Call';
import Careplan from './Careplan';
import Chat from './Chat';
import Contact from './Contact';
import Insurance from './Insurance';
import Phones from './Phones';
import Practice from './Practice';
import User from './User';
import Storage from './Storage';
import Note from './Note';
import Diagnosis from './Diagnosis';
import Medication from './Medication';
import Record from './Record';
import Report from './Report';
import Group from './Group';
import Invite from './Invite';
import PendingUser from './PendingUser';
import Pharmacy from './Pharmacy';
import Response from './Response';
import Schedule from './Schedule';
import Status from './Status';
import Payment from './Payment';
import DirectMessage from './DirectMessage';
import EFax from './EFax';
import MedicalLicense from './MedicalLicense';
import File from './File';

export default `
  scalar Date
  scalar JSON
  scalar JSONObject

  ${Address}
  ${Alerts}
  ${Appointment}
  ${Auth}
  ${Call}
  ${Careplan}
  ${Chat}
  ${Contact}
  ${Insurance}
  ${Phones}
  ${Practice}
  ${User}
  ${Storage}
  ${Note}
  ${Diagnosis}
  ${Medication}
  ${Record}
  ${Report}
  ${Group}
  ${Invite}
  ${Payment}
  ${PendingUser}
  ${Pharmacy}
  ${Response}
  ${Schedule}
  ${Status}
  ${DirectMessage}
  ${EFax}
  ${MedicalLicense}
  ${File}
`;
