import dotenv from 'dotenv';
import axios from 'axios';
import { DirectMessageInboxItem, User } from '../db';
import { Upload } from '@aws-sdk/lib-storage';
import { S3 } from '@aws-sdk/client-s3';
import { fromEnv } from '@aws-sdk/credential-providers';
import { extractEmailFromDirectMessageEmailField } from '../utils';
import textract from 'textract';
import socketManager from '../services/socket-manager';
import SOCKET_EVENTS from '../services/socket-manager/constants';
import xml2json from 'xml2js';

dotenv.config();

class DataMotionService {
  constructor() {
    this.apiID = process.env.DATAMOTION_ID;
    this.apiPWD = process.env.DATAMOTION_PASSWORD;
    this.apiBaseUri = process.env.DATAMOTION_API_URL;
    this.sessionKey = null;
    this.lastFetchMessageId = null;
  }

  async getSessionKey() {
    try {
      const apiResult = await this._makeApiRequest(
        'POST',
        'SecureMessagingApi/Account/Logon',
        {
          UserIdOrEmail: this.apiID,
          Password: this.apiPWD,
        }
      );
      this.sessionKey = apiResult.SessionKey;
    } catch (error) {
      return null;
    }
  }

  async fetchUnreadMessages() {
    if (!this.sessionKey) {
      await this.getSessionKey();
    }
    if (!this.sessionKey) {
      console.error('DataMotion direct messaging api login failed!');
      return null;
    }
    if (!this.lastFetchMessageId) {
      const lastInboxMessage = await DirectMessageInboxItem.findOne({}, null, {
        sort: { createTime: -1 },
      });
      if (!!lastInboxMessage) {
        this.lastFetchMessageId = lastInboxMessage.messageId;
      }
    }
    const apiResult = await this._makeApiRequest(
      'GET',
      `SecureMessagingApi/Message/Inbox/Unread${
        !!this.lastFetchMessageId ? `?After=${this.lastFetchMessageId}` : ''
      }`
    );

    // const messageId = '58349134';
    // console.log('fetching message');
    // const messageDetail = await this.fetchMessageDetail(messageId);
    // console.log(messageDetail);
    // const messageInboxItem = await this.createMessageInboxItem(
    //   messageId,
    //   messageDetail
    // );
    // if (!!messageInboxItem) {
    //   this.lastFetchMessageId = messageId;
    // }

    if (apiResult?.Summaries?.length > 0) {
      for (let i = 0; i < Math.min(10, apiResult.Summaries.length); i++) {
        const messageId = apiResult.Summaries[i].MessageId;
        const messageDetail = await this.fetchMessageDetail(messageId);
        const messageInboxItem = await this.createMessageInboxItem(
          messageId,
          messageDetail
        );
        if (!!messageInboxItem) {
          this.lastFetchMessageId = messageId;
        }
      }
      const providers = await User.find({ role: { $ne: 'patient' } }).lean();
      socketManager.notifyUsers(providers, SOCKET_EVENTS.DIRECT_MESSAGES, {});
    }
  }

  async fetchMessageDetail(messageId) {
    if (!this.sessionKey) {
      await this.getSessionKey();
    }
    if (!this.sessionKey) {
      console.error('DataMotion direct messaging api login failed!');
      return null;
    }
    const apiResult = await this._makeApiRequest(
      'GET',
      `SecureMessagingApi/Message/${messageId}`
    );
    return apiResult;
  }

