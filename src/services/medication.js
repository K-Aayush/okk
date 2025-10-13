import { User } from '../db';
import socketManager from '../services/socket-manager';
import SOCKET_EVENTS from '../services/socket-manager/constants';

export const notifyPharmacists = async () => {
  const pharmacists = await User.find({
    memberDesignation: 'pharmacist',
  }).lean();
  pharmacists.forEach((pharmacist) => {
    socketManager.sendMessage(pharmacist, SOCKET_EVENTS.MEDICATION_ORDERS);
  });
};
