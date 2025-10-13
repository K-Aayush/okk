export default `
  type Invite {
    _id: ID!
    group: Group
    practice: Practice
    inviter: User
    invitee: User
  }

  type IndividualInvites {
    received: Boolean
    category: String
    invites: [Invite]
    total: Int
  }

  type PracticeInvite {
    practice: Practice
    totalReceived: Int
    totalSent: Int
  }

  type GroupInvite {
    group: Group
    totalReceived: Int
    totalSent: Int
  }

  type InviteCount {
    individualInviteCount: Int
    practiceInviteCount: Int
  }
`;
