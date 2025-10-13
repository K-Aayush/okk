import mongoose from 'mongoose';
const { model, Schema } = mongoose;

const AppointmentSchema = new Schema(
  {
    creator: {
      type: Schema.ObjectId,
      ref: 'User',
      required: true,
    },
    providers: [
      {
        type: Schema.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    patient: {
      type: Schema.ObjectId,
      ref: 'User',
      required: true,
    },
    time: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['scheduled', 'active', 'completed', 'cancelled', 'rescheduled'],
      default: 'scheduled',
    },
    reason: String,
    attachments: [
      {
        uri: String,
      },
    ],
    accessTokens: [
      {
        user: {
          type: Schema.ObjectId,
          ref: 'User',
          required: true,
        },
        token: {
          type: String,
          required: true,
        },
      },
    ],
    questions: [
      {
        question: {
          type: Schema.ObjectId,
          ref: 'AppointmentQuestion',
        },
        answered: {
          type: Boolean,
          default: false,
        },
      },
    ],
    joined: [Schema.ObjectId],
  },
  {
    timestamps: true,
  }
);

const AppointmentQuestionSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    answerType: {
      type: String,
      enum: ['Simple', 'Text', 'Slider'],
    },
  },
  {
    timestamps: true,
  }
);

export const Appointment = model('Appointment', AppointmentSchema);
export const AppointmentQuestion = model(
  'AppointmentQuestion',
  AppointmentQuestionSchema
);
