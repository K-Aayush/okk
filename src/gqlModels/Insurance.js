export default `
  type Insurance {
    company: String
    id: String
    groupNumber: String
    card: File
  }

  input InsuranceInput {
    company: String!
    id: String
    groupNumber: String
    card: FileInput
  }
`;
