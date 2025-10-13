import mongoose from 'mongoose';
const { Schema } = mongoose;

export default new Schema(
  {
    activity: Object,
    medication: Object,
    vital: Object,
    wellness: Object,
    diet: Object,
    careTeam: [
      new Schema(
        {
          user: {
            type: Schema.ObjectId,
            ref: 'User',
          },
          appointments: [
            {
              time: Date,
            },
          ],
          alerts: Object,
        },
        { _id: false, timestamps: false }
      ),
    ],
  },
  {
    timestamps: false,
    _id: false,
  }
);
