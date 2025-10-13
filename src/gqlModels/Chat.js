export default `
  type ChatMessage {
    _id: ID!
    chat: Chat
    sender: User
    text: String
    attachment: File
    note: Note
    careplan: Careplan
    createdAt: Date!
    updatedAt: Date!
  }
  type Chat {
    _id: ID!
    members: [User]!
    group: String
    referredPatient: User
    messages: [ChatMessage]
    createdAt: Date
    unreadCount: Int
  }

  input ChatMessageInput {
    text: String
    attachment: FileInput
  }
  input ChatInput {
    memberIds: [ID]!
    referredPatientId: ID
    group: String
  }
`;
