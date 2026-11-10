export type CalendarType =
  | "ALL_365_DAYS"
  | "ALL_EXCEPT_PUBLIC_HOLIDAYS"
  | "ALL_EXCEPT_SUNDAYS_AND_PUBLIC_HOLIDAYS"
  | "CUSTOM";

export interface Pod {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  leadEmployeeId?: string | null;
  lead?: {
    id: string;
    name: string;
    employeeCode: string;
    email?: string;
    role?: string;
  } | null;
  _count?: {
    members: number;
    brands: number;
  };
}

export interface PodMember {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  role: string;
  isPodLead: boolean;
  contractType: string;
  weeklyWorkDays: number;
}

export interface PodBrand {
  id: string;
  code: string;
  name: string;
  isSingleResource: boolean;
  _count?: {
    processes: number;
  };
}

export interface PodDetails extends Pod {
  members: PodMember[];
  brands: PodBrand[];
}

export interface PodFormData {
  code: string;
  name: string;
  description?: string;
  leadEmployeeId?: string | null;
}

export interface BrandProcessSummary {
  id: string;
  code: string;
  name: string;
  calendarType: CalendarType;
  defaultMinStaff: number;
  _count?: {
    assignments: number;
  };
}

export interface Brand {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  podId: string;
  pod: {
    id: string;
    code: string;
    name: string;
  };
  isSingleResource: boolean;
  processes: BrandProcessSummary[];
  _count?: {
    processes: number;
  };
}

export interface BrandFormData {
  code: string;
  name: string;
  description?: string;
  podId: string;
  isSingleResource: boolean;
}

export interface ProcessCoverageRule {
  id: string;
  processId: string;
  dateOverride?: string | null;
  dayOfWeek?: number | null;
  requiredStaffCount: number;
  note?: string | null;
}

export interface ProcessAssignmentItem {
  id: string;
  employeeId: string;
  assignmentType: "PRIMARY" | "SECONDARY_BACKUP" | "FLOAT";
  priorityRank: number;
  employee: {
    id: string;
    name: string;
    employeeCode: string;
    email: string;
    role: string;
    isPodLead: boolean;
  };
}

export interface Process {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  brandId: string;
  brand: {
    id: string;
    code: string;
    name: string;
    isSingleResource: boolean;
    pod?: {
      id: string;
      code: string;
      name: string;
    };
  };
  calendarType: CalendarType;
  defaultMinStaff: number;
  coverageRules?: ProcessCoverageRule[];
  assignments?: ProcessAssignmentItem[];
  _count?: {
    assignments: number;
    coverageRules: number;
    rosterShifts: number;
  };
}

export interface ProcessFormData {
  code: string;
  name: string;
  description?: string;
  brandId: string;
  calendarType: CalendarType;
  defaultMinStaff: number;
}

export type AssignmentType = "PRIMARY" | "SECONDARY_BACKUP" | "FLOAT";

export interface EmployeeProcessAssignment {
  id: string;
  employeeId: string;
  processId: string;
  assignmentType: AssignmentType;
  priorityRank: number;
  employee: {
    id: string;
    name: string;
    employeeCode: string;
    email: string;
    role: string;
    isPodLead: boolean;
    podId: string | null;
    pod: {
      id: string;
      code: string;
      name: string;
    } | null;
  };
  process: {
    id: string;
    code: string;
    name: string;
    brandId: string;
    brand: {
      id: string;
      code: string;
      name: string;
      pod?: {
        id: string;
        code: string;
        name: string;
      };
    };
  };
}

export interface WeeklyOff {
  dayOfWeek: number;
  isStandard: boolean;
}

export interface EmployeeWeeklyOffRecord extends WeeklyOff {
  id: string;
  employeeId: string;
  specificDate: string | null;
  employee: { id: string; name: string; employeeCode: string };
}

export type LeaveType = "ANNUAL" | "SICK" | "CASUAL" | "COMP_OFF";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface EmployeeLeaveRecord {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  leaveType: LeaveType;
  status: LeaveStatus;
  reason: string | null;
  employee: { id: string; name: string; employeeCode: string };
}

export interface PublicHoliday {
  id: string;
  date: string;
  name: string;
  isMandatoryOff: boolean;
  description: string | null;
}

export interface CoverageRule extends ProcessCoverageRule {
  processId: string;
  dateOverride: string | null;
  dayOfWeek: number | null;
  note: string | null;
}

export interface Employee {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  role: string;
  isPodLead: boolean;
  podId: string | null;
  pod?: {
    id: string;
    code: string;
    name: string;
  } | null;
  leadingPod?: {
    id: string;
    code: string;
    name: string;
  } | null;
  contractType: "FULL_TIME" | "CONTRACT";
  weeklyWorkDays: number;
  maxConsecutiveDays: number;
  isActive: boolean;
  weeklyOffs: WeeklyOff[];
  _count?: {
    assignments: number;
    leaves: number;
    rosterShifts: number;
  };
}

export interface EmployeeFormData {
  employeeCode: string;
  name: string;
  email: string;
  role: string;
  isPodLead: boolean;
  podId: string;
  contractType: "FULL_TIME" | "CONTRACT";
  weeklyWorkDays: number;
  maxConsecutiveDays: number;
  weeklyOffs: number[];
}
