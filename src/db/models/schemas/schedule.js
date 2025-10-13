import mongoose from 'mongoose';
const { Schema } = mongoose;

export const ScheduleSchema = new Schema(
  {
    days: {
      type: [Number],
      required: true,
    },
    from: {
      type: String,
      required: true,
    },
    to: {
      type: String,
      required: true,
    },
    duration: {
      type: Number,
      required: true,
    },
    breakOn: {
      type: Boolean,
      default: false,
      required: true,
    },
    breaks: [
      {
        from: {
          type: String,
          required: true,
        },
        to: {
          type: String,
          required: true,
        },
      },
    ],
  },
  {
    _id: false,
    timestamps: false,
  }
);
