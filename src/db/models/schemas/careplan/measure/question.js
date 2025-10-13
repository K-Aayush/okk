import mongoose from 'mongoose';
const { Schema } = mongoose;

export const QUESTION_TYPES = {
  lowHigh: 'lowHigh',
  badGood: 'badGood',
  goodBad: 'goodBad',
};

export const QuestionMeasureSchema = new Schema(
  {
    type: {
      type: String,
      enum: Object.values(QUESTION_TYPES),
      required: true,
    },
    value: String,
  },
  {
    timestamps: false,
    _id: false,
  }
);
