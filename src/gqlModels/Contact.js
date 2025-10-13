export default `
  union Contact = User | Practice | Group

  type Lead {
    contact: Contact
    inviteId: ID
    outgoing: Boolean
  }
`;
