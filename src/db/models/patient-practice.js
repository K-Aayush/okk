import mongoose from 'mongoose';
const { model, Schema } = mongoose;
import { MedicationHistorySchema } from './schemas/medication';
import { PatientProgressSchema } from './schemas/careplan/progress';

const PatientPracticeSchema = new Schema(
  {
    practice: {
      type: Schema.ObjectId,
      ref: 'Practice',
      required: true,
    },
    user: {
      type: Schema.ObjectId,
      ref: 'User',
      required: true,
    },
    medications: {
      type: [MedicationHistorySchema],
      required: false,
    },
    progress: {
      type: PatientProgressSchema,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

export const PatientPractice = model('PatientPractice', PatientPracticeSchema);
