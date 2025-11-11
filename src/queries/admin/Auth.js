import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { AdminUser } from '../../db';
import { GraphQLUserError } from '../../errors';

export default [
  {
    key: 'me',
    prototype: ': AuthAdminUser',
    run: async (_, { user }) => {
      return user;
    },
  },
  {
    key: 'adminLogin',
    prototype: '(email: String!, password: String!): AuthAdmin',
    mutation: true,
    isPublic: true,
    run: async ({ email, password }) => {
      if (!email || !password) {
        throw Error('Empty credential');
      }

      const adminUserCount = await AdminUser.countDocuments();

      if (adminUserCount > 0) {
        const adminUser = await AdminUser.findOne({ email });
        if (bcrypt.compareSync(password, adminUser.password)) {
          return {
            error: null,
            token: jwt.sign(
              { _id: adminUser._id, email },
              process.env.SUPER_PASSWORD
            ),
            user: {
              _id: adminUser._id,
              email,
              role: 'admin-user',
              firstName: adminUser.firstName,
              lastName: adminUser.lastName,
            },
          };
        } else {
          throw new GraphQLUserError('Invalid Credential');
        }
      } else if (
        email === 'john.harrison@gazuntite.com' &&
        password === 'Test1234!'
      ) {
        return {
          error: null,
          token: jwt.sign(
            { _id: 'admin_init_id', email: 'john.harrison@gazuntite.com' },
            process.env.SUPER_PASSWORD
          ),
          user: {
            _id: 'admin_init_id',
            email: 'john.harrison@gazuntite.com',
            role: 'admin-user',
            firstName: 'John',
            lastName: 'Harrison',
          },
        };
      }

      throw new GraphQLUserError('Invalid crendeital');
    },
  },
];
