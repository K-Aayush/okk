import mongoose from 'mongoose';
const { model, Schema } = mongoose;

const CallSchema = new Schema(
  {
    attendees: [
      new Schema(
        {
          user: {
            type: Schema.ObjectId,
            ref: 'User',
            required: true,
          },
          phone: String,
          token: String,
          status: {
            type: String,
            enum: ['pending', 'connected', 'dropped'],
          },
        },
        {
          _id: false,
        }
      ),
    ],
    startTime: {
      type: Date,
      required: false,
    },
    endTime: {
      type: Date,
      required: false,
    },
    status: {
      type: String,
      enum: ['scheduled', 'active', 'completed', 'cancelled', 'rescheduled'],
      default: 'scheduled',
    },
    callType: {
      type: String,
      enum: ['scheduled', 'unscheduled'],
    },
    isPSTN: {
      type: Boolean,
      default: false,
    },
    referredPatient: {
      type: Schema.ObjectId,
      ref: 'User',
      required: false,
    },
    appointment: {
      type: Schema.ObjectId,
      ref: 'Appointment',
      required: false,
    },
    pstnInfo: {
      sid: String,
      phoneType: {
        type: String,
        enum: ['mobile', 'work', 'home'],
        default: 'mobile',
      },
      number: String,
    },
  },
  {
    timestamps: true,
  }
);

export const Call = model('Call', CallSchema);
