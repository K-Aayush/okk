import mongoose from 'mongoose';
const { model } = mongoose;
import CareplanAlertsSchema from './schemas/careplan/alerts';

export const CareplanAlerts = model('CareplanAlerts', CareplanAlertsSchema);
