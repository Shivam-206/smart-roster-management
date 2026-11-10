import { Process, ProcessFormData } from "../types";
import { apiFetch } from "./client";

export async function fetchProcesses(params?: {
  search?: string;
  brandId?: string;
  calendarType?: string;
}): Promise<Process[]> {
  const query = new URLSearchParams();
  if (params?.search && params.search.trim()) {
    query.set("search", params.search.trim());
  }
  if (params?.brandId && params.brandId !== "ALL") {
    query.set("brandId", params.brandId);
  }
  if (params?.calendarType && params.calendarType !== "ALL") {
    query.set("calendarType", params.calendarType);
  }

  const res = await apiFetch(`/api/v1/processes?${query.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to fetch processes");
  }

  const json = await res.json();
  return json.data;
}

export async function fetchProcessById(id: string): Promise<Process> {
  const res = await apiFetch(`/api/v1/processes/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to fetch process details");
  }

  const json = await res.json();
  return json.data;
}

export async function createProcess(data: ProcessFormData): Promise<Process> {
  const res = await apiFetch("/api/v1/processes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to create process");
  }

  return json.data;
}

export async function updateProcess(id: string, data: Partial<ProcessFormData>): Promise<Process> {
  const res = await apiFetch(`/api/v1/processes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to update process");
  }

  return json.data;
}

export async function deleteProcess(id: string): Promise<string> {
  const res = await apiFetch(`/api/v1/processes/${id}`, {
    method: "DELETE",
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to delete process");
  }

  return json.message;
}
