import mongoose from 'mongoose';
const { Schema } = mongoose;
import { WELLNESS_TYPES } from '../measure/wellness';

const WellnessResponseSchema = new Schema(
  {
    type: {
      type: String,
      enum: Object.keys(WELLNESS_TYPES),
      required: true,
    },
    value: Number,
  },
  {
    _id: false,
    timestamps: false,
  }
);

export default WellnessResponseSchema;
