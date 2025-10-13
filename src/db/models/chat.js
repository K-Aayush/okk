import mongoose from 'mongoose';
import { AttachmentSchema } from './schemas/attachment';
const { model, Schema } = mongoose;

const ChatSchema = new Schema(
  {
    members: [
      {
        type: Schema.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    group: {
      type: String,
      required: false,
    },
    referredPatient: {
      type: Schema.ObjectId,
      ref: 'User',
      required: false,
    },
    lastChatMessage: {
      type: Schema.ObjectId,
      ref: 'ChatMessage',
    },
  },
  {
    timestamps: true,
  }
);

const ChatMemberSchema = new Schema(
  {
    chat: {
      type: Schema.ObjectId,
      ref: 'Chat',
      required: true,
    },
    member: {
      type: Schema.ObjectId,
      ref: 'User',
      required: true,
    },
    lastReadAt: Date,
  },
  {
    timestamps: true,
  }
);

const ChatMessageSchema = new Schema(
  {
    chat: {
      type: Schema.ObjectId,
      ref: 'Chat',
      required: true,
    },
    sender: {
      type: Schema.ObjectId,
      ref: 'User',
      required: true,
    },
    text: {
      type: String,
    },
    attachment: AttachmentSchema,
    note: {
      type: Schema.ObjectId,
      ref: 'Note',
    },
    careplan: {
      type: Schema.ObjectId,
      ref: 'Careplan',
    },
  },
  {
    timestamps: true,
  }
);
ChatMessageSchema.index({ createdAt: 1 });

ChatMessageSchema.pre('save', function (next) {
  this.wasNew = this.isNew;
  next();
});

ChatMessageSchema.post('save', async function () {
  if (this.wasNew) {
    await Chat.findByIdAndUpdate(this.chat, {
      lastChatMessage: this._id,
    });
  }
});

export const Chat = model('Chat', ChatSchema);
export const ChatMessage = model('ChatMessage', ChatMessageSchema);
export const ChatMember = model('ChatMember', ChatMemberSchema);
