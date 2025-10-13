export default `
  type MonthlyPatientStatus {
    totalPatients: Int
    totalSeconds: Int
    averageSeconds: Int
  }

  type MonthlySpecialistSummary {
    totalConsults: Int
    averageConsultTime: Int
    averageResponseTime: Int
  }

  type MonthlyPCPSummary {
    totalConsults: Int
    totalCompleted: Int
    totalOngoing: Int
  }
`;
