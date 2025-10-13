import mongoose from 'mongoose';
import { User } from '../db';

export default [
  {
    key: 'addMedicalLicense',
    prototype: '(license: MedicalLicenseInput!): [MedicalLicense]',
    mutation: true,
    run: async ({ license }, { user }) => {
      if (user.role === 'patient') {
        throw new Error('Invalid operation');
      }
      user.licenses.push({ ...license, status: 'Valid' });
      await user.save();
      return user.licenses;
    },
  },
  {
    key: 'deleteMedicalLicense',
    prototype: '(id: ID!): [MedicalLicense]',
    mutation: true,
    run: async ({ id }, { user }) => {
      await User.findOneAndUpdate(
        { _id: user._id },
        {
          $pull: { licenses: { _id: id } },
        }
      );
      const updatedUser = await User.findById(user._id);
      return updatedUser.licenses;
    },
  },
  {
    key: 'medicalLicenses',
    prototype: ': [MedicalLicense]',
    run: async ({}, { user }) => {
      return user.licenses;
    },
  },
];
