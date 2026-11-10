import { apiFetch } from "./client";

export interface GeneratedRosterShift {
  id: string;
  shiftDate: string;
  employeeId: string;
  processId: string | null;
  status: "WORKING" | "WEEKLY_OFF" | "LEAVE" | "COMP_OFF" | "HOLIDAY";
  shiftType: "REGULAR" | "BACKUP_COVERAGE" | "OVERTIME";
  employee: { id: string; employeeCode: string; name: string };
  process: {
    id: string;
    code: string;
    name: string;
    brand: { id: string; code: string; name: string };
  } | null;
}

export interface GeneratedRosterConflict {
  id: string;
  shiftDate: string;
  severity: "HARD_ERROR" | "SOFT_WARNING";
  category: string;
  processId: string | null;
  employeeId: string | null;
  message: string;
  detailsJson: string | null;
  isResolved?: boolean;
  process: { id: string; code: string; name: string } | null;
  employee: { id: string; employeeCode: string; name: string } | null;
}

export interface RosterReplacement {
  id: string;
  employeeCode: string;
  name: string;
  assignmentType: "PRIMARY" | "SECONDARY_BACKUP" | "FLOAT";
  priorityRank: number;
}

export interface RosterRevalidationResult {
  conflicts: Array<Omit<GeneratedRosterConflict, "process" | "employee">>;
  recommendations: Array<{
    shiftId: string;
    date: string;
    processId: string;
    employeeId: string;
    reason: string;
    replacements: RosterReplacement[];
  }>;
  summary: {
    workingShifts: number;
    activeConflicts: number;
    resolvedConflicts: number;
    unfilledPositions: number;
    datesChecked: number;
  };
}

export interface GeneratedRoster {
  id: string;
  monthYear: string;
  status: string;
  generatedAt: string;
  shifts: GeneratedRosterShift[];
  conflicts: GeneratedRosterConflict[];
  summary: {
    totalAssignedShifts: number;
    totalScheduleEntries: number;
    totalConflicts: number;
    unfilledPositions: number;
    processDays: number;
  };
}

export type RosterShiftStatus = "WORKING" | "WEEKLY_OFF" | "LEAVE" | "COMP_OFF" | "HOLIDAY";

export interface RosterViewShift extends GeneratedRosterShift {
  employee: GeneratedRosterShift["employee"] & {
    pod: { id: string; code: string; name: string } | null;
  };
  process: (NonNullable<GeneratedRosterShift["process"]> & {
    brand: NonNullable<GeneratedRosterShift["process"]>["brand"] & {
      podId: string;
      pod: { id: string; code: string; name: string };
    };
  }) | null;
}

export interface RosterViewData {
  roster: Pick<GeneratedRoster, "id" | "monthYear" | "status" | "generatedAt">;
  employees: Array<{
    id: string;
    employeeCode: string;
    name: string;
    pod: { id: string; code: string; name: string } | null;
  }>;
  processes: Array<{
    id: string;
    code: string;
    name: string;
    calendarType: string;
    defaultMinStaff: number;
    brand: { id: string; code: string; name: string; podId: string };
  }>;
  shifts: RosterViewShift[];
  conflicts: GeneratedRosterConflict[];
  staffingBasis: string | null;
  processStaffing: Array<{
    date: string;
    processId: string;
    processCode: string;
    processName: string;
    brand: { id: string; code: string; name: string; podId: string };
    requiredStaffCount: number;
    actualStaffCount: number;
    unfilledPositions: number;
  }>;
  summary: {
    workingShifts: number;
    weeklyOffs: number;
    leaves: number;
    compOffs: number;
    holidays: number;
    conflicts: number;
    unfilledPositions: number;
  };
}

export async function fetchRosterView(params: {
  month: number;
  year: number;
  podId?: string;
  brandId?: string;
  processId?: string;
  employeeId?: string;
}): Promise<RosterViewData> {
  const query = new URLSearchParams({ month: String(params.month), year: String(params.year) });
  if (params.podId) query.set("podId", params.podId);
  if (params.brandId) query.set("brandId", params.brandId);
  if (params.processId) query.set("processId", params.processId);
  if (params.employeeId) query.set("employeeId", params.employeeId);
  const response = await apiFetch(`/api/v1/rosters?${query.toString()}`);
  const json = await response.json();
  if (!response.ok) throw new Error(json.message || "Failed to fetch saved roster");
  return json.data;
}

async function rosterRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(url, init);
  const json = await response.json();
  if (!response.ok) throw new Error(json.message || "Roster request failed");
  return json.data;
}

export async function fetchRosterReplacements(
  rosterId: string,
  params: { date: string; processId: string; shiftId?: string; excludeEmployeeId?: string }
): Promise<{ candidates: RosterReplacement[]; staffing: { required: number; assigned: number; unfilled: number } }> {
  const query = new URLSearchParams({ date: params.date, processId: params.processId });
  if (params.shiftId) query.set("shiftId", params.shiftId);
  if (params.excludeEmployeeId) query.set("excludeEmployeeId", params.excludeEmployeeId);
  return rosterRequest(`/api/v1/rosters/${rosterId}/replacements?${query.toString()}`);
}

export async function replaceRosterShift(rosterId: string, shiftId: string, employeeId: string): Promise<GeneratedRosterShift> {
  return rosterRequest(`/api/v1/rosters/${rosterId}/shifts/${shiftId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId }),
  });
}

export async function fillRosterPosition(
  rosterId: string,
  data: { shiftDate: string; processId: string; employeeId: string }
): Promise<GeneratedRosterShift> {
  return rosterRequest(`/api/v1/rosters/${rosterId}/shifts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function removeRosterShift(rosterId: string, shiftId: string): Promise<unknown> {
  return rosterRequest(`/api/v1/rosters/${rosterId}/shifts/${shiftId}`, { method: "DELETE" });
}

export async function revalidateRoster(rosterId: string): Promise<RosterRevalidationResult> {
  return rosterRequest(`/api/v1/rosters/${rosterId}/revalidate`, { method: "POST" });
}

export async function fetchRosterConflicts(
  rosterId: string,
  status: "active" | "resolved" | "all" = "active"
): Promise<{ data: Array<GeneratedRosterConflict & { isResolved: boolean }>; summary: { active: number; resolved: number } }> {
  const response = await apiFetch(`/api/v1/rosters/${rosterId}/conflicts?status=${status}`);
  const json = await response.json();
  if (!response.ok) throw new Error(json.message || "Failed to fetch roster conflicts");
  return { data: json.data, summary: json.summary };
}

export async function generateRoster(month: number, year: number): Promise<GeneratedRoster> {
  const response = await apiFetch("/api/v1/rosters/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month, year }),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.message || "Failed to generate monthly roster");
  }
  return json.data;
}
