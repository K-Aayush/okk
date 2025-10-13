export default `
  type Phones {
    mobile: String
    home: String
    work: String
    preference: String
    masking: String
  }

  type PhoneVerifyStatus {
    mobile: Boolean
    home: Boolean
    work: Boolean
  }

  input PhonesInput {
    mobile: String!
    home: String
    work: String
    preference: String
    masking: String
  }
`;
