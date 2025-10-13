export default `
  type Practice {
    _id: ID!
    name: String!
    npi: String
    address: Address
    fax: String
    email: String
    phone: String!
    image: File
    directMessageDomain: String
    isGazuntitePractice: Boolean
  }

  type PracticeBasic {
    _id: ID!
    name: String!
  }

  type ProviderPractice {
    practice: Practice
    user: User!
    isAdmin: Boolean
    title: String
  }

  type BillingConfiguration {
    time: Int
    therapeutic: Int
    physiologic: Int
  }

  type AuthProviderPractice {
    _id: ID
    practice: Practice
    user: User!
    isAdmin: Boolean
    title: String
    operationSchedule: [Schedule]
    billing: BillingConfiguration
    disableTracking: Boolean
    isLicensed: Boolean
  }

  type PatientPractice {
    practice: Practice
    user: User!
  }

  type Specialty {
    title: String!
  }

  input PracticeInput {
    name: String!
    image: FileInput
    npi: String
    address: AddressInput
    fax: String
    email: String
    phone: String
    description: String
    directMessageDomain: String
    isGazuntitePractice: Boolean
  }

  type PracticeDetails {
    isAdmin: Boolean
    group: Practice
    members: [ProviderPractice]
    invites: [Invite]
    requests: [Invite]
  }
`;
