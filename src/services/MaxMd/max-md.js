import dotenv from 'dotenv';
import axios from 'axios';
import * as Sentry from '@sentry/node';
import {
  DirectMessageInboxItem,
  PatientPractice,
  Practice,
  ProviderPractice,
  User,
} from '../../db';
import { Upload } from '@aws-sdk/lib-storage';
import { S3 } from '@aws-sdk/client-s3';
import { fromEnv } from '@aws-sdk/credential-providers';
import textract from 'textract';
import socketManager from '../../services/socket-manager';
import SOCKET_EVENTS from '../../services/socket-manager/constants';
import xml2json from 'xml2js';
import { XMLParser } from 'fast-xml-parser';
import {
  sendNotificationEmailAndSMSForNewDM,
  sendNotificationEmailAndSMSForNewDMtoPCP,
} from '../../utils/direct-message';

dotenv.config();

class MaxMDService {
  constructor(username, specialty) {
    this.username = username || process.env.MAXMD_USERNAME;
    this.password = process.env.MAXMD_PASSWORD;
    this.specialty = specialty;
    this.apiBaseUri = process.env.MAXMD_API_URL;
  }

  async fetchUnreadMessages() {
    const lastMessage = await DirectMessageInboxItem.find({
      specialty: this.specialty,
    })
      .sort({ createTime: -1 })
      .limit(1);
    let lastMessageTime;
    if (lastMessage.length > 0) {
      lastMessageTime = lastMessage[0].createTime;
    }
    const nowTimestamp = new Date().getTime();

    try {
      // Adjust folder as needed
      const folder = 'Inbox';
      /* fetch message in time span from last message's receive time to now or fetch all messages for the first time */
      const url = lastMessageTime
        ? `${this.apiBaseUri}/GetMessagesByReceivedDate/${folder}/${
            lastMessageTime.getTime() + 1
          }/${nowTimestamp}`
        : `${this.apiBaseUri}/GetMessages/${folder}`;

      const auth = { username: this.username, password: this.password };
      const options = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        data: JSON.stringify(auth),
        url,
      };
      const response = await axios(options);
      const messages = response?.data?.messages;
      if (messages?.length > 0) {
        // Why do we do 10 max on the datamotion version??
        for (let i = 0; i < messages.length; i++) {
          const messageId = messages[i].msgID;
          const newMessage = await this.createMessageInboxItem(
            messageId,
            messages[i]
          );
          if (newMessage?.patientInfo) {
            await sendNotificationEmailAndSMSForNewDM(newMessage);
            await sendNotificationEmailAndSMSForNewDMtoPCP(newMessage);
          }
        }
        const providers = await User.find({ role: { $ne: 'patient' } }).lean();
        socketManager.notifyUsers(providers, SOCKET_EVENTS.DIRECT_MESSAGES, {});
      }
    } catch (error) {
      Sentry.captureException(error, {
        extra: {
          message: 'Error in MaxMD fetch message',
          detail: JSON.stringify(error),
        },
      });
      return null;
    }
  }

  async createMessageInboxItem(messageId, messageDetail) {
    const existingMessage = await DirectMessageInboxItem.findOne({ messageId });
    if (!!existingMessage) {
      return existingMessage;
    }
    let attachmentInfo;
    let patientInfo;
    let ccdaData = null;
    const additionalFiles = [];

    const s3 = new S3({
      region: process.env.AWS_REGION,
      credentials: fromEnv(),
    });
    for (let attachment of messageDetail.attachmentList) {
      const fileName = `direct-message-inbox/${messageId}/${attachment.filename}`;

      try {
        let attachmentBody = Buffer.from(attachment.content, 'base64');
        if (attachment.contentType.toLowerCase().includes('text/xml')) {
          //MaxMD attachment.contentType format is 'text/xml; name=**filename.xml**'
          const attachmentBodyText = attachmentBody.toString();
          let newBodyText;
          const startingXSSIndex =
            attachmentBodyText.indexOf('<?xml-stylesheet');
          if (startingXSSIndex > 0) {
            const nextString = attachmentBodyText.slice(startingXSSIndex);
            const endingXSSIndex = nextString.indexOf('?>') + 2;
            newBodyText =
              attachmentBodyText.slice(0, startingXSSIndex) +
              '<?xml-stylesheet href="/cda-viewer/cda.xsl" type="text/xsl"?>' +
              nextString.slice(endingXSSIndex);
          } else {
            const endingHeadCloseTagIndex =
              attachmentBodyText.indexOf('?>') + 2;
            newBodyText =
              attachmentBodyText.slice(0, endingHeadCloseTagIndex) +
              '<?xml-stylesheet href="/cda-viewer/cda.xsl" type="text/xsl"?>' +
              attachmentBodyText.slice(endingHeadCloseTagIndex);
          }
          attachmentBody = Buffer.from(newBodyText);
        }

        const response = await new Upload({
          client: s3,
          params: {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: fileName,
            ContentType: attachment.contentType,
            Body: attachmentBody,
          },
        }).done();
        // Store file info based on type
        if (attachment.contentType.toLowerCase().includes('text/xml')) {
          attachmentInfo = {
            fileName: attachment.filename,
            contentType: attachment.contentType,
            fileUrl: response.Location,
          };

          // Parse CCDA data
          const xmlString = attachmentBody.toString();
          patientInfo = await this.processXMLAttachment(xmlString, 'xml');
          ccdaData = await this.parseCCDAData(xmlString, this.specialty);
        } else if (
          attachment.contentType.toLowerCase().includes('application/pdf')
        ) {
          // Store additional PDF files
          additionalFiles.push({
            fileName: attachment.filename,
            fileUrl: response.Location,
            contentType: attachment.contentType,
          });
        }
      } catch (err) {
        Sentry.captureException(err, {
          extra: {
            message: 'Error in aws upload',
            payload: attachment,
            detail: JSON.stringify(err),
          },
        });
        return null;
      }
    }

    // check Patient info
    if (!patientInfo) {
      return null;
    }

    // check dm provider info
    const dmProvider = await ProviderPractice.findOne({
      directMessageAddress: messageDetail.sender,
    });
    let dmPractice, dmSender;
    if (dmProvider) {
      dmPractice = dmProvider.practice;
      dmSender = dmProvider.user;
    } else {
      const dmPractices = await Practice.find({
        directMessageDomain: { $ne: null },
      });

      for (const practice of dmPractices) {
        if (messageDetail.sender.endsWith(practice.directMessageDomain)) {
          dmPractice = practice._id;
          break;
        }
      }
      if (!dmPractice) {
        return null;
      }
    }

    let patient = await User.findOne({ athenaId: patientInfo.id });
    if (!patient) {
      const newPatientDocs = await User.create([
        {
          firstName: patientInfo.names.firstName,
          lastName: patientInfo.names.lastName,
          middleName: patientInfo.names.middleName,
          role: 'patient',
          address: patientInfo.address,
          phones: patientInfo.phones,
          timezoneOffset: -300,
          timezone: 'America/New_York',
          athenaId: patientInfo.id,
          dob: patientInfo.dob,
          gender: patientInfo.gender,
        },
      ]);
      patient = newPatientDocs[0];
      await PatientPractice.create([
        {
          user: patient._id,
          practice: dmPractice,
        },
      ]);
    }

    const messageItem = await DirectMessageInboxItem.create([
      {
        messageId,
        from: messageDetail.sender,
        to: messageDetail.recipients.map((recipient) => recipient.email),
        body: patientInfo.referralContent || messageDetail.body,
        attachment: attachmentInfo,
        patientInfo,
        patient: patient?._id,
        practice: dmPractice,
        sender: dmSender,
        subject: messageDetail.subject,
        specialty: this.specialty,
        createTime: messageDetail.receivedDate,
        ccda: ccdaData,
      },
    ]);
    return messageItem[0];
  }

  //Parse CCDA data and extract snapshot
  async parseCCDAData(xmlString, specialty) {
    try {
      // Parse XML to JSON using fast-xml-parser
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
      });
      const parsedData = parser.parse(xmlString);

      // Detect CCDA version
      const version = this._detectCCDAVersion(parsedData);

      // Extract snapshot data based on specialty
      const snapshot = this._extractCCDASnapshot(parsedData, specialty);

      return {
        rawXml: xmlString,
        parsedData: parsedData,
        version: version,
        snapshot: snapshot,
        parseStatus: 'success',
        parsedAt: new Date(),
      };
    } catch (error) {
      Sentry.captureException(error, {
        extra: {
          message: 'Error parsing CCDA data',
          detail: JSON.stringify(error),
        },
      });

      return {
        rawXml: xmlString,
        parsedData: null,
        version: null,
        snapshot: null,
        parseStatus: 'failed',
        parseError: error.message,
        parsedAt: new Date(),
      };
    }
  }

  // Detect CCDA version
  _detectCCDAVersion(parsedData) {
    try {
      const templateId = parsedData?.ClinicalDocument?.templateId;
      if (Array.isArray(templateId)) {
        for (const template of templateId) {
          if (template['@_root'] === '2.16.840.1.113883.10.20.22.1.1') {
            // C-CDA version 2.x
            return '2.0';
          } else if (template['@_root'] === '2.16.840.1.113883.10.20.22.1.2') {
            // C-CDA version 3.x
            return '3.0';
          }
        }
      }
      return 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  // Extract snapshot for UI display
  _extractCCDASnapshot(parsedData, specialty) {
    try {
      const components =
        parsedData?.ClinicalDocument?.component?.structuredBody?.component ||
        [];

      const snapshot = {
        reasonForReferral: null,
        problems: [],
        procedures: [],
        medications: [],
        allergies: [],
        customSections: [],
      };

      // Extract key sections
      for (const comp of components) {
        const section = comp.section;
        const sectionCode = section?.code?.['@_code'];
        const sectionTitle = section?.title;

        // Reason for Referral
        if (
          sectionCode === '42349-1' ||
          sectionTitle === 'REASON FOR REFERRAL'
        ) {
          snapshot.reasonForReferral = this._extractReasonForReferral(section);
        }

        // Problems
        if (sectionCode === '11450-4' || sectionTitle === 'PROBLEM LIST') {
          snapshot.problems = this._extractProblems(section);
        }

        // Procedures
        if (sectionCode === '47519-4' || sectionTitle === 'PROCEDURES') {
          snapshot.procedures = this._extractProcedures(section);
        }

        // Medications
        if (sectionCode === '10160-0' || sectionTitle === 'MEDICATIONS') {
          snapshot.medications = this._extractMedications(section);
        }

        // Allergies
        if (sectionCode === '48765-2' || sectionTitle === 'ALLERGIES') {
          snapshot.allergies = this._extractAllergies(section);
        }
      }

      // Limit to top 5 items per section for snapshot
      snapshot.problems = snapshot.problems.slice(0, 5);
      snapshot.procedures = snapshot.procedures.slice(0, 5);
      snapshot.medications = snapshot.medications.slice(0, 5);
      snapshot.allergies = snapshot.allergies.slice(0, 5);

      return snapshot;
    } catch (error) {
      Sentry.captureException(error, {
        extra: {
          message: 'Error extracting CCDA snapshot',
          detail: JSON.stringify(error),
        },
      });
      return null;
    }
  }

  // Helper methods for extracting specific sections
  _extractReasonForReferral(section) {
    try {
      const entry = section?.entry?.[0];
      const observation = entry?.observation;
      const value = observation?.value;

      return {
        code: value?.['@_code'] || null,
        display: value?.['@_displayName'] || section?.text || null,
        system: value?.['@_codeSystem'] || null,
      };
    } catch (error) {
      return null;
    }
  }

  _extractProblems(section) {
    try {
      const entries = section?.entry || [];
      const problems = [];

      for (const entry of entries) {
        const observation = entry?.act?.entryRelationship?.observation;
        const value = observation?.value;

        if (value) {
          problems.push({
            code: value?.['@_code'] || null,
            display: value?.['@_displayName'] || null,
            system: value?.['@_codeSystem'] || null,
            onsetDate: observation?.effectiveTime?.low?.['@_value'] || null,
          });
        }
      }

      return problems;
    } catch (error) {
      return [];
    }
  }

  _extractProcedures(section) {
    try {
      const entries = section?.entry || [];
      const procedures = [];

      for (const entry of entries) {
        const procedure = entry?.procedure;
        const code = procedure?.code;

        if (code) {
          procedures.push({
            code: code?.['@_code'] || null,
            display: code?.['@_displayName'] || null,
            system: code?.['@_codeSystem'] || null,
            date: procedure?.effectiveTime?.['@_value'] || null,
          });
        }
      }

      return procedures;
    } catch (error) {
      return [];
    }
  }

  _extractMedications(section) {
    try {
      const entries = section?.entry || [];
      const medications = [];

      for (const entry of entries) {
        const substanceAdministration = entry?.substanceAdministration;
        const manufacturedProduct =
          substanceAdministration?.consumable?.manufacturedProduct;
        const code = manufacturedProduct?.manufacturedMaterial?.code;

        if (code) {
          medications.push({
            code: code?.['@_code'] || null,
            display: code?.['@_displayName'] || null,
            dosage: substanceAdministration?.doseQuantity?.['@_value'] || null,
            startDate:
              substanceAdministration?.effectiveTime?.low?.['@_value'] || null,
          });
        }
      }

      return medications;
    } catch (error) {
      return [];
    }
  }

  _extractAllergies(section) {
    try {
      const entries = section?.entry || [];
      const allergies = [];

      for (const entry of entries) {
        const observation = entry?.act?.entryRelationship?.observation;
        const participant = observation?.participant;
        const code = participant?.participantRole?.playingEntity?.code;

        if (code) {
          allergies.push({
            code: code?.['@_code'] || null,
            display: code?.['@_displayName'] || null,
            reaction:
              observation?.entryRelationship?.observation?.value?.[
                '@_displayName'
              ] || null,
            severity:
              observation?.entryRelationship?.observation?.value?.['@_code'] ||
              null,
          });
        }
      }

      return allergies;
    } catch (error) {
      return [];
    }
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
      Sentry.captureException(error, {
        extra: {
          message: 'Error in process pdf attachment',
          payload: content,
          detail: JSON.stringify(error),
        },
      });
      return null;
    }
  }

  async processXMLAttachment(content) {
    const json2 = await xml2json.parseStringPromise(content.toString());
    const patientRecord = json2.ClinicalDocument.recordTarget[0].patientRole[0];
    const id = this._extractId(patientRecord.id[0]['$'].extension);
    const infoElement = patientRecord.patient[0];

    // name fields
    const names = infoElement.name[0];
    let firstName, lastName, middleName;
    firstName = names.given[0];
    middleName = names.given.length > 1 ? names.given[1] : '';
    lastName = names.family[0];
    const name = infoElement.name[0].given
      .concat(infoElement.name[0].family)
      .join(' ');

    // dob field
    const dob = this._parseBirth(infoElement.birthTime[0]['$'].value);
    // address field
    const address = this._parseAddress(patientRecord.addr[0]);
    const phones = this._parsePhones(patientRecord.telecom);
    const gender = this._parseGender(infoElement.administrativeGenderCode);
    const contentComponents = this._extractContentComponents(json2);
    const referralContent = this._extractReferralContent(contentComponents);

    return {
      id,
      name,
      names: {
        firstName,
        lastName,
        middleName,
      },
      dob,
      address,
      phones,
      gender,
      referralContent,
      contentComponents,
    };
  }

  async sendMessage(to, info, buffer) {
    if (!this.username || !this.password) {
      return Promise.reject('MaxMD log in failed');
    }
    const url = `${this.apiBaseUri}/Send`;
    const body = {
      authentication: {
        username: this.username,
        password: this.password,
      },
      message: {
        sender: this.username,
        subject: info.subject,
        body: info.body,
        htmlBody: true,
        recipients: [{ email: to, type: 'TO' }],
        attachmentList: [
          {
            content: buffer,
            contentType: 'application/pdf',
            filename: info.attachment,
          },
        ],
      },
    };
    const options = {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      data: JSON.stringify(body),
      url,
    };

    try {
      const response = await axios(options);
      return response.data;
    } catch (error) {
      Sentry.captureException(error, {
        extra: {
          message: 'Error in MaxMD send message',
          payload: { to, info, buffer },
          detail: JSON.stringify(error),
        },
      });
      return null;
    }
  }

  _extractId(idString) {
    if (idString.indexOf('E-') >= 0) {
      return idString.substr(idString.indexOf('E-') + 2);
    }
    return idString;
  }

  _parseBirth(birthString) {
    const year = birthString.substr(0, 4);
    const month = birthString.substr(4, 2);
    const day = birthString.substr(6, 2);
    return `${month}/${day}/${year}`;
  }

  _parseAddress(addr) {
    try {
      return {
        city: addr.city[0],
        addressLine1: addr.streetAddressLine[0],
        addressLine2:
          addr.streetAddressLine.length > 1 ? addr.streetAddressLine[1] : '',
        state: addr.state[0],
        stateCode: addr.state[0],
        country: addr.country[0],
        countryCode: addr.country[0],
        zipcode: addr.postalCode[0],
      };
    } catch (e) {
      Sentry.captureException(e, {
        extra: {
          message: 'Error in parse address of MaxMD service',
          payload: addr,
          detail: JSON.stringify(e),
        },
      });
      return {};
    }
  }

  _parsePhones(phoneElement) {
    let mobile, home, work;

    for (let elem of phoneElement) {
      if (elem['$'].value?.startsWith('tel:')) {
        const numberStartIndex = elem['$'].value.indexOf('(');
        const number = elem['$'].value.substr(numberStartIndex);
        if (elem['$'].use === 'HP') {
          home = number;
        } else if (elem['$'].use === 'MC') {
          mobile = number;
        } else if (elem['$'].use === 'WP') {
          work = number;
        }
      }
    }
    return { mobile, home, work };
  }

  _parseGender(genderElement) {
    return genderElement[0]['$'].displayName;
  }

  _extractContentComponents(jsonObject) {
    const contentComponents =
      jsonObject.ClinicalDocument.component[0].structuredBody[0].component;
    const components = {};
    for (let componentElement of contentComponents) {
      const componentTitle = componentElement.section[0].title[0];
      components[componentTitle] = componentElement.section[0].text[0];
    }
    return components;
  }

  _extractReferralContent(components) {
    const tableRows = components['Plan of Treatment']?.table[0]?.tbody[0]?.tr;
    let referralContent = '';
    if (tableRows) {
      for (let row of tableRows) {
        if (row.td[0].content && row.td[0].content[0]['_'] === 'Referral') {
          if (row.td[1].content && row.td[1].content[0]) {
            referralContent = row.td[1].content[0]['_'];
          }
          break;
        }
      }
    }
    return referralContent;
  }
}

export default MaxMDService;
