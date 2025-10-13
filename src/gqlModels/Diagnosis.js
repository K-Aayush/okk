export default `
  type Diagnosis {
    code: String!
    description: String!
    date: Date
  }

  input DiagnosisInput {
    code: String!
    description: String!
    date: Date
  }
`;
