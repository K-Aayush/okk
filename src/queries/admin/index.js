import adminAuthQueries from './Auth';
import adminUserQueries from './User';
import specialtyQueries from './Specialty';
import practiceQueries from './Practice';
import directMessageQueries from './DirectMessage';

const allQueries = [
  ...adminAuthQueries,
  ...adminUserQueries,
  ...specialtyQueries,
  ...practiceQueries,
  ...directMessageQueries,
];

const authenticate = (func, isPublic) => (args, context) => {
  if (!isPublic && !context.user) {
    throw new Error('Invalid Auth!');
  }
  return func(args, context);
};

export const adminQueries = allQueries
  .filter(({ mutation }) => !mutation)
  .map(({ key, prototype }) => `${key}${prototype}`)
  .join(',\n  ');

export const adminMutations = allQueries
  .filter(({ mutation }) => mutation)
  .map(({ key, prototype }) => `${key}${prototype}`)
  .join(',\n  ');

export const adminRoot = allQueries.reduce(
  (cur, { key, isPublic, run }) => ({
    ...cur,
    [key]: authenticate(run, isPublic),
  }),
  {}
);
