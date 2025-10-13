export default `
  type PaymentMethod {
    _id: ID!
    cardType: String!
    last4Digits: String!
    isDefault: Boolean
  }

  input PaymentMethodInput {
    type: String!
    number: String!
    exp: String!
    cvc: String!
  }
`;
