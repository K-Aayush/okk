import { ProviderPractice } from '../../db';
import {
  checkExistingDMAddress,
  getDirectMessageReplyAddresses,
} from '../../utils/direct-message';

export default [
  {
    key: 'directMessageReplyAddresses',
    prototype: ': [PracticeUser!]',
    run: async ({}, { user }) => {
      return await getDirectMessageReplyAddresses();
    },
  },
  {
    key: 'editDirectMessageReplyAddress',
    prototype: '(id: ID, directMessageAddress: String): Boolean',
    mutation: true,
    run: async ({ id, directMessageAddress }, { user }) => {
      const providerPractice = await ProviderPractice.findById(id);
      if (!providerPractice) {
        return false;
      }
      const existingAddress = await checkExistingDMAddress(
        directMessageAddress,
        id
      );
      if (existingAddress) {
        throw Error(
          `Email already exists${
            existingAddress.message ? ` (${existingAddress.message})` : ''
          }`
        );
      }
      await ProviderPractice.findByIdAndUpdate(id, { directMessageAddress });
      return true;
    },
  },
];
