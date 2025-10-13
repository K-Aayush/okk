import mongoose from 'mongoose';
const { Schema } = mongoose;

export const MedicationSchema = new Schema(
  {},
  {
    timestamps: false,
    _id: false,
  }
);
