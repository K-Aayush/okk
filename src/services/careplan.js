import mongoose from 'mongoose';

import { MEASURE_TYPES } from '../db/models/schemas/careplan/measure';
import { VITAL_TYPES } from '../db/models/schemas/careplan/measure/vital';

import { Careplan, CareplanResponse as Response } from '../db';
import {
  toGMT,
  toLocalTime,
  hourToDate,
  scheduleTimesFromFrequency,
} from '../utils/time';
import { addAppointment, sendAppointmentNotifications } from './appointment';
import socketManager from '../services/socket-manager';
import SOCKET_EVENTS from '../services/socket-manager/constants';

import moment from 'moment';

export const getActiveCareplan = async (user) => {
  return await Careplan.findOne({ user, isActive: true }).lean();
};

export const getDailyResponse = async (user, date, careplan, session) => {
  const response = await Response.findOne({
    date,
    user: user._id,
    careplan: careplan._id,
  });
  if (!!response) {
    return response;
  }
  const offset = user.timezoneOffset || -300;
  const cpItems = careplanItems(careplan, offset, date);
  const responseData = {
    user: user._id,
    date,
    careplan: careplan._id,
    responses: cpItems,
  };
  const responses = await Response.create([responseData], { session });
  return responses[0];
};

const checkAndSwapValues = (response) => {
  let temp;
  if (response.value < response.value2) {
    temp = response.value;
    response.value = response.value2;
    response.value2 = temp;
  }
};

const getPastWeightResponses = async (careplan, time, alerts) => {
  const date = moment(time).utcOffset(0);
  date.subtract(alerts.periodValue, 'days');
  const compareDate = toGMT(date, true, true).toDate();
  const responses = await Response.find({
    careplan: careplan._id,
    user: careplan.user._id,
    date: { $gte: compareDate },
    responses: {
      $elemMatch: {
        measure: 'vital',
        'response.type': 'weight',
        time: { $lte: time },
      },
    },
  }).sort({ date: -1 });
  return {
    lastTime: compareDate,
    responses,
  };
};

const checkWeightResponsePositive = async (
  responseValue,
  checkTime,
  responses,
  alerts
) => {
  let meetPastAlertsTrigger = false;
  const baseWeight = parseFloat(alerts.value);
  const alertWeightGain = parseFloat(alerts.value2);
  let shouldTriggerAlerts = false;
  let havePreviousWeightMeasured = false;
  for (let response of responses) {
    for (let subResponse of response.responses) {
      if (
        subResponse.measure !== 'vital' ||
        subResponse.response?.type !== 'weight'
      ) {
        continue;
      }
      if (subResponse.time.getTime() >= checkTime.getTime()) {
        continue;
      }
      if (subResponse.response.value) {
        havePreviousWeightMeasured = true;
        if (responseValue >= subResponse.response.value + alertWeightGain) {
          shouldTriggerAlerts = true;
          break;
        }
      }
      if (subResponse.isPositive === false) {
        meetPastAlertsTrigger = true;
        break;
      }
    }
    if (meetPastAlertsTrigger || shouldTriggerAlerts) {
      break;
    }
  }

  if (
    !shouldTriggerAlerts &&
    (responses.length < alerts.periodValue || !havePreviousWeightMeasured) &&
    parseFloat(responseValue) >= baseWeight + alertWeightGain
  ) {
    shouldTriggerAlerts = true;
  }
  return shouldTriggerAlerts;
};

const isVitalPositive = async (response, careplan, responseTime) => {
  const alerts = careplan.content.vital[response.type].alerts;
  if (!alerts || Object.values(alerts).length === 0) {
    return null;
  }
  switch (response.type) {
    case VITAL_TYPES.heartRate:
      checkAndSwapValues(response);
      if (response.value > alerts.value) {
        return false;
      }
      if (response.value < alerts.value2) {
        return false;
      }
      break;
    case VITAL_TYPES.bloodPressure:
      checkAndSwapValues(response);
      if (response.value > alerts.value) {
        return false;
      }
      if (response.value2 > alerts.value2) {
        return false;
      }
      if (response.value < alerts.value3) {
        return false;
      }
      if (response.value2 < alerts.value4) {
        return false;
      }
      break;
    case VITAL_TYPES.weight:
      const pastData = await getPastWeightResponses(
        careplan,
        responseTime,
        alerts
      );
      const positive = await checkWeightResponsePositive(
        response.value,
        responseTime,
        pastData.responses,
        alerts
      );
      return !positive;
    case VITAL_TYPES.glucose:
      if (response.value > alerts.value) {
        return false;
      }
      break;
    case VITAL_TYPES.respiratory:
      if (response.value < alerts.value || response.value > alerts.value2) {
        return false;
      }
      break;
    case VITAL_TYPES.bloodOxygen:
      if (response.value > 100) {
        response.value = 100;
      }
      if (response.value < alerts.value) {
        return false;
      }
      break;
    case VITAL_TYPES.temperature:
      if (response.value > alerts.value) {
        return false;
      }
      break;
  }
  return true;
};

