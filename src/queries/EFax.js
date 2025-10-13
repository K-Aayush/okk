import { EFaxInboxItem } from '../db';
import { checkDateForPeriod } from '../utils/time';

export default [
  {
    key: 'eFaxMessages',
    prototype: '(period: String!): [EFaxMessage]',
    run: async ({ period }, { user }) => {
      if (user.role === 'patient') {
        return [];
      }
      const checkDate = checkDateForPeriod(period || 'all');
      const conditions = {};
      if (period !== 'all') {
        conditions['createTime'] = { $gt: checkDate };
      }

      return await EFaxInboxItem.find(conditions).sort({ createTime: -1 });
    },
  },
];
