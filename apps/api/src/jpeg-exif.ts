import type { GpsMetadata, PhotoMetadata } from "@pic-map/shared";

interface ParsedIfd {
  [key: string]: unknown;
}

export function parseJpegExif(buffer: Buffer): Partial<PhotoMetadata> {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint16(0, false) !== 0xffd8) {
    throw new Error("Not a JPEG file");
  }

  const dimensions = readJpegDimensions(view);
  let offset = 2;
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;

    const marker = view.getUint8(offset + 1);
    const size = view.getUint16(offset + 2, false);
    const segmentStart = offset + 4;

    if (marker === 0xe1 && readAscii(view, segmentStart, 6) === "Exif\0\0") {
      return { ...dimensions, ...parseTiff(view, segmentStart + 6) };
    }

    offset += 2 + size;
  }

  return { ...dimensions, warnings: ["No EXIF segment found in JPEG"] };
}

function parseTiff(view: DataView, tiffStart: number): Partial<PhotoMetadata> {
  const byteOrder = readAscii(view, tiffStart, 2);
  const littleEndian = byteOrder === "II";
  if (!littleEndian && byteOrder !== "MM") {
    throw new Error("Invalid TIFF byte order");
  }

  const read32 = (offset: number) => view.getUint32(offset, littleEndian);
  const firstIfdOffset = read32(tiffStart + 4);
  const ifd0 = parseIfd(view, tiffStart + firstIfdOffset, tiffStart, littleEndian);
  const exif = typeof ifd0.ExifIFDPointer === "number"
    ? parseIfd(view, tiffStart + ifd0.ExifIFDPointer, tiffStart, littleEndian)
    : {};
  const gps = typeof ifd0.GPSInfoIFDPointer === "number"
    ? parseIfd(view, tiffStart + ifd0.GPSInfoIFDPointer, tiffStart, littleEndian, true)
    : {};

  const gpsMetadata = buildGps(gps);
  const warnings = gpsMetadata ? [] : ["No GPS coordinates found"];

  return {
    parser: "jpeg-fallback",
    make: text(ifd0.Make),
    model: text(ifd0.Model),
    software: text(ifd0.Software),
    orientation: numberValue(ifd0.Orientation),
    cameraSerialNumber: text(exif.BodySerialNumber),
    lens: text(exif.LensModel),
    lensSerialNumber: text(exif.LensSerialNumber),
    dateTimeOriginal: text(exif.DateTimeOriginal) || text(ifd0.DateTime),
    createDate: text(exif.CreateDate),
    modifyDate: text(ifd0.DateTime),
    offsetTimeOriginal: text(exif.OffsetTimeOriginal),
    subSecTimeOriginal: text(exif.SubSecTimeOriginal),
    focalLengthMm: numberValue(exif.FocalLength),
    aperture: numberValue(exif.FNumber),
    exposureTime: numberValue(exif.ExposureTime),
    iso: numberValue(exif.ISOSpeedRatings),
    gps: gpsMetadata,
    warnings,
  };
}

function parseIfd(
  view: DataView,
  offset: number,
  tiffStart: number,
  littleEndian: boolean,
  isGps = false,
): ParsedIfd {
  const read16 = (position: number) => view.getUint16(position, littleEndian);
  const read32 = (position: number) => view.getUint32(position, littleEndian);
  const entries = read16(offset);
  const result: ParsedIfd = {};

  for (let index = 0; index < entries; index += 1) {
    const entry = offset + 2 + index * 12;
    if (entry + 12 > view.byteLength) break;

    const tag = read16(entry);
    const type = read16(entry + 2);
    const count = read32(entry + 4);
    const valueOffset = entry + 8;
    const valueSize = typeSize(type) * count;
    const dataOffset = valueSize <= 4 ? valueOffset : tiffStart + read32(valueOffset);
    const name = tagName(tag, isGps);

    if (!name || dataOffset < 0 || dataOffset >= view.byteLength) continue;
    result[name] = readValue(view, dataOffset, type, count, littleEndian);
  }

  return result;
}

