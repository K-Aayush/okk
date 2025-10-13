import bcrypt from 'bcryptjs';
import { AdminUser } from '../../db';

export default [
  {
    key: 'adminUsers',
    prototype: ': [AdminUser!]',
    run: async ({}, { user }) => {
      return await AdminUser.find().lean();
    },
  },
  {
    key: 'addAdminUser',
    prototype:
      '(email: String!, password: String!, firstName: String, lastName: String): Boolean',
    mutation: true,
    run: async ({ email, password, firstName, lastName }, { user }) => {
      const existingUser = await AdminUser.findOne({ email });
      if (existingUser) {
        throw Error('Email already exists!');
      }
      const passwordHash = bcrypt.hashSync(password, 10);
      await AdminUser.create({
        email,
        password: passwordHash,
        firstName,
        lastName,
      });
      return true;
    },
  },
  {
    key: 'deleteAdminUser',
    prototype: '(id: ID!): Boolean',
    mutation: true,
    run: async ({ id }, { user }) => {
      if (user._id == id) {
        throw Error('Can not delete your account!');
      }
      await AdminUser.deleteOne({ _id: id });
      return true;
    },
  },
];
