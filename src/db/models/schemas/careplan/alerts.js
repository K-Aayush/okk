import mongoose from 'mongoose';
const { Schema } = mongoose;

const CareplanAlertsSchema = new Schema(
  {
    user: {
      type: Schema.ObjectId,
      ref: 'User',
      required: true,
    },
    providers: [
      {
        type: Schema.ObjectId,
        ref: 'User',
      },
    ],
    careplan: {
      type: Schema.ObjectId,
      ref: 'Careplan',
    },
    measure: {
      type: String,
      required: true,
    },
    subType: {
      type: String,
      required: false,
    },
    alerts: {
      type: Object,
      required: true,
    },
    triggerTime: {
      type: Date,
      required: true,
    },
    seen: [
      {
        type: Schema.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
    _id: true,
  }
);

export default CareplanAlertsSchema;
