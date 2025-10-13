import mongoose from 'mongoose';
const { model, Schema } = mongoose;

const RecordSchema = new Schema(
  {
    practice: {
      type: Schema.ObjectId,
      ref: 'Practice',
      required: true,
    },
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
    startedAt: {
      type: Date,
      required: true,
    },
    clientRecordId: String, // To link to a specific report on client side
    endedAt: {
      type: Date,
      required: true,
    },
    totalTime: {
      type: Number,
      required: true,
    },
    isManual: {
      type: Boolean,
      default: false,
    },
    description: {
      // valid only when isManual is true
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const RecordItemSchema = new Schema(
  {
    record: {
      type: Schema.ObjectId,
      ref: 'Record',
      required: true,
    },
    type: {
      type: String,
      enum: [
        'chat',
        'call',
        'note',
        'careplan',
        'orderMeds',
        'review',
        'manualAudio',
        'manualVideo',
      ],
    },
    entityId: {
      // id for chat || call || note || careplan
      type: String,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    endedAt: {
      type: Date,
      required: true,
    },
    duration: {
      // actual duration in seconds
      type: Number,
      required: true,
    },
    coordinatedProvider: {
      // Only for manual reeport record item
      type: Schema.ObjectId,
      ref: 'User',
      required: false,
    },
    deleted: {
      type: Boolean,
    },
  },
  {
    timestamps: true,
  }
);

export const Record = model('Record', RecordSchema);
export const RecordItem = model('RecordItem', RecordItemSchema);
