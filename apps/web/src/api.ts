import type { GpsFilter, PlaceSearchResult, SerializedPhoto, TimelineDay } from "./types";

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload as T;
}

export const api = {
  session: () => requestJson<{ authenticated: boolean }>("/api/session"),
  login: (password: string) => requestJson<{ ok: boolean }>("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  }),
  logout: () => requestJson<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  photos: (filters?: { query?: string; gps?: GpsFilter }) => {
    const params = new URLSearchParams();
    if (filters?.query) params.set("q", filters.query);
    if (filters?.gps) params.set("gps", filters.gps);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return requestJson<SerializedPhoto[]>(`/api/photos${suffix}`);
  },
  timeline: () => requestJson<{ days: TimelineDay[] }>("/api/timeline"),
  uploadPhoto: (file: File) => {
    const form = new FormData();
    form.append("file", file, file.name);
    return requestJson<{ photo: SerializedPhoto; duplicate: boolean }>("/api/photos/upload", {
      method: "POST",
      body: form,
    });
  },
  confirmLocation: (photoId: string) => requestJson<SerializedPhoto>(`/api/photos/${photoId}/confirm-location`, { method: "POST" }),
  clearLocation: (photoId: string) => requestJson<SerializedPhoto>(`/api/photos/${photoId}/clear-location`, { method: "POST" }),
  setLocation: (photoId: string, payload: { latitude: number; longitude: number; placeName?: string; status?: "confirmed" | "pending" }) => (
    requestJson<SerializedPhoto>(`/api/photos/${photoId}/location`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
  ),
  searchPlaces: (query: string) => requestJson<{ results: PlaceSearchResult[]; cached: boolean; provider: "amap" }>(
    `/api/places/search?q=${encodeURIComponent(query)}`,
  ),
  createExport: () => requestJson<{ id: string; path: string; photoCount: number; createdAt: string }>("/api/exports", { method: "POST" }),
};
