export default `
  type AdminUser {
    _id: ID!
    email: String!
    firstName: String
    lastName: String
  }

  type UserBasic {
    _id: ID!
    firstName: String
    lastName: String
    middleName: String
    email: String
    phones: Phones
    address: Address
    memberDesignation: String
  }
`;
