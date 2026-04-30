export type MetadataParser = "exiftool" | "jpeg-fallback" | "unsupported";

export interface GpsMetadata {
  latitude: number;
  longitude: number;
  altitude?: number;
  timestamp?: string;
}

export interface PhotoMetadata {
  sourcePath: string;
  fileName: string;
  fileSize: number;
  fileModifiedAt?: string;
  mimeGuess: string;
  parser: MetadataParser;
  imageWidth?: number;
  imageHeight?: number;
  orientation?: number | string;
  make?: string;
  model?: string;
  software?: string;
  cameraSerialNumber?: string;
  lens?: string;
  lensSerialNumber?: string;
  dateTimeOriginal?: string;
  createDate?: string;
  modifyDate?: string;
  offsetTimeOriginal?: string;
  subSecTimeOriginal?: string;
  focalLengthMm?: number;
  aperture?: number;
  exposureTime?: number;
  iso?: number;
  gps?: GpsMetadata;
  warnings: string[];
  raw?: Record<string, unknown>;
}

export type LocationSource = "exif" | "inferred" | "manual";
export type LocationStatus = "confirmed" | "pending" | "missing";

export interface PhotoLocation {
  latitude: number;
  longitude: number;
  altitude?: number;
  timestamp?: string;
  source: LocationSource;
  status: LocationStatus;
  confidence?: number;
  referencePhotoId?: string;
  placeName?: string;
  updatedAt: string;
}

export interface PhotoRecord {
  id: string;
  sha256: string;
  fileName: string;
  fileSize: number;
  mimeGuess: string;
  originalPath: string;
  previewPath?: string;
  previewMime?: string;
  importedAt: string;
  duplicateOf?: string;
  metadata: PhotoMetadata;
  locationStatus: LocationStatus;
  location?: PhotoLocation;
}

export interface ImportRecord {
  id: string;
  photoId: string;
  sha256: string;
  fileName: string;
  fileSize: number;
  duplicate: boolean;
  importedAt: string;
}

export interface PlaceCacheRecord {
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

export interface ExportRecord {
  id: string;
  path: string;
  photoCount: number;
  createdAt: string;
}

export interface PhotoDatabase {
  version: 1;
  photos: PhotoRecord[];
  imports: ImportRecord[];
  placeCache: PlaceCacheRecord[];
  exports: ExportRecord[];
}
