import mongoose from 'mongoose';
const { Schema } = mongoose;
import { DIET_TYPES } from '../measure/diet';

const DietResponseSchema = new Schema(
  {
    type: {
      type: String,
      enum: Object.keys(DIET_TYPES),
      required: true,
    },
    value: Number,
  },
  {
    _id: false,
    timestamps: false,
  }
);

export default DietResponseSchema;
