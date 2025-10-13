import Auth from './Auth';
import User from './User';
import Specialty from './Specialty';
import Address from '../Address';
import Storage from '../Storage';
import Practice from './Practice';
import Phones from './Phones';

export default `
  scalar Date
  scalar JSON
  scalar JSONObject

  ${Auth}
  ${User}
  ${Specialty}
  ${Address}
  ${Storage}
  ${Practice}
  ${Phones}
`;
