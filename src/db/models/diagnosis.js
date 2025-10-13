import mongoose from 'mongoose';
const { model, Schema } = mongoose;

const DiagnosisSchema = new Schema(
  {
    code: String,
    description: String,
    category: String,
  },
  {
    timestamps: false,
    collection: 'diagnoses',
  }
);
DiagnosisSchema.index({ code: 'text', description: 'text' });

export const Diagnosis = model('Diagnosis', DiagnosisSchema);