  async createMessageInboxItem(messageId, messageDetail) {
    let attachmentInfo;
    let patientInfo;
    const s3 = new S3({
      region: process.env.AWS_REGION,
      credentials: fromEnv(),
    });
    for (let attachment of messageDetail.Attachments) {
      const fileName = `direct-message-inbox/${messageId}/${attachment.FileName}`;

      try {
        let attachmentBody = Buffer.from(attachment.AttachmentBase64, 'base64');
        if (attachment.ContentType.toLowerCase() === 'text/xml') {
          const attachmentBodyText = attachmentBody.toString();
          const newBodyText = attachmentBodyText.replace(
            '<?xml-stylesheet href="CCDA.xsl" type="text/xsl"?>',
            '<?xml-stylesheet href="/cda-viewer/cda.xsl" type="text/xsl"?>'
          );
          attachmentBody = Buffer.from(newBodyText);
        }

        const response = await new Upload({
          client: s3,
          params: {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: fileName,
            ContentType: attachment.ContentType,
            Body: attachmentBody,
          },
        }).done();
        attachmentInfo = {
          fileName: attachment.FileName,
          contentType: attachment.ContentType,
          fileUrl: response.Location,
        };
        if (attachment.ContentType.toLowerCase() === 'text/xml') {
          patientInfo = await this.processXMLAttachment(
            attachmentBody.toString(),
            'xml'
          );
        } else if (attachment.ContentType.toLowerCase() === 'application/pdf') {
          patientInfo = await this.processPDFAttachment(attachmentBody, 'pdf');
        }
        if (!!attachmentInfo && !!patientInfo) {
          break;
        }
      } catch (err) {
        console.error(err, ' aws upload failed');
        return null;
      }
    }
    if (!patientInfo) {
      return null;
    }
    const patient = User.findOne({ athenaId: patientInfo.id });
    const existingMessage = await DirectMessageInboxItem.findOne({ messageId });
    if (!!existingMessage) {
      return existingMessage;
    }
    const messageItem = await DirectMessageInboxItem.create([
      {
        messageId,
        from: extractEmailFromDirectMessageEmailField(messageDetail.From),
        to: messageDetail.To.map((email) =>
          extractEmailFromDirectMessageEmailField(email)
        ),
        body: messageDetail.TextBody,
        attachment: attachmentInfo,
        patientInfo,
        patient: patient?._id,
        subject: messageDetail.Subject,
        createTime: messageDetail.CreateTime,
      },
    ]);
    return messageItem[0];
  }

  async processPDFAttachment(content) {
    try {
      const mimeType = 'application/pdf';
      const text = await new Promise((resolve, reject) => {
        textract.fromBufferWithMime(
          mimeType,
          content,
          { preserveLineBreaks: true },
          (err, text) => {
            if (err) {
              return reject(err);
            }
            return resolve(text);
          }
        );
      });
      const textLines = text.split('\n');
      const patientInfoLine = textLines[1];
      const idStartIndex = patientInfoLine.indexOf('(ID');
      const dobStartIndex = patientInfoLine.indexOf('DOB: ');
      const patientName = patientInfoLine.substr(0, idStartIndex - 1);
      const patientID = patientInfoLine.substr(
        idStartIndex + 5,
        dobStartIndex - idStartIndex - 7
      );
      const patientDOB = patientInfoLine.substr(
        dobStartIndex + 5,
        patientInfoLine.length - dobStartIndex - 6
      );
      if (
        !patientID ||
        patientID.length === 0 ||
        !patientName ||
        patientName.length === 0
      ) {
        return null;
      }
      return {
        id: patientID,
        name: patientName,
        dob: patientDOB,
      };
    } catch (error) {
      return null;
    }
  }

  async processXMLAttachment(content) {
    const json2 = await xml2json.parseStringPromise(content.toString());
    const patientRecord = json2.ClinicalDocument.recordTarget[0].patientRole[0];
    const id = this._extractId(patientRecord.id[0]['$'].extension);
    const infoElement = patientRecord.patient[0];
    const name = infoElement.name[0].given
      .concat(infoElement.name[0].family)
      .join(' ');
    const dob = this._parseBirth(infoElement.birthTime[0]['$'].value);
    return {
      id,
      name,
      dob,
    };
  }

  async sendMessage(to, info, buffer) {
    if (!this.sessionKey) {
      await this.getSessionKey();
    }
    if (!this.sessionKey) {
      console.error('DataMotion direct messaging api login failed!');
      return Promise.reject('Datamotion log in failed');
    }
    await this._makeApiRequest('post', 'SecureMessagingApi/Message', {
      To: [to],
      From: 'econsult@direct.gazuntite.com',
      Attachments: [
        {
          AttachmentBase64: buffer,
          ContentType: 'application/pdf',
          FileName: info.attachment,
        },
      ],
      Subject: info.subject,
    });
  }

  _extractId(idString) {
    return idString.substr(idString.indexOf('E-') + 2);
  }

  _parseBirth(birthString) {
    const year = birthString.substr(0, 4);
    const month = birthString.substr(4, 2);
    const day = birthString.substr(6, 2);
    return `${month}/${day}/${year}`;
  }

  _makeApiRequest(method, endpoint, data = null) {
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (!!this.sessionKey) {
      headers['X-Session-Key'] = this.sessionKey;
    }
    return axios({
      method,
      url: `${this.apiBaseUri}/${endpoint}`,
      data,
      headers,
    })
      .then((res) => {
        return res.data;
      })
      .catch((error) => {
        console.error('DataMotion api call failed - ', error);
        return null;
      });
  }
}

export default DataMotionService;
