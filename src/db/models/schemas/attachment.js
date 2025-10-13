import mongoose from 'mongoose';
const { Schema } = mongoose;

export const AttachmentSchema = new Schema(
  {
    url: String,
    originalName: String,
    type: {
      type: String,
      enum: ['image', 'video', 'note', 'chat', 'pdf', 'directMessage'],
      default: 'image',
    },
  },
  {
    timestamps: false,
    _id: false,
  }
);