const updateMeasureResponseElement = async (elem, response, careplan) => {
  if (!elem.response) {
    elem.response = {};
  }
  switch (elem.measure) {
    case MEASURE_TYPES.activity:
    case MEASURE_TYPES.medication:
      elem.response.didTake = response.didTake;
      elem.isPositive = elem.response.didTake;
      break;
    case MEASURE_TYPES.vital:
      elem.response.value = response.value;
      if (response.value2) {
        elem.response.value2 = response.value2;
      }
      const positive = await isVitalPositive(response, careplan, elem.time);
      if (positive !== null) {
        elem.isPositive = positive;
      }
      break;
    case MEASURE_TYPES.diet:
    case MEASURE_TYPES.wellness:
      elem.response.value = response.value;
      elem.isPositive = response.value > 2;
      break;
  }
  elem.addedTime = new Date();
};

export const updateMeasureResponse = async (
  responseObject,
  response,
  careplan
) => {
  let progressChanges = {};
  let responseExists;
  let previousValue;
  for (let elem of responseObject) {
    if (
      !(
        elem.measure === response.measure &&
        elem.time?.getTime() === response.time?.getTime()
      )
    ) {
      continue;
    }
    if (elem.isPositive !== undefined && elem.isPositive !== null) {
      responseExists = true;
      previousValue = elem.isPositive;
    } else {
      responseExists = false;
      previousValue = null;
    }
    if (response.measure === 'vital') {
      if (response.response[elem.response.type]) {
        if (elem.response.type === 'bloodPressure') {
          await updateMeasureResponseElement(
            elem,
            {
              type: elem.response.type,
              value: response.response[elem.response.type],
              value2: response.response['bloodPressure2'],
            },
            careplan
          );
          if (!(elem.isPositive === null || elem.isPositive === undefined)) {
            if (responseExists) {
              progressChanges.bloodPressure = {
                count: 0,
                value:
                  !previousValue && elem.isPositive
                    ? 1
                    : previousValue && !elem.isPositive
                    ? -1
                    : 0,
              };
            } else {
              progressChanges.bloodPressure = {
                count: 1,
                value: elem.isPositive ? 1 : 0,
              };
            }
          } else {
            progressChanges[elem.response.type] = { count: 0, value: 0 };
          }
        } else {
          await updateMeasureResponseElement(
            elem,
            {
              type: elem.response.type,
              value: response.response[elem.response.type],
            },
            careplan
          );
          if (!(elem.isPositive === null || elem.isPositive === undefined)) {
            if (responseExists) {
              progressChanges[elem.response.type] = {
                count: 0,
                value:
                  !previousValue && elem.isPositive
                    ? 1
                    : previousValue && !elem.isPositive
                    ? -1
                    : 0,
              };
            } else {
              progressChanges[elem.response.type] = {
                count: 1,
                value: elem.isPositive ? 1 : 0,
              };
            }
          } else {
            progressChanges[elem.response.type] = { count: 0, value: 0 };
          }
        }
      }
    } else if (response.measure === 'wellness' || response.measure === 'diet') {
      if (response.response[elem.response.type]) {
        await updateMeasureResponseElement(
          elem,
          {
            type: elem.response.type,
            value: response.response[elem.response.type],
          },
          careplan
        );
        if (!(elem.isPositive === null || elem.isPositive === undefined)) {
          if (responseExists) {
            progressChanges[elem.response.type] = {
              count: 0,
              value:
                !previousValue && elem.isPositive
                  ? 1
                  : previousValue && !elem.isPositive
                  ? -1
                  : 0,
            };
          } else {
            progressChanges[elem.response.type] = {
              count: 1,
              value: elem.isPositive ? 1 : 0,
            };
          }
        } else {
          progressChanges[elem.response.type] = { count: 0, value: 0 };
        }
      }
    } else {
      await updateMeasureResponseElement(elem, response.response, careplan);
      if (!(elem.isPositive === null || elem.isPositive === undefined)) {
        if (responseExists) {
          progressChanges = {
            count: 0,
            value:
              !previousValue && elem.isPositive
                ? 1
                : previousValue && !elem.isPositive
                ? -1
                : 0,
          };
        } else {
          progressChanges = {
            count: 1,
            value: elem.isPositive ? 1 : 0,
          };
        }
      } else {
        progressChanges = { count: 0, value: 0 };
      }
    }
  }
  return progressChanges;
};

