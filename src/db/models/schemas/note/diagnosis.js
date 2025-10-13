import mongoose from 'mongoose';
const { Schema } = mongoose;

export default new Schema(
  {
    code: String,
    description: String,
    category: String,
  },
  {
    _id: false,
    timestamps: false,
  }
);
