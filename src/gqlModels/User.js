export default `
  type User {
    _id: ID!
    firstName: String
    lastName: String
    middleName: String
    email: String
    role: String
    phones: Phones
    photo: File
    status: String
    activeProviderPractice: ProviderPractice
    address: Address

    npi: String
    memberDesignation: String

    athenaId: String
    ssn: String
    dob: String
    gender: String
    maritalStatus: String
    bpmIMEI: String
    scaleIMEI: String
    insurances: [Insurance]
    recentPatients: [String]
    notifications: JSONObject
  }

  type UserNewItemsCount {
    invite: InviteCount
    report: Int
    note: Int
    careplan: Int
    coordinate: Int
    call: Int
    alert: Int
    prescribe: Int
  }

  type UserSignature {
    saveSignature: Boolean
    signature: String
  }

  input UserInput {
    firstName: String!
    lastName: String!
    middleName: String
    email: String
    password: String
    phones: PhonesInput!
    photo: FileInput
    pin: String
    address: AddressInput
    specialty: String
  }

  input ProviderInput {
    user: UserInput!
    npi: String
    memberDesignation: String
  }

  input NotificationInput {
    email: JSONObject
    text: JSONObject
    voice: JSONObject
  }

  input PatientInput {
    user: UserInput
    athenaId: String
    ssn: String
    dob: String
    gender: String
    maritalStatus: String
    bpmIMEI: String
    scaleIMEI: String
    insurances: [InsuranceInput]
    notifications: NotificationInput
  }

  input PatientOnboardInput {
    password: String!
    pin: String!
  }

  input UserSecurityInput {
    currentPassword: String
    password: String
    currentPin: String
    pin: String
  }
`;
