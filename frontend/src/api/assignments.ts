import { AssignmentType, EmployeeProcessAssignment } from "../types";
import { apiFetch } from "./client";

export interface AssignmentFilters {
  employeeId?: string;
  processId?: string;
  brandId?: string;
  podId?: string;
  assignmentType?: AssignmentType | "ALL";
  search?: string;
}

export async function fetchAssignments(
  filters: AssignmentFilters = {}
): Promise<EmployeeProcessAssignment[]> {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== "ALL" && value.trim() !== "") {
      query.set(key, value.trim());
    }
  });

  const res = await apiFetch(`/api/v1/assignments?${query.toString()}`);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to fetch assignments");
  }
  return json.data;
}

export async function createAssignment(data: {
  employeeId: string;
  processId: string;
  assignmentType: AssignmentType;
}): Promise<EmployeeProcessAssignment> {
  const res = await apiFetch("/api/v1/assignments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to create assignment");
  }
  return json.data;
}

export async function updateAssignment(
  id: string,
  assignmentType: AssignmentType
): Promise<EmployeeProcessAssignment> {
  const res = await apiFetch(`/api/v1/assignments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignmentType }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to update assignment");
  }
  return json.data;
}

export async function deleteAssignment(id: string): Promise<string> {
  const res = await apiFetch(`/api/v1/assignments/${id}`, { method: "DELETE" });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to delete assignment");
  }
  return json.message;
}
