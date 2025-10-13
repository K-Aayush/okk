import mongoose from 'mongoose';
const { model, Schema } = mongoose;

export const DEVICE_TYPES = {
  bpm: 'bpm',
  heartRate: 'heartRate',
  scale: 'scale',
};

const DeviceSchema = new Schema(
  {
    user: {
      type: Schema.ObjectId,
      ref: 'User',
      required: true,
    },
    deviceId: {
      type: String,
      required: true,
    },
    deviceType: {
      type: String,
      enum: Object.values(DEVICE_TYPES),
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Device = model('Device', DeviceSchema);

const DevicePayloadSchema = new Schema({
  deviceId: String,
  deviceType: String,
  payload: Object,
});

export const DevicePayload = model('DevicePayload', DevicePayloadSchema);
