export default `
  type TimeRange {
    start: Date!
    end: Date!
  }

  type ScheduleBreak {
    from: String!,
    to: String!
  }

  type Schedule {
    days: [Int!],
    from: String!,
    to: String!,
    duration: Int!,
    breakOn: Boolean!,
    breaks: [ScheduleBreak!]
  }

  input ScheduleBreakInput {
    from: String!,
    to: String!
  }

  input ScheduleInput {
    days: [Int!],
    from: String!,
    to: String!,
    duration: Int!,
    breakOn: Boolean!,
    breaks: [ScheduleBreakInput!]
  }
`;
