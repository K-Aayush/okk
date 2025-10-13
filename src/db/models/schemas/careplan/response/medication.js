import mongoose from 'mongoose';
const { Schema } = mongoose;

export default new Schema(
  {
    didTake: Boolean,
  },
  {
    _id: false,
    timestamps: false,
  }
);
