import mongoose from 'mongoose';
const { model, Schema } = mongoose;

// Sub-schema for CCDA snapshot data
const CCDASnapshotSchema = new Schema(
  {
    reasonForReferral: {
      code: String,
      display: String,
      system: String,
    },
    problems: [
      {
        code: String,
        display: String,
        system: String,
        onsetDate: String,
      },
    ],
    procedures: [
      {
        code: String,
        display: String,
        system: String,
        date: String,
      },
    ],
    medications: [
      {
        code: String,
        display: String,
        dosage: String,
        startDate: String,
      },
    ],
    allergies: [
      {
        code: String,
        display: String,
        reaction: String,
        severity: String,
      },
    ],
    // Can be expanded based on specialty preferences
    customSections: [
      {
        sectionName: String,
        code: String,
        display: String,
        value: String,
      },
    ],
  },
  { _id: false }
);

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
    ccda: {
      rawXml: {
        type: String,
      },
      parsedData: {
        type: Schema.Types.Mixed,
      },
      version: {
        type: String,
      },
      snapshot: CCDASnapshotSchema,
      additionalFiles: [
        {
          fileName: String,
          fileUrl: String,
          contentType: String,
        },
      ],
      parseStatus: {
        type: String,
        enum: ['pending', 'success', 'failed'],
        default: 'pending',
      },
      parseError: String,
      parsedAt: Date,
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

// Index for efficient CCDA queries
DirectMessageInboxItemSchema.index({ 'ccda.parseStatus': 1 });
DirectMessageInboxItemSchema.index({ 'ccda.version': 1 });

export const DirectMessageInboxItem = model(
  'DirectMessageInbox',
  DirectMessageInboxItemSchema
);
