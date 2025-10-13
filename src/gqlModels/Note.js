export default `
  type NoteObjective {
    heartRate: Int
    glucose: Int
    weight: Float
    bloodPressure: Int
    bloodPressure2: Int
    bloodOxygen: Float
    respiratory: Int
    temperature: Float
  }

  type NoteAttachment {
    category: String!
    url: String
    type: String
    originalName: String
    chatId: ID
    messageIds: [ID]
    note: ID
    directMessage: ID
    createdAt: Date
  }

  type NoteContent {
    subjective: String
    objective: NoteObjective
    assessment: String
    diagnosis: [Diagnosis!]
    plan: String
    attachments: [NoteAttachment]
  }

  type NoteShare {
    by: ProviderPractice
    with: ProviderPractice
    at: Date
  }

  type NoteDirectMessage {
    _id: ID
    practice: Practice
    sender: User
    createTime: Date
    body: String
  }

  type NoteDirectMessageShare {
    sharedAt: Date
    to: ProviderPractice
  }

  type Note {
    _id: ID!
    user: User
    patient: PatientPractice
    isDraft: Boolean
    signDate: Date
    practices: [Practice]
    creator: ProviderPractice
    content: NoteContent
    createdAt: Date!
    updatedAt: Date!
    shares: [NoteShare]
    isSeen: Boolean
    directMessage: NoteDirectMessage
    signature: String
    directMessageShare: [NoteDirectMessageShare]
  }

  type NoteItemPastRecord {
    time: Date
    content: NoteContent
  }

  input NoteObjectiveInput {
    heartRate: Int
    glucose: Int
    weight: Float
    bloodPressure: Int
    bloodPressure2: Int
    bloodOxygen: Float
    respiratory: Int
    temperature: Float
  }

  input NoteAttachmentInput {
    category: String
    type: String
    originalName: String
    url: String
    chatId: ID
    messageIds: [ID]
    note: ID
    directMessage: ID
    createdAt: Date
  }

  input NoteContentInput {
    subjective: String
    objective: NoteObjectiveInput
    assessment: String
    diagnosis: [DiagnosisInput!]
    plan: String
    attachments: [NoteAttachmentInput]
  }

  input NoteInput {
    _id: ID
    user: ID!
    patient: ID
    content: NoteContentInput
    signature: String
    saveSignature: Boolean
    isChangedFromSavedSignature: Boolean
  }
`;
