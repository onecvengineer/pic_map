import type { PhotoRecord } from "@pic-map/shared";

export type SerializedPhoto = Omit<PhotoRecord, "metadata"> & {
  previewUrl?: string;
  originalUrl: string;
  metadata: Omit<PhotoRecord["metadata"], "raw">;
};

export interface TimelineDay {
  date: string;
  photos: SerializedPhoto[];
  deviceCount: number;
  placeCount: number;
  gpsCount: number;
  pendingCount: number;
}

export type GpsFilter = "all" | "with" | "without" | "inferred" | "pending";

export interface PlaceSearchResult {
  id: string;
  query: string;
  provider: "amap";
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  providerLatitude: number;
  providerLongitude: number;
  createdAt: string;
}