const careplanItems = (careplan, offset, date = new Date()) => {
  const content = careplan ? JSON.parse(JSON.stringify(careplan.content)) : {};
  const items = {
    activity: {},
    medication: {},
    vital: {},
    wellness: {},
    diet: {},
    appointment: {},
  };
  const measureItems = ['medication', 'vital', 'activity', 'diet', 'wellness'];
  measureItems.forEach((key) => {
    const item = content[key];
    if (!item) {
      return;
    }

    if (key === 'activity') {
      const hours = scheduleTimesFromFrequency(
        item.frequency,
        careplan,
        offset,
        date
      );
      if (hours?.length > 0) {
        hours.forEach((hour) => {
          if (!items[key][hour]) {
            items[key][hour] = [];
          }
          items[key][hour].push(item.activity);
        });
      }
    } else {
      Object.entries(item).forEach(([subItemType, subItem]) => {
        const hours = scheduleTimesFromFrequency(
          subItem.modification?.frequency || subItem.frequency,
          careplan,
          offset,
          date
        );
        if (hours?.length > 0) {
          hours.forEach((hour) => {
            if (!items[key][hour]) {
              items[key][hour] = [];
            }
            items[key][hour].push(subItemType);
          });
        }
      });
    }
  });

  const responseItems = [];
  Object.entries(items).forEach(([type, item]) => {
    if (!item || Object.values(item).length === 0) {
      return;
    }
    Object.entries(item).forEach(([hour, itemIds]) => {
      const localTime = toLocalTime(date, 'object', offset);
      const time = toGMT(hourToDate(hour, localTime), false);
      switch (type) {
        case 'activity':
        case 'medication':
          responseItems.push({
            time,
            measure: type,
          });
          break;
        case 'wellness':
        case 'diet':
        case 'vital':
          itemIds.forEach((subType) => {
            responseItems.push({
              time,
              measure: type,
              response: { type: subType },
            });
          });
          break;
      }
    });
  });
  return responseItems;
};

export const updateProgressChanges = (progress, changes, measureType) => {
  if (!progress[measureType]) {
    if (
      measureType === 'vital' ||
      measureType === 'wellness' ||
      measureType === 'diet'
    ) {
      progress[measureType] = {};
    } else {
      progress[measureType] = {
        totalCount: 0,
        positiveCount: 0,
      };
    }
  }
  const measureProgress = progress[measureType];
  if (
    measureType === 'vital' ||
    measureType === 'wellness' ||
    measureType === 'diet'
  ) {
    Object.keys(changes).forEach((subType) => {
      if (!measureProgress[subType]) {
        measureProgress[subType] = {
          totalCount: 0,
          positiveCount: 0,
        };
      }
      if (changes[subType].count > 0) {
        measureProgress[subType].totalCount += changes[subType].count;
      }
      if (changes[subType].value !== 0) {
        measureProgress[subType].positiveCount += changes[subType].count;
      }
    });
  } else {
    if (changes.count > 0) {
      measureProgress.totalCount += changes.count;
    }
    if (changes.value !== 0) {
      measureProgress.positiveCount += changes.value;
    }
  }
};

const calculateNextTime = (frequency, startTime, careplanStartDate, offset) => {
  if (frequency?.type === 'preset') {
    const hours = frequency.value?.hours;
    if (!hours || hours.length === 0) {
      return null;
    }
    for (let hour of hours) {
      const hourDate = hourToDate(hour, startTime);
      if (startTime.isBefore(hourDate)) {
        return hourDate;
      }
    }
    const nextDayHour = hourToDate(hours[0], startTime).add(1, 'days');
    return nextDayHour;
  } else {
    const value = frequency.value;
    if (!value) {
      return;
    }
    if (value.frequency === 'Weekly') {
      if (!value.weeklyTimes || value.weeklyTimes.length === 0) {
        return null;
      }
      const startDateWeekDay = careplanStartDate.weekday();
      const weekDay = startTime.weekday();
      const daysDiff = startTime.diff(careplanStartDate, 'days');
      const taskDate = startTime.clone();
      let weekDiff;
      if (startDateWeekDay <= weekDay) {
        weekDiff = Math.floor(daysDiff / 7);
      } else {
        weekDiff = Math.floor(daysDiff / 7) + 1;
      }
      if (weekDiff % value.everyWeeks === 0) {
        if (value.weekDays.includes(weekDay)) {
          for (let hour of value.weeklyTimes) {
            const hourDate = hourToDate(hour, taskDate);
            if (!hourDate.isBefore(startTime)) {
              return hourDate;
            }
          }
        }
        const nextDay = value.weekDays.find((day) => day > weekDay);
        if (!nextDay) {
          taskDate.add(
            7 * value.everyWeeks - weekDay + value.weekDays[0],
            'days'
          );
          return hourToDate(value.weeklyTimes[0], taskDate);
        } else {
          taskDate.add(nextDay - weekDay, 'days');
          return hourToDate(value.weeklyTimes[0], taskDate);
        }
      } else {
        const daysTillNextScheduleWeek =
          7 * (value.everyWeeks - (weekDiff % value.everyWeeks)) -
          weekDay +
          value.weekDays[0];
        taskDate.add(daysTillNextScheduleWeek, 'days');
        return hourToDate(value.weeklyTimes[0], taskDate);
      }
    } else {
      if (!value.dailyTimes || value.dailyTimes.length === 0) {
        return null;
      }
      const scheduleStartDate = toLocalTime(
        value.startDate,
        'object',
        offset,
        true
      );
      if (startTime.isBefore(scheduleStartDate)) {
        return hourToDate(value.dailyTimes[0], scheduleStartDate);
      }
      const scheduleDate = startTime.clone();
      const daysDiff = scheduleDate.diff(scheduleStartDate, 'days');
      const leapDays = parseInt(value.everyDays, 10);
      if (daysDiff === 0 || daysDiff % leapDays !== 0) {
        scheduleDate.add(leapDays - (daysDiff % leapDays), 'days');
      }
      for (let hour of value.dailyTimes) {
        const hourDate = hourToDate(hour, scheduleDate);
        if (startTime.isBefore(hourDate)) {
          return hourDate;
        }
      }
      const nextDayHour = hourToDate(value.dailyTimes[0], scheduleDate).add(
        leapDays,
        'days'
      );
      return nextDayHour;
    }
  }
};

