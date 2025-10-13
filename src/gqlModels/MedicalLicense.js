export default `
  type MedicalLicense {
    _id: ID!
    stateCode: String!
    licenseNumber: String!
    status: String!
    expiredAt: Date!
  }
  
  input MedicalLicenseInput {
    stateCode: String!
    expiredAt: Date!
    licenseNumber: String!
  }
`;
