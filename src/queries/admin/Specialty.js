import { Specialty } from '../../db';

export default [
  {
    key: 'specialties',
    prototype: ': [Specialty!]',
    run: async ({}, { user }) => {
      return await Specialty.find().lean();
    },
  },
  {
    key: 'editSpecialty',
    prototype: '(id: ID, title: String!, dmAddress:String): Boolean',
    mutation: true,
    run: async ({ id, title, dmAddress }, { user }) => {
      if (id) {
        const specialty = await Specialty.findById(id);
        if (!specialty) {
          throw Error('Specialty does not exist.');
        }

        if (dmAddress?.length > 0) {
          const existingDMAddress = await Specialty.findOne({ dmAddress });
          if (existingDMAddress && existingDMAddress._id != id) {
            throw Error('DM Address already exists!');
          }
        }

        specialty.title = title;
        specialty.dmAddress = dmAddress;

        try {
          await specialty.save();
        } catch (error) {
          throw Error('Failed to edit specialty');
        }
      } else {
        if (dmAddress?.length > 0) {
          const existingDMAddress = await Specialty.findOne({ dmAddress });
          if (existingDMAddress) {
            throw Error('DM Address already exists!');
          }
        }
        try {
          await Specialty.create({
            title,
            dmAddress,
          });
        } catch (error) {
          throw Error('Failed to edit specialty');
        }
      }
      return true;
    },
  },
  {
    key: 'deleteSpecialty',
    prototype: '(id: ID!): Boolean',
    mutation: true,
    run: async ({ id }, { user }) => {
      await Specialty.deleteOne({ _id: id });
      return true;
    },
  },
];
