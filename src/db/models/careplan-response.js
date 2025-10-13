import mongoose from 'mongoose';
const { model } = mongoose;
import CareplanResponseSchema from './schemas/careplan/response';

export const CareplanResponse = model(
  'CareplanResponse',
  CareplanResponseSchema
);
