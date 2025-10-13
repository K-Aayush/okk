export default `
  type MedicationStrength {
    unit: String
    value: String
  }

  type MedicationInfo {
    name: String!
    strength: MedicationStrength
    dosageForm: String
    ndc: String
    route: String
    frequency: JSONObject
    alerts: JSONObject
    mods: JSONObject
    quantity: Float
  }

  type MedicationOrderItem {
    name: String!
    strength: MedicationStrength
    dosageForm: String
    ndc: String
    route: String
    frequency: JSONObject
    alerts: JSONObject
    mods: JSONObject
    status: String
  }

  type CaryRXOrder {
    order_status: String
    shipment_tracking_url: String
  }

  type MedicationOrder {
    _id: ID!
    orderNumber: String!
    provider: User
    patient: User
    status: String!
    medications: JSON
    caryRXOrder: CaryRXOrder
    createdAt: Date!
    updatedAt: Date!
  }

  input MedicationStrengthInput {
    unit: String
    value: String
  }

  input MedicationInput {
    name: String!
    strength: MedicationStrengthInput
    dosageForm: String
    ndc: String
    route: String
    frequency: JSONObject
    mods: JSONObject
    alerts: JSONObject
    quantity: Float
  }
`;
