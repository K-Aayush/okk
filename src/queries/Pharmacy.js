import mongoose from 'mongoose';
import { MedicationOrder as Order } from '../db';
import { checkDateForPeriod } from '../utils/time';
import { notifyPharmacists } from '../services/medication';
import socketManager from '../services/socket-manager';
import SOCKET_EVENTS from '../services/socket-manager/constants';

export default [
  {
    key: 'pharmacySummary',
    prototype: '(patient: ID): PharmacySummary',
    run: async ({ patient }, { user }) => {
      if (!(user?.memberDesignation === 'pharmacist')) {
        return null;
      }
      const conditions = patient ? { patient } : {};
      const orderCount = await Order.count(
        Object.assign(conditions, { status: 'placed' })
      );
      const processingCount = await Order.count(
        Object.assign(conditions, { status: 'sent' })
      );
      const statusCount = await Order.count(
        Object.assign(conditions, {
          status: { $in: ['received', 'shipped'] },
        })
      );
      return {
        orders: orderCount,
        processing: processingCount,
        status: statusCount,
      };
    },
  },
  {
    key: 'pharmacyOrders',
    prototype: '(period: String, patient: ID): [MedicationOrder!]',
    run: async ({ period, patient }, { user }) => {
      if (user.memberDesignation !== 'pharmacist') {
        return null;
      }
      const checkDate = checkDateForPeriod(period);
      const conditions = {};
      if (patient) {
        conditions.patient = patient;
      }
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
    key: 'processOrder',
    prototype: '(order: ID!, status: String!, tracking: String): Boolean',
    mutation: true,
    run: async ({ order: orderId, status, tracking }, { user }) => {
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error('Order not found');
      }
      if (user.memberDesignation !== 'pharmacist') {
        throw new Error('Invalid user');
      }
      const updateData = { status };
      if (status === 'shipped') {
        updateData.tracking = tracking;
      }

      const session = await mongoose.startSession();
      await session.withTransaction(async () => {
        await Order.findOneAndUpdate(
          {
            _id: orderId,
          },
          updateData,
          {
            session,
          }
        );
      });

      socketManager.sendMessage(
        order.provider,
        SOCKET_EVENTS.MEDICATION_ORDERS
      );
      socketManager.sendMessage(order.patient, SOCKET_EVENTS.MEDICATION_ORDERS);
      notifyPharmacists();

      session.endSession();
      return true;
    },

    // ==== CaryRX Order process ===
    // {
    //   key: 'processOrder',
    //   prototype: '(order: ID!, status: String!, tracking: String): Boolean',
    //   mutation: true,
    //   run: async ({ order: orderId, status, tracking }, { user }) => {
    //     const order = await Order.findById(orderId).populate('patient');
    //     if (!order) {
    //       throw new Error('Order not found');
    //     }
    //     if (user.memberDesignation !== 'pharmacist') {
    //       throw new Error('Invalid user');
    //     }
    //     if (!order.patient?.caryrx?.id) {
    //       throw new Error(
    //         'Patient is not registered for Pharmacy Delivery System(CaryRX).'
    //       );
    //     }
    //     if (order.status === 'placed' && status === 'sent') {
    //       const prescriptionPromises = order.medications.map(
    //         (medication) =>
    //           new Promise(async (resolve, reject) => {
    //             try {
    //               const prescriptionId = await caryRXService.createPrescription(
    //                 order.patient.caryrx.id,
    //                 medication.name,
    //                 medication.quantity,
    //                 1,
    //                 1,
    //                 `${medication.name} - ${medication.ndc}`
    //               );
    //               medication.caryRXPrescription = {
    //                 id: prescriptionId,
    //                 status: 'Pending',
    //               };
    //             } catch (error) {
    //               return reject(error);
    //             }
    //             resolve();
    //           })
    //       );
    //       try {
    //         await Promise.all(prescriptionPromises);
    //         const prescriptions = order.medications.map((medication) => ({
    //           id: medication.caryRXPrescription.id,
    //           entity: 'Prescription',
    //         }));
    //         const caryRXOrder = await caryRXService.createOrder(
    //           order.patient.caryrx.locationId,
    //           order.patient.caryrx.id,
    //           prescriptions
    //         );
    //         if (!caryRXOrder) {
    //           throw new Error('Error occurred while processing order');
    //         }
    //         order.caryRXOrder = caryRXOrder;
    //       } catch (error) {
    //         console.error(error);
    //         throw new Error('Error occured during processing order.');
    //       }
    //       order.status = 'sent';
    //       await order.save();
    //     }

    //     socketManager.sendMessage(
    //       order.provider,
    //       SOCKET_EVENTS.MEDICATION_ORDERS
    //     );
    //     socketManager.sendMessage(order.patient, SOCKET_EVENTS.MEDICATION_ORDERS);
    //     notifyPharmacists();

    //     return true;
    //   },
  },
];
