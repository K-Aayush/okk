export default `
  type SignedUrl {
    signedRequest: String
    url: String
  }

  type File {
    originalName: String
    type: String
    url: String
  }

  input FileInput {
    originalName: String
    type: String
    url: String
  }
`;
