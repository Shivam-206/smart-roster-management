import { Pod, PodDetails, PodFormData } from "../types";
import { apiFetch } from "./client";

export async function fetchPods(search?: string): Promise<Pod[]> {
  const query = new URLSearchParams();
  if (search && search.trim()) {
    query.set("search", search.trim());
  }

  const res = await apiFetch(`/api/v1/pods?${query.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to fetch pods");
  }

  const json = await res.json();
  return json.data;
}

export async function fetchPodById(id: string): Promise<PodDetails> {
  const res = await apiFetch(`/api/v1/pods/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to fetch pod details");
  }

  const json = await res.json();
  return json.data;
}

export async function createPod(data: PodFormData): Promise<Pod> {
  const res = await apiFetch("/api/v1/pods", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to create pod");
  }

  return json.data;
}

export async function updatePod(id: string, data: Partial<PodFormData>): Promise<Pod> {
  const res = await apiFetch(`/api/v1/pods/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to update pod");
  }

  return json.data;
}

export async function deletePod(id: string): Promise<string> {
  const res = await apiFetch(`/api/v1/pods/${id}`, {
    method: "DELETE",
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to delete pod");
  }

  return json.message;
}

export async function transferPodMembers(targetPodId: string, employeeIds: string[]): Promise<string> {
  const res = await apiFetch(`/api/v1/pods/${targetPodId}/members`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeIds }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to transfer employees");
  }

  return json.message;
}
