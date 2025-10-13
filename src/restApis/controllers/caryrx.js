import { MedicationOrder } from '../../db';
import { notifyPharmacists } from '../../services/medication';
import socketManager from '../../services/socket-manager';
import SOCKET_EVENTS from '../../services/socket-manager/constants';

class CaryRXController {
  async prescriptionCallback(request, response) {
    try {
      const { body } = request;
      if (body.id === 'test_object') {
        return response
          .status(200)
          .send({ message: 'Callback registration test request accepted.' });
      }
      // return response.send({ message: 'success' });

      const order = await MedicationOrder.findOne({
        'medications.caryRXPrescription.id': body.id,
      }).populate([
        {
          path: 'provider',
          populate: {
            path: 'activeProviderPractice',
          },
        },
        'patient',
      ]);

      if (!order) {
        return response.status(400).send({ error: 'Order not found' });
      }

      const medication = order.medications?.find(
        (item) => item.caryRxPrescription?.id === body.id
      );
      if (!medication) {
        return response.status(400).send({ message: 'Prescription not found' });
      }

      if (medication.caryRxPrescription.status !== body.status) {
        medication.caryRxPrescription.status = body.status;
        // if (body.status === 'rejected') {
        //   order.status === 'rejected';
        // }
        await order.save();
        this.sendSocketNotification(order.patient, order.provider);
      }
      response.send({ message: 'success' });
    } catch (error) {
      response.status(400).send({ error });
    }
  }

  async orderCallback(request, response) {
    try {
      const { body } = request;
      if (body.id === 'test_object') {
        return response
          .status(200)
          .send({ message: 'Callback registration test request accepted.' });
      }
      // return response.send({ message: 'success' });

      const order = await MedicationOrder.findOne({
        'caryRXOrder.id': body.id,
      }).populate([
        {
          path: 'provider',
          populate: {
            path: 'activeProviderPractice',
            populate: {
              path: 'practice',
              model: 'Practice',
            },
          },
        },
        'patient',
      ]);

      if (!order) {
        return response.status(400).send({ error: 'Order not found' });
      }

      if (order.caryRXOrder?.order_status !== body.order_status) {
        order.caryRXOrder = body;
        if (body.order_status === 'shipped') {
          order.status = 'shipped';
          order.tracking = body.tracking_url;
        } else if (body.order_status === 'delivered') {
          order.status = 'received';
        } else if (body.order_status === 'delivery_failed') {
          order.status = 'failed';
        }
        await order.save();
        this.sendSocketNotification(order.patient, order.provider);
      }

      response.send({ message: 'success' });
    } catch (error) {
      response.status(400).send({ error });
    }
  }

  sendSocketNotification(patient, provider) {
    notifyPharmacists();
    socketManager.notifyPractice(
      provider.activeProviderPractice.practice,
      SOCKET_EVENTS.PATIENT_MEDICATION_ORDERS,
      { patient }
    );
    socketManager.sendMessage(
      patient._id,
      SOCKET_EVENTS.PATIENT_MEDICATION_ORDERS,
      {}
    );
  }
}

export default new CaryRXController();
