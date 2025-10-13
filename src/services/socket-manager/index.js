import WebSocket from 'ws';
import { parse } from 'url';

import { getUser } from '../../utils';
import { handleMessage } from './handler';
import SOCKET_EVENTS from './constants';
import { User } from '../../db';

class SocketManager {
  serverInstance = null;
  clientSocketInstances = [];

  constructor() {
    this.serverInstance = new WebSocket.Server({
      noServer: true,
      verifyClient: async (info, done) => {
        try {
          const queryParams = parse(info.req.url, true);
          if (queryParams.query) {
            const token = queryParams.query.token;
            if (token) {
              info.req.user = await getUser(token);
              return done(true);
            }
          }
        } catch (e) {}
        done(false, 401, 'Unauthorized');
      },
    });
    this.serverInstance.on('connection', (ws, user) => {
      this.initSocketInstance(ws, user);
      ws.send(
        JSON.stringify({
          type: SOCKET_EVENTS.AUTH,
          message: 'Authentication passed',
        })
      );
    });
  }

  initSocketInstance(socket, user) {
    const userId = user._id;

    socket.on('message', (message) => {
      this.handleIncomingMessage(user, message);
    });

    socket.on('close', () => {
      this.removeSocketInstance(socket, userId);
    });

    socket.on('error', console.error);

    if (!this.clientSocketInstances[userId]) {
      this.clientSocketInstances[userId] = [];
    }
    this.clientSocketInstances[userId].push(socket);
  }

  handleIncomingMessage(user, message) {
    handleMessage(this, user, message);
  }

  removeSocketInstance(socket, userId) {
    if (!this.clientSocketInstances[userId]) {
      return;
    }
    for (let i = 0; i < this.clientSocketInstances[userId]; i++) {
      if (socket === this.clientSocketInstances[userId][i]) {
        this.clientSocketInstances[userId].splice(i, 1);
        break;
      }
    }
  }

  sendMessage(user, type, payload) {
    const userId = typeof user === 'object' ? user._id : user;
    const clientSockets = this.clientSocketInstances[userId];
    if (!clientSockets || clientSockets.length === 0) {
      return;
    }
    const socketPayload = JSON.stringify({
      type,
      data: payload,
    });
    for (const socket of clientSockets) {
      socket.send(socketPayload);
    }
  }

  async notifyPractice(practice, type, payload) {
    const practiceId = typeof practice === 'object' ? practice._id : practice;
    const users = await User.find({ activeProviderPractice: practiceId });
    this.notifyUsers(users, type, payload);
  }

  notifyUsers(users, type, payload) {
    users.forEach((user) => this.sendMessage(user, type, payload));
  }
}

export default new SocketManager();
