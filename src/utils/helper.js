export const getVitalTypeAttr = (vitalType) => {
  switch (vitalType) {
    case 'heartRate':
      return {
        title: 'Heart Rate (bpm)',
        name: 'Heart Rate',
        unit: 'BPM (Beats per Min)',
        unitShort: 'bpm',
      };
    case 'glucose':
      return {
        title: 'Glucose (mg/dL)',
        name: 'Glucose',
        unit: 'mg/dL',
      };
    case 'weight':
      return {
        title: 'Weight (lbs)',
        name: 'Weight',
        unit: 'lbs',
      };
    case 'bloodPressure':
      return {
        title: 'Blood Pressure (mmHg)',
        name: 'Blood Pressure',
        unit: 'mmHg',
      };
    case 'oxygen':
    case 'bloodOxygen':
      return {
        title: 'Oxygen (%)',
        name: 'Oxygen',
        unit: '%',
      };
    case 'breathRate':
    case 'respiratory':
      return {
        title: 'Breath Rate (bpm)',
        name: 'Breath Rate',
        unit: 'BPM (Breaths per Min)',
      };
    case 'temperature':
      return {
        title: 'Temperature (\u2109)',
        name: 'Temperature',
        unit: '\u2109',
      };
    default:
      return {};
  }
};
