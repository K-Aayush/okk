import mongoose from 'mongoose';
const { model, Schema } = mongoose;

const EFaxInboxItemSchema = new Schema(
  {
    messageId: {
      type: String,
      required: true,
    },
    from: {
      type: String,
      required: [true, 'Sender fax number is required'],
    },
    to: {
      type: String,
      required: [true, 'Recipient fax number is required'],
    },
    attachment: {
      fileName: {
        type: String,
        required: true,
      },
      contentType: {
        type: String,
      },
      fileUrl: {
        type: String,
      },
    },
    createTime: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const EFaxInboxItem = model('EFaxInbox', EFaxInboxItemSchema);
