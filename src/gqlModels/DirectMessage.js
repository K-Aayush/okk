export default `
  type DirectMessageAttachment {
    fileName: String
    contentType: String
  }

  type DirectMessagePatientInfo {
    id: String
    name: String
    dob: String
  }

  type DirectMessageNoteShare {
    by: ID
    with: ID
    at: Date
  }

  type DirectMessageDMShare {
    sharedAt: Date
    to: ID
  }

  type DirectMessageNoteInfo {
    _id: ID
    creator: ID
    shares: [DirectMessageNoteShare]
    directMessageShare: [DirectMessageDMShare]
  }

  type DirectMessage {
    _id: ID
    messageId: String
    from: String
    to: [String]
    body: String
    attachment: DirectMessageAttachment
    patientInfo: DirectMessagePatientInfo
    patient: User
    subject: String
    practice: Practice
    sender: User
    note: DirectMessageNoteInfo
    createTime: Date
  }

  type DirectMessageReplyAddress {
    _id: ID
    practice: Practice
    user: User
    directMessageAddress: String
  }
`;
