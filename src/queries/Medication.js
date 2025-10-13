import mongoose from 'mongoose';
import DBankService from '../services/drug-bank';
import { Careplan, MedicationOrder as Order } from '../db';
import { checkDateForPeriod } from '../utils/time';
import { notifyPharmacists } from '../services/medication';
import socketManager from '../services/socket-manager';
import SOCKET_EVENTS from '../services/socket-manager/constants';

export default [
  {
    key: 'searchMedications',
    prototype: '(query: String!): [MedicationInfo]',
    isPublic: true,
    run: async ({ query }) => {
      const dbankService = new DBankService();
      const medications = await dbankService.searchMedication(query);
      return medications;
    },
  },
  {
    key: 'patientPastMedications',
    prototype: '(patient: ID!, period: String!): [MedicationInfo]',
    isPublic: true,
    run: async ({ patient: patientId, period }) => {
      const checkDate = checkDateForPeriod(period || 'all');
      const medications = {};

      const medicationCPs = await Careplan.find({
        user: patientId,
        updatedAt: { $gt: checkDate },
        isDraft: false,
        'content.medication': { $ne: null },
      })
        .sort({ signDate: -1 })
        .lean();
      medicationCPs.forEach((careplan) => {
        Object.entries(careplan.content.medication).forEach(
          ([ndc, medication]) => {
            if (!medications[ndc]) {
              medications[ndc] = medication;
            }
          }
        );
      });

      const orders = await Order.find({
        patient: patientId,
        createdAt: { $gt: checkDate },
      })
        .sort({ createdAt: -1 })
        .lean();
      orders.forEach((order) => {
        order.medications.forEach((medication) => {
          if (!medications[medication.ndc]) {
            medications[medication.ndc] = medication;
          }
        });
      });

      return Object.values(medications);
    },
  },
  {
    key: 'orderMedications',
    prototype:
      '(patient: ID!, medications: [MedicationInput!]): MedicationOrder!',
    mutation: true,
    run: async ({ patient, medications }, { user }) => {
      const session = await mongoose.startSession();
      const _id = mongoose.Types.ObjectId().toString();

      await session.withTransaction(async () => {
        const orderData = {
          _id,
          orderNumber: Math.random().toString(36).slice(2, 8),
          patient,
          provider: user._id,
          medications,
        };
        await Order.create([orderData], {
          session,
        });

        // TODO: implement automatic contact between the pharmacy and patient
      });
      session.endSession();

      notifyPharmacists();
      socketManager.notifyPractice(
        user.activeProviderPractice.practice?._id ||
          user.activeProviderPractice.practice,
        SOCKET_EVENTS.PATIENT_MEDICATION_ORDERS,
        { patient: patient }
      );
      socketManager.sendMessage(
        patient,
        SOCKET_EVENTS.PATIENT_MEDICATION_ORDERS,
        {}
      );

      const order = await Order.findById(_id)
        .populate(['patient'])
        .populate({
          path: 'provider',
          populate: {
            path: 'activeProviderPractice',
            populate: {
              path: 'practice',
              model: 'Practice',
            },
          },
        })
        .lean();
      return order;
    },
  },
  {
    key: 'patientMedicationOrders',
    prototype: '(patient:ID, period: String): [MedicationOrder!]',
    run: async ({ patient, period }, { user }) => {
      const patientId = user.role === 'patient' ? user._id : patient;
      const checkDate = checkDateForPeriod(period || 'all');
      const conditions = { patient: patientId };
      if (period !== 'all') {
        conditions.createdAt = { $gt: checkDate };
      }
      return await Order.find(conditions)
        .sort({ createdAt: -1 })
        .populate(['patient'])
        .populate({
          path: 'provider',
          populate: {
            path: 'activeProviderPractice',
            populate: {
              path: 'practice',
              model: 'Practice',
            },
          },
        })
        .lean();
    },
  },
  {
    key: 'providerMedicationOrders',
    prototype: '(period: String): [MedicationOrder!]',
    run: async ({ patient, period }, { user }) => {
      const checkDate = checkDateForPeriod(period || 'all');
      const conditions = { provider: user._id };
      if (period !== 'all') {
        conditions.createdAt = { $gt: checkDate };
      }
      return await Order.find(conditions)
        .sort({ createdAt: -1 })
        .populate(['patient'])
        .populate({
          path: 'provider',
          populate: {
            path: 'activeProviderPractice',
            populate: {
              path: 'practice',
              model: 'Practice',
            },
          },
        })
        .lean();
    },
  },
  {
    key: 'medicationOrder',
    prototype: '(id:ID): MedicationOrder!',
    run: async ({ id }, { user }) => {
      const conditions = { _id: id };
      if (user.role === 'patient') {
        conditions.patient = user._id;
      }
      return await Order.findOne(conditions)
        .populate(['patient'])
        .populate({
          path: 'provider',
          populate: {
            path: 'activeProviderPractice',
            populate: {
              path: 'practice',
              model: 'Practice',
            },
          },
        })
        .lean();
    },
  },
];
