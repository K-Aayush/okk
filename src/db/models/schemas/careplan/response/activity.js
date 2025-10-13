import mongoose from 'mongoose';
const { Schema } = mongoose;

export default new Schema(
  {
    type: {
      type: String,
      required: true,
    },
    didTake: Boolean,
  },
  {
    _id: false,
    timestamps: false,
  }
);
