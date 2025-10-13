import moment from 'moment';

export const MIN_DATE = new Date('1970-01-01');

export const displayTime = (timestamp, format = null) => {
  if (!timestamp) {
    return null;
  }
  let timeFormat;
  if (format === 'date') {
    timeFormat = 'MM/DD/YYYY';
  } else if (!!format) {
    timeFormat = format;
  } else {
    timeFormat = 'MM/DD/YYYY h:mm A';
  }
  return moment(timestamp).format(timeFormat);
};

export const secondsToDuration = (seconds, shortForm = false) => {
  let sec = seconds % 60;
  if (sec < 10) {
    sec = '0' + sec;
  }

  if (!shortForm) {
    let min = Math.floor(seconds / 60) % 60;
    const hour = Math.floor(seconds / 3600);

    if (min < 10) {
      min = '0' + min;
    }
    return `${hour}:${min}:${sec}`;
  }

  let min = Math.floor(seconds / 60);
  if (min < 10) {
    min = '0' + min;
  }
  return `${min}:${sec}`;
};

export const checkDateForPeriod = (period) => {
  const checkDate = new Date();
  switch (period.toLowerCase()) {
    case 'today':
      checkDate.setDate(checkDate.getDate() - 1);
      break;
    case '1w':
      checkDate.setDate(checkDate.getDate() - 7);
      break;
    case '2w':
      checkDate.setDate(checkDate.getDate() - 14);
      break;
    case '1m':
      checkDate.setMonth(checkDate.getMonth() - 1);
      break;
    case '3m':
      checkDate.setMonth(checkDate.getMonth() - 3);
      break;
    case '6m':
      checkDate.setMonth(checkDate.getMonth() - 6);
      break;
    case '1y':
      checkDate.setFullYear(checkDate.getFullYear() - 1);
      break;
  }
  return checkDate;
};

export const hourToDate = (time, referenceDate = null) => {
  if (!referenceDate) {
    referenceDate = moment();
  }
  const newDate = moment(time, 'hh:mm A').utcOffset(
    referenceDate.utcOffset(),
    true
  );
  newDate.set({
    year: referenceDate.year(),
    month: referenceDate.month(),
    date: referenceDate.date(),
  });
  return newDate;
};

export const toGMT = (time, dateOnly = false, returnObject = false) => {
  const a = moment(time);
  const b = dateOnly
    ? moment.utc(a.format('ll'))
    : moment.utc(a.format('YYMMDD HH:mm:ss'), 'YYMMDD HH:mm:ss');
  return returnObject ? b : b.toISOString();
};

export const toLocalTime = (
  time,
  format = 'object',
  timezoneOffset,
  dateOnly = false
) => {
  const offset = timezoneOffset || moment().utcOffset();
  const localTime = moment(time).subtract(offset, 'm').utcOffset(offset);
  if (dateOnly) {
    localTime.set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
  }
  if (format === 'object') {
    return localTime;
  } else if (format === 'datetime') {
    return localTime.format('YYMMDD hh:mm:ss');
  } else if (format === 'time') {
    return localTime.format('hh:mm:ss');
  } else if (format === 'date') {
    return localTime.format('MM/DD/YYYY');
  }
  return localTime.format(format);
};

export const scheduleTimesFromFrequency = (
  frequency,
  careplan,
  offset,
  time = new Date()
) => {
  let times = [];
  if (frequency?.type === 'preset') {
    times = frequency.value.hours;
  } else if (frequency?.type === 'custom') {
    const localTime = toLocalTime(time, 'object', offset);
    const value = frequency.value;
    if (!value) {
      return [];
    }
    if (value.frequency === 'Weekly') {
      const careplanStartDate = toLocalTime(
        careplan.startDate,
        'object',
        offset,
        true
      );
      if (localTime.isBefore(careplanStartDate)) {
        return [];
      }
      const startDateWeekDay = careplanStartDate.weekday();
      const weekDay = localTime.weekday();
      const daysDiff = localTime.diff(careplanStartDate, 'days');
      let weekDiff;
      if (startDateWeekDay <= weekDay) {
        weekDiff = Math.floor(daysDiff / 7);
      } else {
        weekDiff = Math.floor(daysDiff / 7) + 1;
      }
      if (weekDiff % value.everyWeeks !== 0) {
        return [];
      }
      if (value.weekDays.includes(weekDay)) {
        return value.weeklyTimes;
      }
    } else {
      const scheduleStartDate = toLocalTime(
        value.startDate,
        'object',
        offset,
        true
      );
      if (localTime.isBefore(scheduleStartDate)) {
        return [];
      }
      const daysDiff = localTime.diff(scheduleStartDate, 'days');
      if (daysDiff > 0 && daysDiff % parseInt(value.everyDays, 10) === 0) {
        return value.dailyTimes;
      }
    }
    return [];
  }
  return times;
};

export const getStartDate = (period = 'w', date = null) => {
  const startDate = new Date(date || new Date());
  switch (period) {
    case 'w':
      const dayOfWeek = startDate.getDay();
      if (dayOfWeek > 0) {
        startDate.setDate(startDate.getDate() - dayOfWeek + 1);
      } else {
        startDate.setDate(startDate.getDate() - 6);
      }
      return startDate;
    case 'm':
      startDate.setDate(1);
      return startDate;
    case 'y':
      startDate.setDate(1);
      startDate.setMonth(0);
      return startDate;
  }
  return startDate;
};

export const checkValidCareplanTime = (
  time,
  careplan,
  offset,
  ternaryResult = false
) => {
  const startDate = toLocalTime(
    careplan.startDate,
    'object',
    offset,
    true
  ).toDate();
  const endDate = moment(startDate).add(careplan.duration, 'days').toDate();
  if (time.getTime() < startDate.getTime()) {
    return ternaryResult ? -1 : false;
  }
  if (time.getTime() > endDate.getTime() + 3600 * 1000) {
    return ternaryResult ? 0 : false;
  }
  return ternaryResult ? 1 : true;
};
