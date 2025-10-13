import mongoose from 'mongoose';
const { Schema } = mongoose;
import { MEASURE_TYPES } from '../measure';
import ActivityResponseSchema from './activity';
import MedicationResponseSchema from './medication';
import DietResponseSchema from './diet';
import WellnessResponseSchema from './wellness';
import VitalResponseSchema from './vital';
import AppointmentResponseSchema from './appointment';

const CareplanMeasureResponseSchema = new Schema(
  {
    measure: {
      type: String,
      enum: Object.values(MEASURE_TYPES),
      required: true,
    },
    time: {
      type: Date,
      required: true,
    },
    isPositive: {
      type: Boolean,
      required: false,
    },
    alertsTriggered: {
      type: Boolean,
      required: false,
    },
    addedTime: Date,
  },
  {
    discriminatorKey: 'measure',
    _id: false,
    timestamps: false,
  }
);

export const CareplanResponseSchema = new Schema({
  careplan: {
    type: Schema.ObjectId,
    ref: 'Careplan',
    required: true,
  },
  user: {
    type: Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  patient: {
    type: Schema.ObjectId,
    ref: 'PatientPractice',
  },
  date: {
    type: Date,
    required: true,
  },
  responses: {
    type: [CareplanMeasureResponseSchema],
    required: false,
  },
});

CareplanResponseSchema.path('responses').discriminator(
  MEASURE_TYPES.activity,
  new Schema(
    {
      response: {
        type: ActivityResponseSchema,

        required: false,
      },
    },
    {
      _id: false,
    }
  )
);

CareplanResponseSchema.path('responses').discriminator(
  MEASURE_TYPES.medication,
  new Schema(
    {
      response: {
        type: MedicationResponseSchema,
        required: false,
      },
    },
    {
      _id: false,
    }
  )
);

CareplanResponseSchema.path('responses').discriminator(
  MEASURE_TYPES.diet,
  new Schema(
    {
      response: {
        type: DietResponseSchema,
        required: false,
      },
    },
    {
      _id: false,
    }
  )
);

CareplanResponseSchema.path('responses').discriminator(
  MEASURE_TYPES.wellness,
  new Schema(
    {
      response: {
        type: WellnessResponseSchema,
        required: false,
      },
    },
    {
      _id: false,
    }
  )
);

CareplanResponseSchema.path('responses').discriminator(
  MEASURE_TYPES.followUp,
  new Schema(
    {
      response: {
        type: AppointmentResponseSchema,
        required: false,
      },
    },
    {
      _id: false,
    }
  )
);

CareplanResponseSchema.path('responses').discriminator(
  MEASURE_TYPES.vital,
  new Schema(
    {
      response: {
        type: VitalResponseSchema,
        required: false,
      },
    },
    {
      _id: false,
    }
  )
);

export default CareplanResponseSchema;
