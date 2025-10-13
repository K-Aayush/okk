import mongoose from 'mongoose';
const { Schema } = mongoose;

export const PatientProgressSchema = new Schema(
  {
    activity: Object,
    medication: Object,
    vital: Object,
    wellness: Object,
    diet: Object,
    appointment: Object,
  },
  {
    timestamps: true,
    _id: false,
  }
);
