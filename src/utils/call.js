import crypto from 'crypto';

export const canJoinCall = (call) => {
  return call.status === 'scheduled' || call.status === 'active';
};

export const createCallToken = (id, user) => {
  const userId = user?._id || user;
  const token = crypto
    .createHash('md5')
    .update(`${id}-${userId}`)
    .digest('hex');
  return token;
};
