import _ from 'lodash';

import { readChat, sendChat } from '../../services/chat';
import SOCKET_EVENTS from './constants';
import { createRecord } from '../record';

export const handleMessage = async (sm, user, message) => {
  const { type, data } = JSON.parse(message);

  switch (type) {
    case SOCKET_EVENTS.READ_CHAT:
      readChat(user, data?.chatId);
      break;
    case SOCKET_EVENTS.CHAT:
      sendChat(user, data);
      break;
    case SOCKET_EVENTS.REPORT_RECORD:
      createRecord(data?.record, true);
      break;
    default:
  }
};
