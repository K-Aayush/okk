import { User } from '../db';

export const getNotificationInfo = async (userOrId) => {
  let user = userOrId;
  if (typeof userOrId !== 'object') {
    user = await User.findById(userOrId);
  }

  // disable notification for users without email - for patient auto generated
  if (!user.email) {
    return { email: null, sms: null, voice: null };
  }

  const { notifications } = user;
  if (notifications) {
    const email = notifications.email?.email ? user.email : null;
    const sms = notifications.text?.mobile ? user.phones?.mobile : null;
    let voice;
    if (notifications.voice?.work) {
      voice = user.phones?.work;
    } else if (notifications.voice?.mobile) {
      voice = user.phones?.mobile;
    } else if (notifications.voice?.home) {
      voice = user.phones?.home;
    }

    return { email, sms, voice };
  }

  return {
    email: user.email,
    sms: user.phones?.mobile,
    voice: user.phones?.work || user.phones?.mobile || user.phones?.home,
  };
};
