import { PatientPractice, User } from '../db';

export const getUserPractice = async (userIdOrObject) => {
  let user = userIdOrObject;
  if (user?._id) {
    user = await User.findById(userIdOrObject).populate({
      path: 'activeProviderPractice',
      populate: {
        path: 'practice',
      },
    });
  }
  if (!user) {
    return null;
  }
  if (user.role === 'provider') {
    return user.activeProviderPractice?.practice || null;
  }
  const patientPractice = await PatientPractice.findOne({
    patient: user._id,
  }).populate('practice');
  return patientPractice?.practice || null;
};
