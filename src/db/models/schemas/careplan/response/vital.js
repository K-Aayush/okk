import mongoose from 'mongoose';
const { Schema } = mongoose;
import { VITAL_TYPES } from '../measure/vital';

export default new Schema(
  {
    type: {
      type: String,
      enum: Object.keys(VITAL_TYPES),
      required: true,
    },
    value: Number,
    value2: Number,
  },
  {
    _id: false,
    timestamps: false,
  }
);
