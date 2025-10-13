export default `
  type Practice {
    _id: ID!
    name: String!
    npi: String
    address: Address
    email: String!
    phone: String!
    fax: String
    directMessageDomain: String
    isGazuntitePractice: Boolean
  }
  
  type OtherPractice {
    _id: ID!
    deactivated: Boolean
    isPrimaryPractice: Boolean
    practice: Practice
  }

  type PracticeMember {
    _id: ID!
    user: UserBasic
    disableTracking: Boolean
    directMessageAddress: String
    otherPractices: [OtherPractice]
  }

  type PracticeUser {
    _id: ID!
    user: UserBasic
    practice: Practice
    disableTracking: Boolean
    directMessageAddress: String
  }

  type PracticeMemberTrackingStatus {
    _id: ID!
    user: UserBasic
    disableTracking: Boolean
  }

  input PracticeInput {
    name: String!
    npi: String
    address: AddressInput
    email: String!
    phone: String!
    fax: String
    directMessageDomain: String
    isGazuntitePractice: Boolean
  }

  input AssignPracticeMemberInput {
    practice: ID!
    isMember: Boolean!
  }
`;
