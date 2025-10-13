import mongoose from 'mongoose';
const { Schema } = mongoose;

export const MedicationSchema = new Schema(
  {
    ndc: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    dosageForm: String,
    route: String,
    strength: {
      type: {
        unit: String,
        value: String,
      },
      required: false,
    },
    frequency: Object,
    alerts: Object,
    mods: Object,
  },
  {
    _id: false,
    timestamps: false,
  }
);

export const MedicationOrderItemSchema = new Schema(
  {
    ndc: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    dosageForm: String,
    route: String,
    strength: {
      type: {
        unit: String,
        value: String,
      },
      required: false,
    },
    frequency: Object,
    alerts: Object,
    mods: Object,
    quantity: Number,
    status: {
      type: String,
      enum: ['active', 'removed'],
      default: 'active',
    },
    caryRXPrescription: Object,
  },
  {
    _id: false,
    timestamps: false,
  }
);

export const MedicationOrderSchema = new Schema(
  {
    provider: {
      type: Schema.ObjectId,
      ref: 'User',
      required: true,
    },
    patient: {
      type: Schema.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['placed', 'sent', 'shipped', 'received', 'failed', 'rejected'],
      default: 'placed',
    },
    tracking: String,
    orderNumber: String,
    medications: [MedicationOrderItemSchema],
    caryRXOrder: Object,
  },
  {
    _id: true,
    timestamps: true,
  }
);

export const MedicationHistorySchema = new Schema(
  {
    medication: {
      type: MedicationSchema,
      required: true,
    },
    lastOrderedAt: Date,
    updatedAt: Date,
  },
  {
    timestamps: false,
    _id: false,
  }
);
