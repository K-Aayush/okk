import mongoose from 'mongoose';
const { model, Schema } = mongoose;

import { AddressSchema } from './schemas/address';
import { ProviderPractice } from './practice';

const MEMBER_DESIGNATIONS = [
  'doctor',
  'do',
  'nursePractioner',
  'pa',
  'crna',
  'rn',
  'pharmacist',
  'other',
];

const UserSchema = new Schema(
  {
    firstName: {
      type: String,
      trim: true,
      required: [true, 'First name is required'],
    },
    lastName: {
      type: String,
      trim: true,
      required: [true, 'Last name is required'],
    },
    middleName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      match: [/^\S+@\S+\.\S+$/, 'Email is not a valid format'],
      // required: [true, 'Email is required'],
      // unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      minlength: [8, 'Password should be at least 8 characters or more'],
      trim: true,
    },
    pin: {
      type: String,
      length: 4,
    },
    role: {
      type: String,
      required: true,
      enum: ['provider', 'patient'],
      default: 'provider',
    },
    npi: {
      type: String,
      trim: true,
    },
    address: {
      type: AddressSchema,
      required: false,
    },
    phones: {
      mobile: {
        type: String,
        trim: true,
      },
      home: {
        type: String,
        trim: true,
      },
      work: {
        type: String,
        trim: true,
      },
      preference: {
        type: String,
        required: false,
        enum: ['mobile', 'home', 'work'],
        default: 'mobile',
      },
      masking: {
        type: String,
        enum: ['mobile', 'home', 'work', null],
        required: false,
      },
    },
    photo: {
      originalName: { type: String },
      type: { type: String },
      url: { type: String },
    },
    signatureImage: String,
    timezoneOffset: {
      type: Number,
    },
    timezone: String,
    status: {
      type: String,
      enum: ['new', 'onboarded'],
      default: 'new',
    },

    // provider-specific
    activeProviderPractice: {
      type: Schema.ObjectId,
      ref: 'ProviderPractice',
    },
    memberDesignation: {
      type: String,
      enum: MEMBER_DESIGNATIONS,
    },

    athenaId: { type: String },
    ssn: { type: String },
    dob: { type: String },
    gender: { type: String },
    maritalStatus: { type: String },
    bpmIMEI: { type: String },
    scaleIMEI: { type: String },
    insurances: [
      {
        company: String,
        card: Schema.Types.Mixed,
        id: String,
        groupNumber: String,
      },
    ],
    licenses: [
      {
        stateCode: {
          type: String,
          required: true,
        },
        fileUrl: {
          type: String,
          required: false,
        },
        licenseNumber: {
          type: String,
          required: true,
        },
        expiredAt: {
          type: Date,
          required: true,
        },
        status: {
          type: String,
          enum: ['Checking', 'Valid', 'Expired', 'Invalid'],
        },
      },
    ],
    specialty: String,
    notifications: {
      type: Object,
      default: {
        email: { email: true },
        text: { mobile: true },
        voice: { mobile: true },
      },
    },
    recentPatients: [{ type: String }],
    caryrx: {
      id: String,
      locationId: String,
      paymentsId: String,
    },
    paymentMethods: [
      {
        cardType: String,
        last4Digits: String,
        isDefault: Boolean,
      },
    ],
    resetPasswordToken: String,
  },
  {
    timestamps: true,
  }
);

const licenseHook = async (document, next) => {
  const doc = await User.findById(document._id);
  if (doc?.role === 'provider' && doc?.licenses) {
    const licensedStates = [];
    const now = new Date().getTime();
    for (let license of doc.licenses) {
      if (
        !license.expiredAt ||
        license.status !== 'Valid' ||
        !license.stateCode
      ) {
        continue;
      }
      if (now < license.expiredAt.getTime()) {
        licensedStates.push(license.stateCode.toLowerCase());
      }
    }
    const providerPractices = await ProviderPractice.find({
      user: doc._id,
    }).populate('practice');
    if (providerPractices) {
      for (let practice of providerPractices) {
        if (
          licensedStates.includes(practice.practice.address.state.toLowerCase())
        ) {
          practice.isLicensed = true;
          await practice.save();
        } else {
          practice.isLicensed = false;
          await practice.save();
        }
      }
    }
  }
  next();
};

UserSchema.post('save', licenseHook);
UserSchema.post('update', licenseHook);
UserSchema.post('updateOne', licenseHook);
UserSchema.post('findOneAndUpdate', licenseHook);

export const User = model('User', UserSchema);

const AdminUserSchema = new Schema(
  {
    email: {
      type: String,
      match: [/^\S+@\S+\.\S+$/, 'Email is not a valid format'],
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      minlength: [8, 'Password should be at least 8 characters or more'],
      trim: true,
    },
    firstName: String,
    lastName: String,
  },
  {
    timestamps: true,
  }
);

export const AdminUser = model('AdminUser', AdminUserSchema);
