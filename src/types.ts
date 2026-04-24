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
