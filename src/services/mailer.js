import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';

dotenv.config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendWithTemplate = async ({
  to,
  templateId,
  data,
  bcc,
  cc,
  fromName = 'Gazuntite',
  fromEmail = 'noreply@gazuntite.com',
  replyTo,
}) => {
  const from = {
    name: fromName,
    email: fromEmail,
  };

  await sgMail.send({
    to,
    from,
    cc: cc || undefined,
    bcc: bcc || undefined,
    replyTo: replyTo || from,
    templateId,
    dynamic_template_data: {
      hostUrl: process.env.HOST_URL_PROVIDER,
      ...data,
    },
  });
};

export const sendRegCode = async (to, fullName, code) => {
  await sendWithTemplate({
    templateId: 'd-f00a1cbddad84f2d824d5f2dafcd8863',
    to,
    data: {
      name: fullName,
      code,
    },
  });
};

export const sendResetPasswordEmail = async (to, fullName, url) => {
  await sendWithTemplate({
    templateId: 'd-9b4b40283be6446f9ac783c779ac9252',
    to,
    data: {
      name: fullName,
      url,
    },
  });
};

export const sendResetPasswordSuccessEmail = async (to, fullName) => {
  await sendWithTemplate({
    templateId: 'd-45ddb966beb5400da420cf1292df9fd5',
    to,
    data: {
      name: fullName,
    },
  });
};

export const sendOnboardingEmail = async (
  to,
  { subject, header, line, link }
) => {
  await sendWithTemplate({
    templateId: 'd-3d9e3a64d0864870ba3392329d181f83',
    to,
    data: {
      subject,
      header,
      line,
      link,
    },
  });
};

export const sendJoinPracticeRequestAcceptedEmail = async (
  to,
  { practice, link }
) => {
  await sendWithTemplate({
    templateId: 'd-842be9102b1c4bf6bbf656790d618753',
    to,
    data: {
      practice,
      link,
    },
  });
};

export const sendContactEmail = async (to, { subject, header, line, link }) => {
  await sendWithTemplate({
    templateId: 'd-9ab756e9e7344c76b5eb649d9f77a35c',
    to,
    data: {
      subject,
      header,
      line,
      link,
    },
  });
};

export const sendAppointmentEmail = async (
  to,
  fromName,
  {
    subject,
    header,
    body,
    cardHeader,
    cardBody1,
    cardBody2,
    portalUrl,
    calendarUrl,
  }
) => {
  await sendWithTemplate({
    templateId: 'd-c1c437c20bc6428e9e7ac72aaae285c6',
    to,
    fromName,
    data: {
      subject,
      header,
      body,
      cardHeader,
      cardBody1,
      cardBody2,
      portalUrl,
      calendarUrl,
      isNow: false,
    },
  });
};

export const sendAppointmentCancellationEmail = async (
  to,
  fromName,
  { subject, header, body, portalUrl }
) => {
  await sendWithTemplate({
    // d6984b95042f4323b8f8a73e642a2911 reschedule
    templateId: 'd-1558e2e6fb024fb8845c9307e4a7d9c0',
    to,
    fromName,
    data: {
      subject,
      header,
      body,
      portalUrl,
      isNow: false,
    },
  });
};

export const sendAppointmentReminderNowEmail = async (
  to,
  fromName,
  {
    subject,
    header,
    body,
    cardHeader,
    cardBody1,
    cardBody2,
    portalUrl,
    calendarUrl,
  }
) => {
  await sendWithTemplate({
    templateId: 'd-c1c437c20bc6428e9e7ac72aaae285c6',
    to,
    fromName,
    data: {
      subject,
      header,
      body,
      cardHeader,
      cardBody1,
      cardBody2,
      portalUrl,
      calendarUrl,
      isNow: true,
    },
  });
};

export const sendCareplanCreatedEmail = async (
  to,
  fromName,
  { patientName, providerName, practiceName, portalUrl }
) => {
  await sendWithTemplate({
    templateId: 'd-b305a6c6de74431f9119b4d601e1ed85',
    to,
    fromName,
    data: {
      name: patientName,
      provider: providerName,
      practice: practiceName,
      portalUrl,
    },
  });
};

export const sendCPTaskReminderNowEmail = async (
  to,
  fromName,
  { patientName, detail, portalUrl }
) => {
  await sendWithTemplate({
    templateId: 'd-5a8cb3da9e624acf8f0b1e48c99bade6',
    to,
    fromName,
    data: {
      name: patientName,
      taskDetail: detail,
      portalUrl,
    },
  });
};

export const sendMessageEmail = async (
  to,
  { subject, header, body, portalUrl }
) => {
  await sendWithTemplate({
    templateId: 'd-e430d7c899444c839c5612beb64fe5eb',
    to,
    data: {
      subject,
      header,
      body,
      portalUrl,
    },
  });
};

export const sendDMResponseEmail = async (to, messageParams) => {
  await sendWithTemplate({
    templateId: 'd-38462f1bd34141ca8e2eefadecd21990', // Where are these templates coming from?
    to,
    data: messageParams,
  });
};

export const sendDMArrivalEmail = async (to, messageParams) => {
  await sendWithTemplate({
    templateId: 'd-d5e652ba47b34a4f9b3fb6abbf2e0311', // Where are these templates coming from?
    to,
    data: messageParams,
  });
};

export const sendDMArrivalEmailtoPCP = async (to, messageParams) => {
  await sendWithTemplate({
    templateId: 'd-184e82ea354c4f9cb58990c03fd88170', // Where are these templates coming from?
    to,
    data: messageParams,
  });
};
