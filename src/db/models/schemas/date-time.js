import mongoose from 'mongoose';
const { Schema } = mongoose;

export const ScheduleHourSchema = new Schema(
  {
    value: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Number,
      required: true,
    },
    nextScheduleTime: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: false,
    _id: false,
  }
);

export const ScheduleDateSchema = new Schema(
  {
    value: {
      type: String,
      required: true,
    },
    scheduleDate: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: false,
    _id: false,
  }
);
