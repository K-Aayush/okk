import mongoose from 'mongoose';
const { Schema } = mongoose;

export const VITAL_TYPES = {
  heartRate: 'heartRate',
  bloodPressure: 'bloodPressure',
  weight: 'weight',
  glucose: 'glucose',
  respiratory: 'respiratory',
  bloodOxygen: 'bloodOxygen',
  temperature: 'temperature',
};

export const VitalSchema = new Schema(
  {
    type: {
      type: String,
      enum: Object.keys(VITAL_TYPES),
      required: true,
    },
    minValue: {
      type: Number,
      required: true,
    },
    maxValue: {
      type: Number,
      required: false,
    },
  },
  {
    timestamps: false,
    _id: false,
  }
);
