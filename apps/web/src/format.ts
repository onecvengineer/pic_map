import type { SerializedPhoto } from "./types";

export function cameraLabel(photo: SerializedPhoto): string {
  return [photo.metadata?.make, photo.metadata?.model].filter(Boolean).join(" ");
}

export function photoDate(photo: SerializedPhoto): string {
  return photo.metadata?.dateTimeOriginal || photo.metadata?.createDate || photo.metadata?.modifyDate || photo.metadata?.fileModifiedAt || "";
}

export function statusText(photo: SerializedPhoto): string {
  if (!photo.location) return "缺少位置";
  const source = photo.location.source === "exif" ? "EXIF" : photo.location.source === "manual" ? "手动" : "推断";
  const status = photo.location.status === "pending" ? "待确认" : "已确认";
  const confidence = photo.location.confidence ? ` ${Math.round(photo.location.confidence * 100)}%` : "";
  return `${source} ${status}${confidence}`;
}

export function exposureLabel(photo: SerializedPhoto): string {
  const metadata = photo.metadata || {};
  return [
    metadata.focalLengthMm ? `${round(metadata.focalLengthMm, 1)} mm` : "",
    metadata.aperture ? `f/${round(metadata.aperture, 1)}` : "",
    metadata.exposureTime ? formatExposure(metadata.exposureTime) : "",
    metadata.iso ? `ISO ${metadata.iso}` : "",
  ].filter(Boolean).join(" · ");
}

export function shortName(name: string, head = 11, tail = 7): string {
  return name.length > head + tail + 3 ? `${name.slice(0, head)}...${name.slice(-tail)}` : name;
}

export function dayTitle(value: string): string {
  if (value === "unknown") return "未知日期";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(date);
}

export function round(value: number, digits = 0): number {
  return Number.parseFloat(Number(value).toFixed(digits));
}

function formatExposure(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (value >= 1) return `${round(value, 1)}s`;
  const denominator = Math.round(1 / value);
  return `1/${denominator}s`;
}
