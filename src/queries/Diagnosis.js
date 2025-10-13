import { Diagnosis, Note } from '../db';
import { checkDateForPeriod } from '../utils/time';

export default [
  {
    key: 'diagnoses',
    prototype: '(query: String, page: Int, pageSize: Int): [Diagnosis]',
    run: async ({ query, page = 0, pageSize = 10 }) => {
      const documents = await Diagnosis.find(
        { $text: { $search: query } },
        { score: { $meta: 'textScore' } },
        { skip: page * pageSize, limit: pageSize }
      ).sort({ score: { $meta: 'textScore' } });
      return documents;
    },
  },
  {
    key: 'patientDiagnoses',
    prototype: '(patient: ID, period: String): [Diagnosis]',
    run: async ({ patient, period }, { user }) => {
      const userId = user.role === 'patient' ? user._id : patient;
      const checkDate = checkDateForPeriod(period || 'all');
      const conditions = {
        user: userId,
        isDraft: false,
        'content.diagnosis': { $exists: true, $ne: null, $not: { $size: 0 } },
      };
      if (period !== 'all') {
        conditions.updatedAt = { $gt: checkDate };
      }
      const notes = await Note.find(conditions).sort({ signDate: -1 }).lean();
      if (!notes) {
        return [];
      }
      let diagnoses = [];

      notes.forEach((note) => {
        if (note.content.diagnosis) {
          const diagnosesWithDate = note.content.diagnosis.map((diagnosis) => {
            return { ...diagnosis, date: note.signDate };
          });
          diagnoses = [...diagnoses, ...diagnosesWithDate];
        }
      });

      return diagnoses;
    },
  },
];
