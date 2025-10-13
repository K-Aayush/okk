import mongoose from 'mongoose';
const { model, Schema } = mongoose;
import CareplanContentSchema from './schemas/careplan/content';
// import CareplanMeasureSchema from './schemas/careplan-measures';

// const CareplanDraftSchema = new Schema(
//   {
//     user: {
//       type: Schema.ObjectId,
//       ref: 'User',
//     },
//     patient: {
//       type: Schema.ObjectId,
//       ref: 'PracticePatient',
//     },
//     creator: {
//       type: Schema.ObjectId,
//       ref: 'PracticeProvider',
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

const CareplanSchema = new Schema(
  {
    user: {
      type: Schema.ObjectId,
      ref: 'User',
    },
    patient: {
      type: Schema.ObjectId,
      ref: 'PatientPractice',
    },
    practices: [
      {
        type: Schema.ObjectId,
        ref: 'Practice',
      },
    ],
    shares: [
      {
        type: new Schema(
          {
            by: {
              type: Schema.ObjectId,
              ref: 'ProviderPractice',
              required: true,
            },
            with: {
              type: Schema.ObjectId,
              ref: 'ProviderPractice',
              required: true,
            },
            at: {
              type: Date,
              required: true,
            },
          },
          {
            _id: false,
            timestamps: false,
          }
        ),
        required: true,
      },
    ],
    creator: {
      type: Schema.ObjectId,
      ref: 'ProviderPractice',
    },
    content: CareplanContentSchema,
    isDraft: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    duration: Number,
    startDate: Date,
    signDate: Date,
    seen: [
      {
        type: Schema.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
  }
);

const CareplanRevisionSchema = new Schema(
  {
    careplan: {
      type: Schema.ObjectId,
      ref: 'Careplan',
    },
    // measures: CareplanMeasuresSchema,
  },
  {
    timestamps: true,
  }
);

// export const CareplanDraft = model('CareplanDraft', CareplanDraftSchema);
export const Careplan = model('Careplan', CareplanSchema);
export const CareplanRevision = model(
  'CareplanRevision',
  CareplanRevisionSchema
);
