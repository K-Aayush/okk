import mongoose from 'mongoose';
const { Schema } = mongoose;

export const AddressSchema = new Schema(
  {
    addressLine1: {
      type: String,
    },
    addressLine2: {
      type: String,
    },
    city: {
      type: String,
    },
    state: {
      type: String,
    },
    stateCode: {
      type: String,
    },
    country: {
      type: String,
    },
    countryCode: {
      type: String,
    },
    zipcode: {
      type: String,
    },
  },
  {
    timestamps: false,
    _id: false,
  }
);
