import mongoose from 'mongoose';
const { model, Schema } = mongoose;

const SpecialtySchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    dmAddress: {
      type: String,
      match: [/^\S+@\S+\.\S+$/, 'Email is not a valid format'],
      trim: true,
      lowercase: true,
    },
    lastFetchDate: Date,
  },
  {
    timestamps: false,
  }
);

export const Specialty = model('Specialty', SpecialtySchema);
