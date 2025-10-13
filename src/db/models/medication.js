import mongoose from 'mongoose';
const { model } = mongoose;
import { MedicationOrderSchema } from './schemas/medication';

export const MedicationOrder = model('MedicationOrder', MedicationOrderSchema);
