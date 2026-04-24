const state = {
  photos: [],
  selectedId: null,
  markers: new Map(),
};

const els = {
  input: document.querySelector("#photoInput"),
  dropzone: document.querySelector(".dropzone"),
  list: document.querySelector("#photoList"),
  search: document.querySelector("#searchInput"),
  gpsFilter: document.querySelector("#gpsFilter"),
  totalCount: document.querySelector("#totalCount"),
  gpsCount: document.querySelector("#gpsCount"),
  cameraCount: document.querySelector("#cameraCount"),
  mapTitle: document.querySelector("#mapTitle"),
  fitButton: document.querySelector("#fitButton"),
  detail: document.querySelector("#detail"),
};

const map = L.map("map", { zoomControl: false }).setView([31.2304, 121.4737], 4);
L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

els.input.addEventListener("change", () => handleFiles(els.input.files));
els.search.addEventListener("input", render);
els.gpsFilter.addEventListener("change", render);
els.fitButton.addEventListener("click", fitAllMarkers);

["dragenter", "dragover"].forEach((eventName) => {
  els.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropzone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  els.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropzone.classList.remove("dragging");
  });
});

els.dropzone.addEventListener("drop", (event) => {
  handleFiles(event.dataTransfer.files);
});

async function handleFiles(fileList) {
  const files = Array.from(fileList || []).filter((file) => file.type.startsWith("image/") || /\.(jpg|jpeg|heic|heif|cr3|cr2|arw|nef|tif|tiff|png)$/i.test(file.name));
  if (!files.length) return;

  els.mapTitle.textContent = "解析中...";
  const imported = await Promise.all(files.map(importPhoto));
  state.photos = [...imported, ...state.photos];
  state.selectedId = imported[0]?.id || state.selectedId;
  render();
  els.input.value = "";
}

async function importPhoto(file) {
  const id = `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`;
  const url = URL.createObjectURL(file);
  let metadata;
  try {
    metadata = await parseOnServer(file);
  } catch (error) {
    metadata = {
      parser: "server-error",
      warnings: [error instanceof Error ? error.message : String(error)],
    };
  }

  return normalizePhoto({
    id,
    url,
    name: file.name,
    size: file.size,
    type: file.type || file.name.split(".").pop().toUpperCase(),
    metadata,
  });
}

async function parseOnServer(file) {
  const form = new FormData();
  form.append("file", file, file.name);

  const response = await fetch("/api/parse", {
    method: "POST",
    body: form,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `解析失败：HTTP ${response.status}`);
  }

  return payload;
}

function normalizePhoto({ id, url, name, size, type, metadata }) {
  const warnings = Array.isArray(metadata.warnings) ? metadata.warnings : [];
  return {
    id,
    url,
    name,
    size,
    type,
    parser: metadata.parser || "unknown",
    make: metadata.make || "",
    model: metadata.model || "",
    software: metadata.software || "",
    lens: metadata.lens || "",
    cameraSerialNumber: metadata.cameraSerialNumber || "",
    lensSerialNumber: metadata.lensSerialNumber || "",
    dateTime: metadata.dateTimeOriginal || metadata.createDate || metadata.modifyDate || "",
    imageWidth: metadata.imageWidth,
    imageHeight: metadata.imageHeight,
    orientation: metadata.orientation,
    exposure: formatExposure(metadata.exposureTime),
    aperture: metadata.aperture ? `f/${round(metadata.aperture, 1)}` : "",
    iso: metadata.iso ? String(metadata.iso) : "",
    focalLength: metadata.focalLengthMm ? `${round(metadata.focalLengthMm, 1)} mm` : "",
    latitude: metadata.gps?.latitude ?? null,
    longitude: metadata.gps?.longitude ?? null,
    altitude: metadata.gps?.altitude ?? null,
    gpsTime: metadata.gps?.timestamp || "",
    error: warnings.join("；"),
    raw: metadata,
  };
}

function render() {
  const filtered = filteredPhotos();
  renderMetrics();
  renderList(filtered);
  renderMarkers(filtered);
  renderDetail();
}

function filteredPhotos() {
  const query = els.search.value.trim().toLowerCase();
  const gpsMode = els.gpsFilter.value;

  return state.photos.filter((photo) => {
    const hasGps = hasCoordinates(photo);
    const matchesGps = gpsMode === "all" || (gpsMode === "with" && hasGps) || (gpsMode === "without" && !hasGps);
    const haystack = [photo.name, photo.make, photo.model, photo.dateTime, photo.lens, photo.parser].join(" ").toLowerCase();
    return matchesGps && (!query || haystack.includes(query));
  });
}

