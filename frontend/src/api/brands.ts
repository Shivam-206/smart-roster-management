import { Brand, BrandFormData } from "../types";
import { apiFetch } from "./client";

export async function fetchBrands(params?: { search?: string; podId?: string }): Promise<Brand[]> {
  const query = new URLSearchParams();
  if (params?.search && params.search.trim()) {
    query.set("search", params.search.trim());
  }
  if (params?.podId && params.podId !== "ALL") {
    query.set("podId", params.podId);
  }

  const res = await apiFetch(`/api/v1/brands?${query.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to fetch brands");
  }

  const json = await res.json();
  return json.data;
}

export async function fetchBrandById(id: string): Promise<Brand> {
  const res = await apiFetch(`/api/v1/brands/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to fetch brand details");
  }

  const json = await res.json();
  return json.data;
}

export async function createBrand(data: BrandFormData): Promise<Brand> {
  const res = await apiFetch("/api/v1/brands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to create brand");
  }

  return json.data;
}

export async function updateBrand(id: string, data: Partial<BrandFormData>): Promise<Brand> {
  const res = await apiFetch(`/api/v1/brands/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to update brand");
  }

  return json.data;
}

export async function deleteBrand(id: string): Promise<string> {
  const res = await apiFetch(`/api/v1/brands/${id}`, {
    method: "DELETE",
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || "Failed to delete brand");
  }

  return json.message;
}
