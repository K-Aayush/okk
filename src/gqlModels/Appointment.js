export default `
  type Appointment {
    _id: ID!
    creator: User!
    patient: User!
    providers: [User!]
    status: String!
    time: Date!
    reason: String
    createdAt: Date!
    updatedAt: Date!
    joined: [ID!]
  }

  input AppointmentInput {
    patient: ID!
    provider: ID!
    time: Date!
    reason: String
  }
`;
