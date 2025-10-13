import mongoose from 'mongoose';
const { model, Schema } = mongoose;

// provider-provider or patient-patient contact
const ContactSchema = new Schema(
  {
    user1: {
      type: Schema.ObjectId,
      ref: 'User',
    },
    user2: {
      type: Schema.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

export const Contact = model('Contact', ContactSchema);
