export default `
  type Address {
    addressLine1: String!
    addressLine2: String
    city: String!
    state: String!
    stateCode: String
    country: String
    countryCode: String
    zipcode: String!
  }

  input AddressInput {
    addressLine1: String!
    addressLine2: String
    city: String!
    state: String!
    stateCode: String
    country: String
    countryCode: String
    zipcode: String!
  }
`;
