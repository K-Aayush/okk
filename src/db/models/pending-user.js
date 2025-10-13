import mongoose from 'mongoose';
const { model, Schema } = mongoose;

const PendingUserSchema = new Schema(
  {
    fullName: {
      type: String,
      trim: true,
      required: [true, 'Full name is required'],
    },
    email: {
      type: String,
      match: [/^\S+@\S+\.\S+$/, 'Email is not a valid format'],
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    code: {
      type: String,
    },
    role: {
      type: String,
      enum: ['provider', 'patient', 'pharmacist'],
    },
  },
  {
    timestamps: true,
  }
);

export const PendingUser = model('PendingUser', PendingUserSchema);
