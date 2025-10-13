import mongoose from 'mongoose';
const { Schema } = mongoose;
import { ScheduleHourSchema } from '../../date-time';
import { ActivitySchema } from './activity';
import { MedicationSchema } from './medication';
import { QuestionMeasureSchema } from './question';
import { VitalSchema } from './vital';
import { AppointmentSchema } from './appointment';

export const MEASURE_TYPES = {
  activity: 'activity',
  medication: 'medication',
  vital: 'vital',
  diet: 'diet',
  wellness: 'wellness',
  appointment: 'appointment',
};

// const CareplanMeasureSchema = new Schema(
//   {
//     type: {
//       type: String,
//       enum: Object.values(MEASURE_TYPES),
//       required: true,
//     },
//     scheduleHours: [ScheduleHourSchema],
//   },
//   {
//     discriminatorKey: 'type',
//     _id: true,
//     timestamps: false,
//   }
// );

// CareplanMeasureSchema.discriminator(
//   MEASURE_TYPES.activity,
//   new Schema(
//     {
//       content: ActivitySchema,
//     },
//     {
//       _id: false,
//     }
//   )
// );

// CareplanMeasureSchema.discriminator(
//   MEASURE_TYPES.medication,
//   new Schema(
//     {
//       content: MedicationSchema,
//     },
//     {
//       _id: false,
//     }
//   )
// );

// CareplanMeasureSchema.discriminator(
//   MEASURE_TYPES.diet,
//   new Schema(
//     {
//       content: QuestionMeasureSchema,
//     },
//     {
//       _id: false,
//     }
//   )
// );

// CareplanMeasureSchema.discriminator(
//   MEASURE_TYPES.wellness,
//   new Schema(
//     {
//       content: QuestionMeasureSchema,
//     },
//     {
//       _id: false,
//     }
//   )
// );

// CareplanMeasureSchema.discriminator(
//   MEASURE_TYEPS.appointment,
//   new Schema(
//     {
//       content: FollowUpSchema,
//     },
//     {
//       _id: false,
//     }
//   )
// );

// CareplanMeasureSchema.discriminator(
//   MEASURE_TYPES.vital,
//   new Schema(
//     {
//       content: VitalSchema,
//     },
//     {
//       _id: false,
//     }
//   )
// );

// export default CareplanMeasureSchema;
