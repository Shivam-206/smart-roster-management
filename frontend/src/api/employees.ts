import { Employee, EmployeeFormData, Pod } from "../types";

export async function fetchEmployees(params?: {
  search?: string;
  podId?: string;
}): Promise<Employee[]> {
  const query = new URLSearchParams();
  if (params?.search && params.search.trim()) {
    query.set("search", params.search.trim());
  }
  if (params?.podId && params.podId !== "ALL") {
    query.set("podId", params.podId);
  }

  const res = await fetch(`/api/v1/employees?${query.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to fetch employees");
  }

  const json = await res.json();
  return json.data;
}

export async function fetchPods(): Promise<Pod[]> {
  const res = await fetch("/api/v1/pods");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to fetch operational pods");
  }

  const json = await res.json();
  return json.data;
}

export async function createEmployee(data: EmployeeFormData): Promise<Employee> {
  const res = await fetch("/api/v1/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to create employee");
  }

  return json.data;
}

export async function updateEmployee(
  id: string,
  data: Partial<EmployeeFormData>
): Promise<Employee> {
  const res = await fetch(`/api/v1/employees/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to update employee");
  }

  return json.data;
}

export async function deleteEmployee(id: string): Promise<string> {
  const res = await fetch(`/api/v1/employees/${id}`, {
    method: "DELETE",
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to delete employee");
  }

  return json.message;
}
