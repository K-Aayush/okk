export default `
  type AuthUser {
    _id: ID!
    firstName: String
    lastName: String
    middleName: String
    email: String!
    role: String
    phones: Phones
    photo: File
    status: String
    activeProviderPractice: AuthProviderPractice
    patientPractice: Practice
    address: Address

    npi: String
    memberDesignation: String
    specialty: String

    ssn: String
    dob: String
    gender: String
    maritalStatus: String
    bpmIMEI: String
    scaleIMEI: String
    insurances: [Insurance]
    recentPatients: [String]
    notifications: JSONObject
    isTempAuth: Boolean
    licenses: [MedicalLicense]
  }

  type Auth {
    error: String
    token: String
    user: AuthUser
  }
`;
