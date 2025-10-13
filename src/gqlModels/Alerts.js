export default `
  type CareplanAlert {
    _id: ID
    user: User
    measure: String
    subType: String
    triggerTime: Date
    alerts: JSON
    isSeen: Boolean
  }

  type CareplanPatientAlert {
    user: User
    triggerTime: Date
    unseen: Int
  }
`;
