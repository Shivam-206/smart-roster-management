import {
  CoverageRule,
  EmployeeLeaveRecord,
  EmployeeWeeklyOffRecord,
  LeaveStatus,
  LeaveType,
  PublicHoliday,
} from "../types";
import { apiFetch } from "./client";

async function requestData<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(url, init);
  const json = await response.json();
  if (!response.ok) throw new Error(json.message || "Availability request failed");
  return json.data ?? json.message;
}

function jsonBody(method: string, data: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

export async function fetchWeeklyOffs(filters: { employeeId?: string; date?: string } = {}): Promise<EmployeeWeeklyOffRecord[]> {
  const query = new URLSearchParams();
  if (filters.employeeId && filters.employeeId !== "ALL") query.set("employeeId", filters.employeeId);
  if (filters.date) query.set("date", filters.date);
  return requestData<EmployeeWeeklyOffRecord[]>(`/api/v1/availability/weekly-offs?${query}`);
}

export function saveWeeklyOff(data: {
  employeeId?: string;
  dayOfWeek?: number;
  isStandard?: boolean;
  specificDate?: string | null;
}, id?: string): Promise<EmployeeWeeklyOffRecord> {
  return requestData(
    id ? `/api/v1/availability/weekly-offs/${id}` : "/api/v1/availability/weekly-offs",
    jsonBody(id ? "PATCH" : "POST", data)
  );
}

export function deleteWeeklyOff(id: string): Promise<string> {
  return requestData(`/api/v1/availability/weekly-offs/${id}`, { method: "DELETE" });
}

export async function fetchLeaves(filters: { employeeId?: string; startDate?: string; endDate?: string } = {}): Promise<EmployeeLeaveRecord[]> {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== "ALL") query.set(key, value);
  });
  return requestData<EmployeeLeaveRecord[]>(`/api/v1/availability/leaves?${query}`);
}

export function saveLeave(data: {
  employeeId?: string;
  startDate?: string;
  endDate?: string;
  leaveType?: LeaveType;
  status?: LeaveStatus;
  reason?: string;
}, id?: string): Promise<EmployeeLeaveRecord> {
  return requestData(
    id ? `/api/v1/availability/leaves/${id}` : "/api/v1/availability/leaves",
    jsonBody(id ? "PATCH" : "POST", data)
  );
}

export function deleteLeave(id: string): Promise<string> {
  return requestData(`/api/v1/availability/leaves/${id}`, { method: "DELETE" });
}

export async function fetchHolidays(filters: {
  search?: string;
  year?: string;
  from?: string;
  to?: string;
} = {}): Promise<PublicHoliday[]> {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  return requestData<PublicHoliday[]>(`/api/v1/holidays?${query}`);
}

export function saveHoliday(data: {
  date?: string;
  name?: string;
  isMandatoryOff?: boolean;
  description?: string;
}, id?: string): Promise<PublicHoliday> {
  return requestData(
    id ? `/api/v1/holidays/${id}` : "/api/v1/holidays",
    jsonBody(id ? "PATCH" : "POST", data)
  );
}

export function deleteHoliday(id: string): Promise<string> {
  return requestData(`/api/v1/holidays/${id}`, { method: "DELETE" });
}

export async function fetchCoverageRules(processId: string): Promise<CoverageRule[]> {
  return requestData<CoverageRule[]>(`/api/v1/processes/${processId}/coverage-rules`);
}

export function saveCoverageRule(data: {
  dateOverride?: string | null;
  dayOfWeek?: number | null;
  requiredStaffCount?: number;
  note?: string | null;
}, processId: string, id?: string): Promise<CoverageRule> {
  return requestData(
    id ? `/api/v1/processes/coverage-rules/${id}` : `/api/v1/processes/${processId}/coverage-rules`,
    jsonBody(id ? "PATCH" : "POST", data)
  );
}

export function deleteCoverageRule(id: string): Promise<string> {
  return requestData(`/api/v1/processes/coverage-rules/${id}`, { method: "DELETE" });
}

export interface ProcessScheduleForDate {
  processId: string;
  date: string;
  calendarType: string;
  operates: boolean;
  requiredStaffCount: number;
}

export function fetchProcessSchedule(processId: string, date: string): Promise<ProcessScheduleForDate> {
  return requestData(`/api/v1/processes/${processId}/calendar?date=${encodeURIComponent(date)}`, undefined);
}
