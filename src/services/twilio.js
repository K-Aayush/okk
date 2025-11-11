import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const API_KEY = process.env.TWILIO_API_KEY;
const API_SECRET = process.env.TWILIO_API_SECRET;

const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

export const sendMessage = async (to, message) => {
  await client.messages.create({
    body: message,
    from: '+15402460638',
    to: formatNumber(to),
  });
};

export const sendOnboardingSMS = async (to, { header, line, link }) => {
  const message = `
    ${header}
    ${line}

    Please, sign up with your mobile number by going to the following link:
    ${link}
  `;

  sendMessage(to, message);
};

export const sendJoinPracticeRequestAcceptedSMS = async (
  to,
  { practice, link }
) => {
  const message = `
    Gazuntite Notification

    Your reuqest to join ${practice} has been accepted.
    You can login to your account to complete the registration at ${link}.
  `;

  sendMessage(to, message);
};

export const sendContactSMS = async (to, { header, line, link }) => {
  const message = `
    ${header}
    ${line}

    Please open the app and go to invitations page to accept or decline it.
    ${link}
  `;

  sendMessage(to, message);
};

export const sendAppointmentSMS = async (
  to,
  { header, time, portalUrl, calendarUrl }
) => {
  const message = `
    ${header}

    ${time}

    Access your portal by going to:
    ${portalUrl}

    Please add to your calendar by clicking the link below.
    ${calendarUrl}
  `;

  sendMessage(to, message);
};

export const sendAppointmentCancellationSMS = async (
  to,
  { header, portalUrl }
) => {
  const message = `
    ${header}

    Access your portal by going to:
    ${portalUrl}
  `;

  sendMessage(to, message);
};

export const sendAppointmentReminderNowSMS = async (
  to,
  { header, time, portalUrl }
) => {
  const message = `
    ${header}

    ${time}

    To start, visit please press link below:
    ${portalUrl}
  `;

  sendMessage(to, message);
};

export const sendCareplanCreatedSMS = async (to, { header, portalUrl }) => {
  const message = `
    ${header}

    To check the careplan, please press link below:
    ${portalUrl}
  `;

  sendMessage(to, message);
};

export const sendCPTaskReminderNowSMS = async (
  to,
  { header, detail, portalUrl }
) => {
  const message = `${header}\n\n${detail}\n\nTo add careplan response, press link below:\n${portalUrl}`;

  sendMessage(to, message);
};

export const sendMessageSMS = async (to, { header, body, portalUrl }) => {
  const message = `
    ${header}

    ${body}

    To view and reply the message, press link below:
    ${portalUrl}
  `;

  sendMessage(to, message);
};

export const sendDMResponseSMS = async (
  to,
  { patientId, providerName, chatUrl }
) => {
  const message = `
    Gazuntite Notification
    Patient case #${patientId} has been addressed and replied by ${providerName}.
    Open your Gazuntite account for further assistance at ${chatUrl}.
  `;

  sendMessage(to, message);
};

export const sendDMArrivalSMS = async (to, { providerName, portalUrl }) => {
  const message = `
    Gazuntite Notification
    You have a new referral direct message from ${providerName}.
    To view and reply the patient referral case, press link below:
    ${portalUrl} 
  `;

  sendMessage(to, message);
};

export const sendDMArrivalSMStoPCP = async (to, { portalUrl }) => {
  const message = `
    Gazuntite Notification
    We have received your referral and will respond within 72 hours.
    For further assistance, please log in at ${portalUrl}.
  `;

  sendMessage(to, message);
};

export const sendVerificationToken = async (to) => {
  return await client.verify
    .services(process.env.VERIFICATION_SID)
    .verifications.create({ to: '+1 ' + to, channel: 'sms' });
};

export const checkVerificationToken = async (to, code) => {
  return await client.verify
    .services(process.env.VERIFICATION_SID)
    .verificationChecks.create({ to: '+1 ' + to, code });
};

export const createVideoRoomAccessToken = async (callId, userId) => {
  // Create an access token which we will sign and return to the client,
  // containing the grant we just created
  const AccessToken = twilio.jwt.AccessToken;
  const token = new AccessToken(ACCOUNT_SID, API_KEY, API_SECRET, {
    identity: userId.toString(),
    ttl: 60,
  });

  token.addGrant(
    new AccessToken.VideoGrant({
      room: callId.toString(),
    })
  );

  return token.toJwt();
};

export const makePSTNCall = async (from, to, room) => {
  return new Promise((resolve, reject) => {
    client.calls
      .create({
        twiml: `
          <Response>
            <Connect>
              <Room>${room}</Room>
            </Connect>
          </Response>`,
        to: formatNumber(to),
        from: formatNumber(from),
      })
      .then(resolve)
      .catch(reject);
  });
};

export const dropPSTNCall = async (sid) => {
  return client.calls(sid).update({ status: 'completed' });
};

const formatNumber = (number) => {
  return `+1${number.replace(/\D/g, '')}`;
};

export const checkPhoneVerficationRequestPromise = (number) => {
  return new Promise((resolve, reject) => {
    if (!number) {
      return resolve(false);
    }
    client.outgoingCallerIds
      .list({ phoneNumber: formatNumber(number) })
      .then((outgoingCallerIds) => {
        resolve(outgoingCallerIds?.length > 0);
      })
      .catch((e) => {
        resolve(false);
      });
  });
};

export const requestVerification = async (number) => {
  try {
    return await client.validationRequests.create({
      friendlyName: `Gazuntite Number - ${number}`,
      statusCallback: `${process.env.HOST_URL}/callback/verify-number`,
      statusCallbackMethod: 'GET',
      phoneNumber: formatNumber(number),
    });
  } catch (error) {
    if (error.code === 21450) {
      return { validationCode: 'verified' };
    }
    throw error;
  }
};
