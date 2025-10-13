export default `
  type EFaxAttachment {
    fileName: String
    contentType: String
    fileUrl: String
  }

  type EFaxMessage {
    _id: ID
    messageId: String
    from: String
    to: String
    attachment: EFaxAttachment
    createTime: Date
  }
`;
