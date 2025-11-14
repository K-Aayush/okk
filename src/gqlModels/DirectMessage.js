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

   type CCDAReasonForReferral {
    code: String
    display: String
    system: String
  }

  type CCDAProblem {
    code: String
    display: String
    system: String
    onsetDate: String
  }

  type CCDAProcedure {
    code: String
    display: String
    system: String
    date: String
  }

  type CCDAMedication {
    code: String
    display: String
    dosage: String
    startDate: String
  }

  type CCDAAllergy {
    code: String
    display: String
    reaction: String
    severity: String
  }

  type CCDASnapshot {
    reasonForReferral: CCDAReasonForReferral
    problems: [CCDAProblem]
    procedures: [CCDAProcedure]
    medications: [CCDAMedication]
    allergies: [CCDAAllergy]
  }

  type CCDAData {
    version: String
    parseStatus: String
    snapshot: CCDASnapshot
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
    ccda: CCDAData 
  }

  type DirectMessageReplyAddress {
    _id: ID
    practice: Practice
    user: User
    directMessageAddress: String
  }
`;
