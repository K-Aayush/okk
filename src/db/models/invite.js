import mongoose from 'mongoose';
const { model, Schema } = mongoose;

const InviteSchema = new Schema(
  {
    // for group join
    group: {
      type: Schema.ObjectId,
      ref: 'Group',
    },
    // for practice join
    practice: {
      type: Schema.ObjectId,
      ref: 'Practice',
    },
    inviter: {
      type: Schema.ObjectId,
      ref: 'User',
    },
    // if invitee is missing, it's a join request
    invitee: {
      type: Schema.ObjectId,
      ref: 'User',
    },
    // active: {
    //   type: Boolean,
    //   default: true,
    // },
    // inactiveReason: {
    //   type: String,
    //   // overwritten = no longer valid
    //   // because another invite has already been accepted
    //   // e.g, practice/group join overwrites invitations to existing members
    //   // a patient making contact with a provider overwrites invitations to the practice's members
    //   enum: ['accepted', 'declined', 'cancelled', 'overwritten'],
    // },
  },
  {
    timestamps: true,
  }
);

export const Invite = model('Invite', InviteSchema);
