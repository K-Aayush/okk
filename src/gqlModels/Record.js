export default `
  input RecordItemInput {
    type: String
    entityId: String
    startedAt: Int!
    endedAt: Int!
    duration: Int!
    deleted: Boolean
  }

  input RecordInput {
    practice: String!
    provider: String!
    patient: String!
    startedAt: Int!
    clientRecordId: String
    endedAt: Int!
    totalTime: Int!
    isManual: Boolean
    description: String
    items: [RecordItemInput]
  }

  type RecordItem {
    _id: ID!
    type: String
    entityId: String
    scheduled: Boolean
    isPSTN: Boolean
    startedAt: Date!
    endedAt: Date!
    duration: Int!
    deleted: Boolean
    participants: [User]
    referredPatient: User
  }

  type Record {
    _id: ID!
    startedAt: Date!
    endedAt: Date!
    totalTime: Int!
    isManual: Boolean
    dscription: String
    items: [RecordItem]
    provider: User
    patient: ID
  }

  type PatientRecordNotifications {
    directMessageCount: Int
    newNoteCount: Int
  }
`;
