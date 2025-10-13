import mongoose from 'mongoose';
const { Schema } = mongoose;

export const ActivitySchema = new Schema(
  {
    type: {
      type: String,
      required: true,
    },
    reps: {
      type: Number,
      required: true,
    },
    duration: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: false,
    _id: false,
  }
);
