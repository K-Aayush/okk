import { ProviderPractice, Practice } from '../db';

export default [
  {
    key: 'practicesList',
    prototype: ': [PracticeBasic]',
    run: async ({}, { user }) => {
      const userPractices = await ProviderPractice.find({
        user: user._id,
      }).lean();
      const practiceIds = userPractices.map((practice) => practice.practice);
      const practices = await Practice.find({ _id: { $in: practiceIds } });
      return practices;
    },
  },
];
