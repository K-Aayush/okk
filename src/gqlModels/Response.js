export default `
  type CareplanResponse {
    date: Date
    careplan: ID
    responses: JSON
  }

  type CareplanResponses {
    responses: [CareplanResponse]
    careplans: [Careplan]
  }

  input CareplanResponseInput {
    measure: String!
    time: Date!
    response: JSONObject
  }

  type Progress {
    vital: JSONObject
    medication: JSONObject
    activity: JSONObject
    wellness: JSONObject
    diet: JSONObject
    appointment: JSONObject
    period: String
  }
`;
