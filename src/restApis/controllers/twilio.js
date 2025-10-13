import mongoose from 'mongoose';
import { User } from '../../db';
import socketManager from '../../services/socket-manager';
import SOCKET_EVENTS from '../../services/socket-manager/constants';
import { formatPhoneNumber } from '../../utils/string';

class TwilioController {
  async verifyCallback(request, response) {
    try {
      const payload = request.query;
      const status = payload?.VerificationStatus;
      const number = payload?.Called;
      if (!number) {
        return response.status(400).send({ message: 'Number not found' });
      }

      const formattedNumber = formatPhoneNumber(number.substr(2));

      const providers = await User.find({
        role: 'provider',
        $or: [
          {
            'phones.mobile': formattedNumber,
          },
          { 'phones.work': formattedNumber },
          { 'phones.home': formattedNumber },
        ],
      }).lean();

      providers.forEach((provider) => {
        socketManager.sendMessage(provider, SOCKET_EVENTS.PHONE_VERIFICATION, {
          number: number.substr(2),
          status,
        });
      });
      response.send({ message: status });
    } catch (error) {
      response.status(400).send({ error });
    }
  }

  async _getProvidersWithNumber(number) {
    re;
  }
}

export default new TwilioController();
