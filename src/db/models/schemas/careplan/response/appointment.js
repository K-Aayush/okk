import mongoose from 'mongoose';
const { Schema } = mongoose;

export default new Schema(
  {
    didAttend: Boolean,
  },
  {
    timestamps: false,
    _id: false,
  }
);
