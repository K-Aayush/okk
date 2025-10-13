export default `
  type ProviderReportIndividualItem {
    provider: User!
    subTotal: Int!
  }

  type ProviderReportItem {
    subTotal: Int!
    lastSeen: Date
    patient: User!
    practice: Practice
    providers: [ProviderReportIndividualItem]
  }
  type ProviderReport {
    total: Int!
    items: [ProviderReportItem]
  }

  type PatientReport {
    total: Int!
    records: [Record]
  }

  type ProviderMonthlyBillableSummary {
    time: Int!
    physiologic: Int!,
    therapeutic: Int!
  }

  type PatientMonthlyReadings {
    time: Int!
    physiologic: Int!,
    therapeutic: Int!
  }

  type BillableReadingPatient {
    physiologic: Int!,
    therapeutic: Int!,
    physBillable: Boolean!
    theraBillable: Boolean!
    patient: User!
  }
`;
