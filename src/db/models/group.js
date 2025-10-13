import mongoose from 'mongoose';
const { model, Schema } = mongoose;

const GroupSchema = new Schema(
  {
    createdBy: {
      type: Schema.ObjectId,
      ref: 'User',
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    image: {
      originalName: { type: String },
      type: { type: String },
      url: { type: String },
    },
  },
  {
    timestamps: true,
  }
);

const GroupUserSchema = new Schema(
  {
    group: {
      type: Schema.ObjectId,
      ref: 'Group',
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
  },
  {
    timestamps: true,
  }
);

export const Group = model('Group', GroupSchema);
export const GroupUser = model('GroupUser', GroupUserSchema);
