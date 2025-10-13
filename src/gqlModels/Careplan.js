export default `
  type CareplanShare {
    by: ProviderPractice!
    at: Date!
  }

  type CareTeam {
    user: User
    appointments: [JSONObject]
    alerts: JSONObject
  }

  type CareplanContent {
    medication: JSONObject
    vital: JSONObject
    activity: JSONObject
    wellness: JSONObject
    diet: JSONObject
    careTeam: [CareTeam]
  }

  type Careplan {
    _id: ID!
    user: User
    patient: User
    isDraft: Boolean
    isActive: Boolean
    startDate: Date
    signDate: Date
    duration: Int
    endDate: Date
    practices: [Practice]
    creator: ProviderPractice
    content: CareplanContent
    createdAt: Date!
    updatedAt: Date!
    shares: [CareplanShare]
    isSeen: Boolean
  }

  input CareplanInput {
    _id: ID
    user: ID!
    content: JSONObject!
    duration: Int
    startDate: Date
  }
`;
