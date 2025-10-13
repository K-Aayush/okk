import mongoose from 'mongoose';
const { model, Schema } = mongoose;
import { AddressSchema } from './schemas/address';
import { ScheduleSchema } from './schemas/schedule';

const PracticeSchema = new Schema(
  {
    name: {
      type: String,
      trim: true,
      required: true,
    },
    email: {
      type: String,
      match: /^\S+@\S+\.\S+$/,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
    },
    image: {
      originalName: { type: String },
      type: { type: String },
      url: { type: String },
    },
    npi: {
      type: String,
      trim: true,
    },
    address: AddressSchema,
    isPharmacy: {
      type: Boolean,
      default: false,
    },
    directMessageDomain: {
      type: String,
      lowercase: true,
    },
    isGazuntitePractice: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const ProviderPracticeSchema = new Schema(
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
    isAdmin: {
      type: Boolean,
      default: false,
    },
    title: String,
    operationSchedule: [ScheduleSchema],
    billing: {
      time: Number,
      therapeutic: Number,
      physiologic: Number,
    },
    disableTracking: {
      type: Boolean,
      default: false,
    },
    isLicensed: {
      type: Boolean,
      default: false,
    },
    deactivated: {
      type: Boolean,
      default: false,
    },
    directMessageAddress: String,
  },
  {
    timestamps: true,
  }
);

export const Practice = model('Practice', PracticeSchema);
export const ProviderPractice = model(
  'ProviderPractice',
  ProviderPracticeSchema
);
