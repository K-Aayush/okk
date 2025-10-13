import mongoose from 'mongoose';
const { Schema } = mongoose;

export const AppointmentSchema = new Schema(
  {
    scheduleTime: {
      type: Date,
      required: true,
    },
    providers: [
      {
        _id: false,
        field: {
          type: Schema.ObjectId,
          ref: 'PracticeProvider',
        },
      },
    ],
    reason: String,
  },
  {
    timestamps: false,
    _id: false,
  }
);
