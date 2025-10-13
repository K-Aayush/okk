export default `
  type Call {
    _id: ID!
    token: String
    callType: String
    status: String
    isPSTN: Boolean
    referredPatient: User
    appointment: ID
  }

  type PSTNInfo {
    phoneType: String
    number: String
  }

  type CallAttendee {
    user: User!
    status: String
  }

  type CallHistory {
    _id: String!
    callType: String
    attendees: [CallAttendee!]
    status: String
    referredPatient: User
    isPSTN: Boolean
    pstnInfo: PSTNInfo
    startTime: Date
    endTime: Date
    createdAt: Date
  }

  type CallFromToken {
    me: Auth
    appointment: Appointment
    call: Call
  }
`;