function readValue(
  view: DataView,
  offset: number,
  type: number,
  count: number,
  littleEndian: boolean,
): unknown {
  const read16 = (position: number) => view.getUint16(position, littleEndian);
  const read32 = (position: number) => view.getUint32(position, littleEndian);

  if (type === 2) return readAscii(view, offset, count).replace(/\0+$/, "");
  if (type === 3) return count === 1 ? read16(offset) : Array.from({ length: count }, (_, index) => read16(offset + index * 2));
  if (type === 4) return count === 1 ? read32(offset) : Array.from({ length: count }, (_, index) => read32(offset + index * 4));
  if (type === 5) {
    const rational = (position: number) => safeDivide(read32(position), read32(position + 4));
    return count === 1 ? rational(offset) : Array.from({ length: count }, (_, index) => rational(offset + index * 8));
  }
  if (type === 7) return Array.from({ length: count }, (_, index) => view.getUint8(offset + index));
  if (type === 10) {
    const rational = (position: number) => safeDivide(view.getInt32(position, littleEndian), view.getInt32(position + 4, littleEndian));
    return count === 1 ? rational(offset) : Array.from({ length: count }, (_, index) => rational(offset + index * 8));
  }

  return undefined;
}

function tagName(tag: number, isGps: boolean): string | undefined {
  if (isGps) {
    return {
      0x0001: "GPSLatitudeRef",
      0x0002: "GPSLatitude",
      0x0003: "GPSLongitudeRef",
      0x0004: "GPSLongitude",
      0x0005: "GPSAltitudeRef",
      0x0006: "GPSAltitude",
      0x0007: "GPSTimeStamp",
      0x001d: "GPSDateStamp",
    }[tag];
  }

  return {
    0x010f: "Make",
    0x0110: "Model",
    0x0112: "Orientation",
    0x0131: "Software",
    0x0132: "DateTime",
    0x829a: "ExposureTime",
    0x829d: "FNumber",
    0x8825: "GPSInfoIFDPointer",
    0x8827: "ISOSpeedRatings",
    0x8769: "ExifIFDPointer",
    0x9003: "DateTimeOriginal",
    0x9004: "CreateDate",
    0x9011: "OffsetTimeOriginal",
    0x9291: "SubSecTimeOriginal",
    0x920a: "FocalLength",
    0xa431: "BodySerialNumber",
    0xa434: "LensModel",
    0xa435: "LensSerialNumber",
  }[tag];
}

function readJpegDimensions(view: DataView): Partial<PhotoMetadata> {
  let offset = 2;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

  while (offset + 8 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;

    const marker = view.getUint8(offset + 1);
    const size = view.getUint16(offset + 2, false);
    if (sofMarkers.has(marker)) {
      return {
        imageHeight: view.getUint16(offset + 5, false),
        imageWidth: view.getUint16(offset + 7, false),
      };
    }

    offset += 2 + size;
  }

  return {};
}

function buildGps(gps: ParsedIfd): GpsMetadata | undefined {
  const latitude = gpsCoordinate(gps.GPSLatitude, gps.GPSLatitudeRef);
  const longitude = gpsCoordinate(gps.GPSLongitude, gps.GPSLongitudeRef);
  if (latitude === undefined || longitude === undefined) return undefined;

  const altitude = numberValue(gps.GPSAltitude);
  const time = Array.isArray(gps.GPSTimeStamp)
    ? gps.GPSTimeStamp.map((part) => String(Math.round(Number(part))).padStart(2, "0")).join(":")
    : undefined;
  const date = text(gps.GPSDateStamp);

  return {
    latitude,
    longitude,
    ...(altitude !== undefined ? { altitude } : {}),
    ...(time || date ? { timestamp: [date, time].filter(Boolean).join(" ") } : {}),
  };
}

function gpsCoordinate(value: unknown, ref: unknown): number | undefined {
  if (!Array.isArray(value) || value.length < 3 || typeof ref !== "string") return undefined;
  const coordinate = Number(value[0]) + Number(value[1]) / 60 + Number(value[2]) / 3600;
  return /S|W/.test(ref) ? -coordinate : coordinate;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value) && typeof value[0] === "number" && Number.isFinite(value[0])) return value[0];
  return undefined;
}

function typeSize(type: number): number {
  return { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 10: 8 }[type] || 0;
}

function readAscii(view: DataView, offset: number, length: number): string {
  let textValue = "";
  for (let index = 0; index < length && offset + index < view.byteLength; index += 1) {
    textValue += String.fromCharCode(view.getUint8(offset + index));
  }
  return textValue;
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