function renderMetrics() {
  const cameraNames = new Set(state.photos.map(cameraLabel).filter(Boolean));
  els.totalCount.textContent = state.photos.length;
  els.gpsCount.textContent = state.photos.filter(hasCoordinates).length;
  els.cameraCount.textContent = cameraNames.size;
  els.mapTitle.textContent = state.photos.length ? `${els.gpsCount.textContent} 张照片可上图` : "等待照片";
}

function renderList(photos) {
  if (!photos.length) {
    els.list.className = "photo-list empty";
    els.list.innerHTML = `<div class="empty-state"><b>没有匹配照片</b><span>上传 iPhone 原图、Canon JPG/CR3 或换个筛选条件。</span></div>`;
    return;
  }

  els.list.className = "photo-list";
  els.list.innerHTML = photos.map((photo) => `
    <button class="photo-item ${photo.id === state.selectedId ? "active" : ""}" type="button" data-id="${photo.id}">
      <img class="thumb" src="${photo.url}" alt="">
      <span>
        <span class="photo-name">${escapeHtml(photo.name)}</span>
        <span class="photo-meta">
          <span>${escapeHtml(cameraLabel(photo) || "未知设备")}</span>
          <span>${escapeHtml(photo.dateTime || "无拍摄时间")}</span>
          <span>${escapeHtml(photo.parser)}</span>
        </span>
        <span class="badge ${hasCoordinates(photo) ? "" : "missing"}">${hasCoordinates(photo) ? "GPS OK" : "NO GPS"}</span>
      </span>
    </button>
  `).join("");

  els.list.querySelectorAll(".photo-item").forEach((item) => {
    item.addEventListener("click", () => selectPhoto(item.dataset.id));
  });
}

function renderMarkers(photos) {
  state.markers.forEach((marker) => marker.remove());
  state.markers.clear();

  photos.filter(hasCoordinates).forEach((photo) => {
    const marker = L.marker([photo.latitude, photo.longitude]).addTo(map);
    marker.bindPopup(`
      <div class="popup">
        <img src="${photo.url}" alt="">
        <b>${escapeHtml(photo.name)}</b>
        <span>${escapeHtml(cameraLabel(photo) || "未知设备")}</span>
      </div>
    `);
    marker.on("click", () => selectPhoto(photo.id));
    state.markers.set(photo.id, marker);
  });

  if (state.markers.size) fitAllMarkers();
}

function renderDetail() {
  const photo = state.photos.find((item) => item.id === state.selectedId);
  if (!photo) {
    els.detail.innerHTML = "<span>选择一张照片查看详情</span>";
    return;
  }

  els.detail.innerHTML = `
    <img src="${photo.url}" alt="">
    <div>
      <h2>${escapeHtml(photo.name)}</h2>
      <dl>
        <div><dt>解析器</dt><dd>${escapeHtml(photo.parser)}</dd></div>
        <div><dt>设备</dt><dd>${escapeHtml(cameraLabel(photo) || "未知")}</dd></div>
        <div><dt>时间</dt><dd>${escapeHtml(photo.dateTime || "无")}</dd></div>
        <div><dt>尺寸</dt><dd>${escapeHtml(photo.imageWidth && photo.imageHeight ? `${photo.imageWidth} x ${photo.imageHeight}` : "无")}</dd></div>
        <div><dt>坐标</dt><dd>${hasCoordinates(photo) ? `${round(photo.latitude, 6)}, ${round(photo.longitude, 6)}` : "无"}</dd></div>
        <div><dt>参数</dt><dd>${escapeHtml([photo.focalLength, photo.aperture, photo.exposure, photo.iso && `ISO ${photo.iso}`].filter(Boolean).join(" · ") || "无")}</dd></div>
        <div><dt>镜头</dt><dd>${escapeHtml(photo.lens || "无")}</dd></div>
        <div><dt>备注</dt><dd>${escapeHtml(photo.error || "EXIF 读取正常")}</dd></div>
      </dl>
    </div>
  `;
}

function selectPhoto(id) {
  state.selectedId = id;
  renderList(filteredPhotos());
  renderDetail();

  const photo = state.photos.find((item) => item.id === id);
  const marker = state.markers.get(id);
  if (photo && marker && hasCoordinates(photo)) {
    map.setView([photo.latitude, photo.longitude], Math.max(map.getZoom(), 13), { animate: true });
    marker.openPopup();
  }
}

function fitAllMarkers() {
  const coordinates = Array.from(state.markers.values()).map((marker) => marker.getLatLng());
  if (!coordinates.length) return;
  map.fitBounds(L.latLngBounds(coordinates), { padding: [48, 48], maxZoom: 14 });
}

function hasCoordinates(photo) {
  return Number.isFinite(photo.latitude) && Number.isFinite(photo.longitude);
}

function cameraLabel(photo) {
  return [photo.make, photo.model].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function formatExposure(value) {
  if (!value) return "";
  if (value < 1) return `1/${Math.round(1 / value)} s`;
  return `${round(value, 2)} s`;
}

function round(value, places) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
