export const ERROR_MESSAGE = {
  ALREADY_CONTACT: 'You are already in a contact with the user.',
  ALREADY_MEMBER: 'The user is already a member of the group',
  INVALID_INVITE: 'This invitation is not longer valid.',
  ADMINS_ONLY: 'Only admins are allowed to perform this action.',
  PROVIDERS_ONLY: 'Only providers are allowed to perform this action.',
  PATIENTS_NOT_ALLOWED_TO_JOIN_PRACTICE:
    'Patients are not allowed to join a practice.',
  NO_PERMISSION: 'You do not have permission to perform this action.',
  DUPLICATE_EMAIL: 'This email already exists. Please change the email.',
  DUPLICATE_NPI: 'This NPI already exists. Please change the npi.',
  DUPLICATE_SSN: 'This SSN already exists. Please change the SSN.',
  DUPLICATE_GROUP: 'This name already exists. Please change the name.',
  DUPLICATE_PHONE_NUMBER:
    'This phone number already exists. Please change the number.',
  INVALID_INPUT: 'Some parameters are wrong.',
};

export const MEMBER_DESIGNATIONS = {
  doctor: 'MD',
  do: 'DO',
  nursePractioner: 'NP/CNM/DNP',
  pa: 'PA',
  crna: 'CRNA',
  rn: 'RN',
  pharmacist: 'PharmD/RPh',
  other: 'Other Healthcare Professional',
};