export const getNextCareplanTaskScheduleTime = (
  patient,
  careplan,
  start,
  timezoneOffset
) => {
  const offset = timezoneOffset || patient.timezoneOffset || -300;
  const careplanStartTime = toLocalTime(
    careplan.startDate,
    'object',
    offset,
    true
  );
  const now = moment().utcOffset(offset);
  let startTime;
  if (start) {
    startTime = moment.unix(start.unix() + 1).utcOffset(offset);
  } else {
    startTime = moment.unix(now.unix() + 1).utcOffset(offset);
  }
  if (now.isBefore(careplanStartTime)) {
    startTime = careplanStartTime;
  }
  let nextTaskTime = null;
  let tasks = [];
  const measureItems = ['medication', 'vital', 'activity', 'diet', 'wellness'];
  const content = careplan.content;

  measureItems.forEach((key) => {
    const item = content[key];
    if (!item) {
      return;
    }

    if (key === 'activity') {
      const itemNextTime = calculateNextTime(
        item.frequency,
        startTime,
        careplanStartTime,
        offset
      );
      if (itemNextTime) {
        if (!nextTaskTime || itemNextTime.isBefore(nextTaskTime)) {
          nextTaskTime = itemNextTime;
          tasks = [
            {
              type: 'activity',
              item,
            },
          ];
        } else if (itemNextTime.unix() === nextTaskTime.unix()) {
          tasks.push({ type: 'activity', item });
        }
      }
    } else {
      Object.values(item).forEach((subItem) => {
        const itemNextTime = calculateNextTime(
          subItem.modification?.frequency || subItem.frequency,
          startTime,
          careplanStartTime,
          offset
        );
        if (itemNextTime) {
          if (!nextTaskTime || itemNextTime.isBefore(nextTaskTime)) {
            nextTaskTime = itemNextTime;
            tasks = [
              {
                type: key,
                item: subItem,
              },
            ];
          } else if (itemNextTime.unix() === nextTaskTime.unix()) {
            tasks.push({
              type: key,
              item: subItem,
            });
          }
        }
      });
    }
  });
  return {
    time: nextTaskTime,
    tasks,
  };
};

export const addFollowupAppointments = async (careplan, creator) => {
  if (!careplan.content?.careTeam) {
    return;
  }

  const careTeam = careplan.content.careTeam;
  const patientId = careplan.user?._id || careplan.user;
  const session = await mongoose.startSession();
  let appointments = [];

  await session.withTransaction(async () => {
    for (let item of careTeam) {
      if (item.appointments?.length > 0) {
        for (let appt of item.appointments) {
          const appointmentId = await addAppointment(
            creator,
            patientId,
            [item.user?._id || item.user],
            'Careplan Follow Up',
            appt.time,
            session
          );
          if (appointmentId !== false) {
            appointments.push({
              _id: appointmentId,
              provider: item.user?._id || item.user,
              time: appt.time,
            });
          }
        }
        socketManager.sendMessage(
          item.user?._id || item.user,
          SOCKET_EVENTS.APPOINTMENTS
        );
      }
    }
  });
  session.endSession();

  socketManager.sendMessage(patientId, SOCKET_EVENTS.APPOINTMENTS);

  for (let appointmentData of appointments) {
    appointmentData.appointment = await sendAppointmentNotifications(
      appointmentData._id,
      null
    );
  }
};
