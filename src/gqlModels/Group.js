export default `
  type Group {
    _id: ID!
    createdBy: User
    name: String!
    description: String
    image: File
  }

  type GroupUser {
    group: Group!
    user: User!
    isAdmin: Boolean
  }

  type GroupDetails {
    isAdmin: Boolean
    group: Group
    members: [GroupUser]
    invites: [Invite]
    requests: [Invite]
  }

  input GroupInput {
    name: String!
    image: FileInput
    npi: String
    address: AddressInput
    fax: String
    email: String
    phone: String
    description: String
  }
`;
