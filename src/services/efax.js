import dotenv from 'dotenv';
import axios from 'axios';
import { EFaxInboxItem, User } from '../db';
import { Upload } from '@aws-sdk/lib-storage';
import { S3 } from '@aws-sdk/client-s3';
import { fromEnv } from '@aws-sdk/credential-providers';
import socketManager from '../services/socket-manager';
import SOCKET_EVENTS from '../services/socket-manager/constants';
dotenv.config();

class EFaxService {
  constructor() {
    this.apiID = process.env.EFAX_ID;
    this.apiPWD = process.env.EFAX_PASSWORD;
    this.apiCompany = process.env.EFAX_COMPANY;
    this.apiBaseUri = process.env.EFAX_API_URL;
    this.lastFetchMessageId = null;
  }

  async fetchUnreadMessages() {
    if (!this.lastFetchMessageId) {
      const lastInboxMessage = await EFaxInboxItem.findOne({}, null, {
        sort: { messageId: -1 },
      });
      if (!!lastInboxMessage) {
        this.lastFetchMessageId = lastInboxMessage.messageId;
      }
    }
    const data = {
      operation: 'listfax',
    };
    if (this.lastFetchMessageId) {
      data.idgt = this.lastFetchMessageId;
    }
    const apiResult = await this._makeApiRequest('POST', 'httpsfax.php', data);
    if (!apiResult) {
      return;
    }
    const faxList = apiResult.split('\n').reverse();
    let i = 0;
    for (let faxData of faxList) {
      if (!faxData || faxData.length === 0 || !faxData.includes('\t')) {
        continue;
      }
      const faxElements = faxData.split('\t');
      const faxItem = await this.fetchMessageDetail(faxElements[0]);
      const faxInboxItem = await this.createFaxInboxItem(faxElements, faxItem);
      if (!!faxInboxItem) {
        this.lastFetchMessageId = faxElements[0];
      }

      if (++i > 9) {
        break;
      }
    }
    if (i > 0) {
      const providers = await User.find({ role: { $ne: 'patient' } }).lean();
      socketManager.notifyUsers(providers, SOCKET_EVENTS.EFAX_MESSAGES, {});
    }
  }

  async fetchMessageDetail(messageId) {
    const apiResult = await this._makeApiRequest('POST', 'httpsfax.php', {
      faxid: messageId,
      operation: 'getfax',
    });
    return apiResult;
  }

  async createFaxInboxItem(faxData, faxContent) {
    let attachmentInfo;
    const s3 = new S3({
      region: process.env.AWS_REGION,
      credentials: fromEnv(),
    });
    const fileName = `efax-inbox/${faxData[0]}.pdf`;

    try {
      let attachmentBody = Buffer.from(faxContent);
      const response = await new Upload({
        client: s3,
        params: {
          Bucket: process.env.AWS_S3_BUCKET,
          Key: fileName,
          ContentType: 'application/pdf',
          Body: attachmentBody,
          ACL: 'public-read',
        },
      }).done();
      attachmentInfo = {
        fileName: `${faxData[0]}.pdf`,
        contentType: 'application/pdf',
        fileUrl: response.Location,
      };
      const existingMessage = await EFaxInboxItem.findOne({
        messageId: faxData[0],
      });
      if (!!existingMessage) {
        return existingMessage;
      }
      const messageItem = await EFaxInboxItem.create([
        {
          messageId: faxData[0],
          from: faxData[2],
          to: faxData[3],
          attachment: attachmentInfo,
          createTime: new Date(faxData[1]),
        },
      ]);
      return messageItem[0];
    } catch (err) {
      console.error(err, ' aws upload failed');
      return null;
    }
  }

  _makeApiRequest(method, endpoint, data) {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    const formData = {
      username: this.apiID,
      password: this.apiPWD,
      company: this.apiCompany,
      ...data,
    };
    const params = {
      method,
      url: `${this.apiBaseUri}/${endpoint}`,
      data: new URLSearchParams(formData),
      headers,
    };
    if (data.operation === 'getfax') {
      params.responseType = 'arraybuffer';
    }

    return axios(params)
      .then((res) => {
        if (
          !res.data ||
          (data.operation !== 'getfax' && res.data.startsWith('ERR'))
        ) {
          return Promise.reject(res.data);
        }
        return res.data;
      })
      .catch((error) => {
        console.error('EFax api call failed - ', error);
        return null;
      });
  }
}

export default EFaxService;
