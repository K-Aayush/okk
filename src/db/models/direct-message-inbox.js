import mongoose from 'mongoose';
const { model, Schema } = mongoose;

const DirectMessageInboxItemSchema = new Schema(
  {
    messageId: {
      type: String,
      required: true,
    },
    from: {
      type: String,
      match: [/^\S+@\S+\.\S+$/, 'From email address is not a valid format'],
      required: [true, 'From email is required'],
      trim: true,
      lowercase: true,
    },
    to: [
      {
        type: String,
        match: [/^\S+@\S+\.\S+$/, 'To email address is not a valid format'],
        required: [true, 'To email is required'],
        trim: true,
        lowercase: true,
      },
    ],
    body: {
      type: String,
    },
    attachment: {
      fileName: {
        type: String,
        required: true,
      },
      contentType: {
        type: String,
      },
      fileUrl: {
        type: String,
      },
    },
    specialty: String,
    patientInfo: {
      id: String,
      name: String,
      dob: String,
    },
    subject: {
      type: String,
      required: true,
    },
    createTime: {
      type: Date,
      required: true,
    },
    practice: {
      type: Schema.ObjectId,
      ref: 'Practice',
    },
    sender: {
      type: Schema.ObjectId,
      ref: 'User',
    },
    note: {
      type: Schema.ObjectId,
      ref: 'Note',
    },
  },
  {
    timestamps: true,
  }
);

export const DirectMessageInboxItem = model(
  'DirectMessageInbox',
  DirectMessageInboxItemSchema
);
