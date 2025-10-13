import mongoose from 'mongoose';
const { model, Schema } = mongoose;

import DiagnosisSchema from './schemas/note/diagnosis';

const NoteContentSchema = new Schema(
  {
    subjective: String,
    objective: {
      heartRate: Number,
      glucose: Number,
      weight: Number,
      bloodPressure: Number,
      bloodPressure2: Number,
      bloodOxygen: Number,
      respiratory: Number,
      temperature: Number,
    },
    assessment: String,
    plan: String,
    diagnosis: [DiagnosisSchema],
    attachments: [
      new Schema(
        {
          category: {
            type: String,
            enum: ['chat', 'image', 'video', 'pdf', 'note', 'directMessage'],
          },
          originalName: String,
          type: String,
          url: String,
          createdAt: Date,

          // These are valid only when category is 'chat'
          chatId: Schema.ObjectId,
          messageIds: [Schema.ObjectId],
          // Note attachment
          note: {
            type: Schema.ObjectId,
            ref: 'Note',
          },
          directMessage: {
            type: Schema.ObjectId,
            ref: 'DirectMessageInbox',
          },
        },
        { _id: false }
      ),
    ],
  },
  {
    _id: false,
  }
);

const NoteSchema = new Schema(
  {
    user: {
      type: Schema.ObjectId,
      ref: 'User',
    },
    patient: {
      type: Schema.ObjectId,
      ref: 'PatientPractice',
    },
    creator: {
      type: Schema.ObjectId,
      ref: 'ProviderPractice',
    },
    practices: [
      {
        type: Schema.ObjectId,
        ref: 'Practice',
      },
    ],
    shares: [
      {
        type: new Schema(
          {
            by: {
              type: Schema.ObjectId,
              ref: 'ProviderPractice',
              required: true,
            },
            with: {
              type: Schema.ObjectId,
              ref: 'ProviderPractice',
              required: true,
            },
            at: {
              type: Date,
              required: true,
            },
          },
          {
            _id: false,
            timestamps: false,
          }
        ),
        required: true,
      },
    ],
    content: NoteContentSchema,
    isDraft: {
      type: Boolean,
      default: true,
    },
    signDate: {
      type: Date,
      required: false,
    },
    seen: [
      {
        type: Schema.ObjectId,
        ref: 'User',
      },
    ],
    directMessage: {
      type: Schema.ObjectId,
      ref: 'DirectMessageInbox',
    },
    directMessageShare: [
      {
        to: { type: Schema.ObjectId, ref: 'ProviderPractice' },
        sharedAt: Date,
      },
    ],
    signature: String,
  },
  {
    timestamps: true,
  }
);

export const Note = model('Note', NoteSchema);
