export default `
  type AuthAdminUser {
    _id: ID!
    email: String!
    firstName: String
    lastName: String
  }

  type AuthAdmin {
    error: String
    token: String
    user: AuthAdminUser
  }
`;
