import { formatTitleAndName, getFullName } from './string';
import { displayTime, secondsToDuration } from './time';

export const TIMER_TYPE = {
  MANUAL_PSTN: 'manualAudio',
  MANUAL_VIDEO: 'manualVideo',
  CALL: 'call',
  CHAT: 'chat',
  NOTE: 'note',
  CAREPLAN: 'careplan',
  ORDER_MEDS: 'orderMeds',
  REVIEW: 'review',
};

export const extractData = (provider, record, item) => {
  const renderType = () => {
    switch (item.type) {
      case TIMER_TYPE.CHAT:
        return 'Message';
      case TIMER_TYPE.CALL:
        const prefix = item.isPSTN ? 'Audio ' : item.scheduled ? 'Appt ' : '';
        const type = item.isPSTN ? 'PSTN' : 'Video';
        return `${prefix}${type}`;
      case TIMER_TYPE.MANUAL_PSTN:
        return 'Audio PSTN';
      case TIMER_TYPE.MANUAL_VIDEO:
        return 'Video Call';
      case TIMER_TYPE.REVIEW:
        return 'Chart Review';
      case TIMER_TYPE.NOTE:
        return 'Create Note';
      case TIMER_TYPE.CAREPLAN:
        return 'Create Careplan';
      case TIMER_TYPE.ORDER_MEDS:
        return 'Order Meds';
      default:
        return '';
    }
  };

  const start = new Date(item.startedAt).getTime();
  const end = new Date(item.endedAt).getTime();
  const duration = parseInt(item.duration || (end - start) / 1000, 10);

  let refString;
  let byString;

  if (['chat', 'call', TIMER_TYPE.MANUAL_VIDEO].includes(item.type)) {
    const participantIds = item.participants?.map((p) => p._id);
    byString = item.participants?.map((p) => formatTitleAndName(p)).join(' / ');

    if (
      item.referredPatient &&
      !participantIds.includes(item.referredPatient._id)
    ) {
      refString = getFullName(item.referredPatient);
    }
  } else {
    byString = formatTitleAndName(record.provider || provider);
  }

  return [
    displayTime(record.startedAt, 'MM/DD/YY'),
    displayTime(record.startedAt, 'hh:mm A'),
    renderType(),
    refString ? `${byString} (ref: ${refString})` : byString,
    secondsToDuration(duration),
  ];
};
