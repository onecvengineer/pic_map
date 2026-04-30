import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import L from "leaflet";
import { api } from "./api";
import { cameraLabel, dayTitle, exposureLabel, photoDate, round, shortName, statusText } from "./format";
import type { GpsFilter, PlaceSearchResult, SerializedPhoto, TimelineDay } from "./types";
import styles from "./App.module.css";

type View = "map" | "timeline";
type MobilePanel = "map" | "timeline" | "upload" | "search" | "detail";

const supportedImage = /\.(jpg|jpeg|heic|heif|cr3|cr2|arw|nef|tif|tiff|png|gif|webp)$/i;

export function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkedSession, setCheckedSession] = useState(false);
  const [photos, setPhotos] = useState<SerializedPhoto[]>([]);
  const [timeline, setTimeline] = useState<TimelineDay[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [activeView, setActiveView] = useState<View>("map");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("map");
  const [query, setQuery] = useState("");
  const [gpsFilter, setGpsFilter] = useState<GpsFilter>("all");
  const [uploadStatus, setUploadStatus] = useState("等待上传");
  const [selectedPlace, setSelectedPlace] = useState<PlaceSearchResult>();

  useEffect(() => {
    api.session()
      .then((session) => setAuthenticated(session.authenticated))
      .finally(() => setCheckedSession(true));
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    void refreshLibrary();
  }, [authenticated]);

  async function refreshLibrary() {
    const [nextPhotos, nextTimeline] = await Promise.all([api.photos(), api.timeline()]);
    setPhotos(nextPhotos);
    setTimeline(nextTimeline.days);
    setSelectedId((current) => current || nextPhotos[0]?.id);
  }

  const filteredPhotos = useMemo(() => filterPhotos(photos, query, gpsFilter), [photos, query, gpsFilter]);
  const selectedPhoto = photos.find((photo) => photo.id === selectedId);

  function selectPhoto(photoId: string, options: { jumpToMap?: boolean } = {}) {
    setSelectedId(photoId);
    const photo = photos.find((item) => item.id === photoId);
    if (options.jumpToMap && photo?.location) {
      setActiveView("map");
      setMobilePanel("map");
    }
  }

  async function handleLogout() {
    await api.logout().catch(() => undefined);
    setAuthenticated(false);
    setPhotos([]);
    setTimeline([]);
  }

  if (!checkedSession) return <div className={styles.splash}>Pic Map</div>;

  if (!authenticated) {
    return <LoginView onLogin={() => setAuthenticated(true)} />;
  }

  return (
    <main className={styles.shell} data-view={activeView} data-mobile-panel={mobilePanel}>
      <header className={styles.topbar}>
        <h1>照片地图</h1>
        <nav className={styles.segmented} aria-label="主导航">
          <button className={activeView === "map" ? styles.active : ""} type="button" onClick={() => { setActiveView("map"); setMobilePanel("map"); }}>
            地图工作台
          </button>
          <button className={activeView === "timeline" ? styles.active : ""} type="button" onClick={() => { setActiveView("timeline"); setMobilePanel("timeline"); }}>
            旅行时间轴
          </button>
        </nav>
        <button className={styles.logout} type="button" onClick={handleLogout}>退出</button>
      </header>

      <Sidebar
        gpsFilter={gpsFilter}
        query={query}
        photos={photos}
        filteredPhotos={filteredPhotos}
        uploadStatus={uploadStatus}
        onGpsFilterChange={setGpsFilter}
        onQueryChange={setQuery}
        onUploaded={async (files) => {
          const targets = Array.from(files).filter((file) => file.type.startsWith("image/") || supportedImage.test(file.name));
          for (let index = 0; index < targets.length; index += 1) {
            setUploadStatus(`上传 ${index + 1}/${targets.length}`);
            await api.uploadPhoto(targets[index]);
          }
          setUploadStatus(targets.length ? `已导入 ${targets.length} 张` : "等待上传");
          await refreshLibrary();
        }}
        onPlaceSelected={setSelectedPlace}
        onConfirmVisible={async () => {
          for (const photo of filteredPhotos.filter((item) => item.locationStatus === "pending" && item.location)) {
            await api.confirmLocation(photo.id);
          }
          await refreshLibrary();
        }}
        onSelectPhoto={selectPhoto}
      />

      <MapWorkbench
        active={activeView === "map"}
        photos={filteredPhotos}
        selectedPhoto={selectedPhoto}
        onSelectPhoto={selectPhoto}
      />

      <TimelineView
        active={activeView === "timeline"}
        days={timeline}
        photos={photos}
        selectedId={selectedId}
        onSelectPhoto={(photo) => selectPhoto(photo.id, { jumpToMap: Boolean(photo.location) })}
        onExport={async () => {
          const record = await api.createExport();
          setUploadStatus(`导出 ${record.id}`);
        }}
      />

      <DetailPanel
        photo={selectedPhoto}
        selectedPlace={selectedPlace}
        onChanged={refreshLibrary}
      />

      <MobileTabs active={mobilePanel} onChange={(panel) => {
        setMobilePanel(panel);
        if (panel === "map") setActiveView("map");
        if (panel === "timeline") setActiveView("timeline");
      }} />
    </main>
  );
}

function LoginView({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api.login(password);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className={styles.loginPage}>
      <form className={styles.loginCard} onSubmit={submit}>
        <p>Private Atlas</p>
        <h1>Pic Map</h1>
        <label>
          <span>访问密码</span>
          <input value={password} type="password" autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} />
        </label>
        <button type="submit">登录</button>
        <small>{error}</small>
      </form>
    </main>
  );
}

function Sidebar(props: {
  gpsFilter: GpsFilter;
  query: string;
  photos: SerializedPhoto[];
  filteredPhotos: SerializedPhoto[];
  uploadStatus: string;
  onGpsFilterChange: (value: GpsFilter) => void;
  onQueryChange: (value: string) => void;
  onUploaded: (files: FileList) => Promise<void>;
  onPlaceSelected: (place: PlaceSearchResult) => void;
  onConfirmVisible: () => Promise<void>;
  onSelectPhoto: (id: string) => void;
}) {
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeError, setPlaceError] = useState("");
  const [places, setPlaces] = useState<PlaceSearchResult[]>([]);
  const pending = props.filteredPhotos.filter((photo) => photo.locationStatus === "pending");

  async function searchPlaces(event: FormEvent) {
    event.preventDefault();
    if (!placeQuery.trim()) return;
    setPlaceError("");
    try {
      const response = await api.searchPlaces(placeQuery.trim());
      setPlaces(response.results);
    } catch (error) {
      setPlaces([]);
      setPlaceError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <aside className={styles.sidebar}>
      <section className={styles.sideBlock}>
        <div className={styles.blockHeader}><h2>导入</h2><span>{props.uploadStatus}</span></div>
        <label className={styles.dropzone}>
          <input type="file" multiple accept="image/*,.jpg,.jpeg,.heic,.heif,.cr3,.cr2,.arw,.nef,.tif,.tiff,.gif,.webp" onChange={(event) => event.target.files && void props.onUploaded(event.target.files)} />
          <b>+</b>
          <strong>批量上传照片</strong>
          <span>原图保存到 data/originals，服务端生成预览并解析 EXIF/GPS</span>
        </label>
      </section>

      <section className={styles.sideBlock}>
        <div className={styles.blockHeader}><h2>筛选</h2><span>{props.filteredPhotos.length} 张</span></div>
        <input value={props.query} placeholder="文件名、设备、日期、地点" onChange={(event) => props.onQueryChange(event.target.value)} />
        <select value={props.gpsFilter} onChange={(event) => props.onGpsFilterChange(event.target.value as GpsFilter)}>
          <option value="all">全部 GPS 状态</option>
          <option value="with">已有位置</option>
          <option value="without">缺少位置</option>
          <option value="inferred">自动推断</option>
          <option value="pending">待确认</option>
        </select>
        <div className={styles.metrics}>
          <div><strong>{props.photos.length}</strong><span>照片</span></div>
          <div><strong>{props.photos.filter((photo) => photo.location).length}</strong><span>有位置</span></div>
          <div><strong>{props.photos.filter((photo) => photo.locationStatus === "pending").length}</strong><span>待确认</span></div>
        </div>
      </section>

      <section className={styles.sideBlock}>
        <div className={styles.blockHeader}><h2>地点搜索</h2><span>高德转 WGS84</span></div>
        <form className={styles.placeSearch} onSubmit={searchPlaces}>
          <input value={placeQuery} placeholder="搜索 POI 或地址" onChange={(event) => setPlaceQuery(event.target.value)} />
          <button type="submit">搜索</button>
        </form>
        <div className={styles.placeResults}>
          {placeError && <small>{placeError}</small>}
          {places.map((place) => (
            <button key={place.id} type="button" onClick={() => props.onPlaceSelected(place)}>
              <b>{place.name}</b>
              <span>{place.address || `${place.latitude}, ${place.longitude}`}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.sideBlock}>
        <div className={styles.blockHeader}>
          <h2>待确认位置</h2>
          <button type="button" onClick={() => void props.onConfirmVisible()}>确认当前筛选</button>
        </div>
        <div className={styles.pendingList}>
          {pending.length === 0 && <span>没有待确认照片</span>}
          {pending.map((photo) => (
            <button key={photo.id} type="button" onClick={() => props.onSelectPhoto(photo.id)}>
              <b>{shortName(photo.fileName, 12, 8)}</b>
              <small>{statusText(photo)}</small>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}

function MapWorkbench({ active, photos, selectedPhoto, onSelectPhoto }: {
  active: boolean;
  photos: SerializedPhoto[];
  selectedPhoto?: SerializedPhoto;
  onSelectPhoto: (id: string) => void;
}) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const locatedPhotos = photos.filter((photo) => photo.location);

  useEffect(() => {
    if (!mapElement.current || mapRef.current) return;
    mapRef.current = L.map(mapElement.current, { zoomControl: false }).setView([31.2304, 121.4737], 4);
    L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);
    L.tileLayer("/tiles/osm/{z}/{x}/{y}", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapRef.current);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = locatedPhotos.map((photo) => {
      const marker = L.marker([photo.location!.latitude, photo.location!.longitude], { icon: markerIcon })
        .addTo(map)
        .bindPopup(`<div class="${styles.popup}">${photo.previewUrl ? `<img src="${photo.previewUrl}" alt="">` : ""}<b>${photo.fileName}</b><span>${statusText(photo)}</span></div>`);
      marker.on("click", () => onSelectPhoto(photo.id));
      return marker;
    });
    setTimeout(() => map.invalidateSize(), 50);
  }, [photos, locatedPhotos.length, onSelectPhoto]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedPhoto?.location || !active) return;
    map.setView([selectedPhoto.location.latitude, selectedPhoto.location.longitude], Math.max(map.getZoom(), 12), { animate: true });
  }, [selectedPhoto?.id, active]);

  function fitAll() {
    const map = mapRef.current;
    if (!map || !markersRef.current.length) return;
    map.fitBounds(L.latLngBounds(markersRef.current.map((marker) => marker.getLatLng())), { padding: [48, 48], maxZoom: 14 });
  }

  return (
    <section className={`${styles.mapStage} ${active ? styles.visible : ""}`}>
      <div ref={mapElement} className={styles.mapCanvas} />
      <div className={styles.mapToolbar}>
        <div><p>Map Workbench</p><strong>{locatedPhotos.length} 张照片可上图</strong></div>
        <button type="button" onClick={fitAll}>定位全部</button>
      </div>
      <Filmstrip photos={photos} selectedId={selectedPhoto?.id} onSelect={onSelectPhoto} />
    </section>
  );
}

function Filmstrip({ photos, selectedId, onSelect }: { photos: SerializedPhoto[]; selectedId?: string; onSelect: (id: string) => void }) {
  return (
    <div className={styles.filmstrip}>
      <div className={styles.filmstripSummary}>
        <strong>{photos.length} 张照片</strong>
        <span>{photos.filter((photo) => photo.location).length} 有位置 · {photos.filter((photo) => photo.locationStatus === "missing").length} 无 GPS</span>
      </div>
      <div className={styles.filmstripTrack}>
        {photos.slice(0, 24).map((photo) => (
          <button key={photo.id} className={photo.id === selectedId ? styles.selected : ""} type="button" onClick={() => onSelect(photo.id)}>
            {photo.previewUrl ? <img src={photo.previewUrl} alt="" /> : <span>No Preview</span>}
            <b>{shortName(photo.fileName, 8, 6)}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

function TimelineView({ active, days, photos, selectedId, onSelectPhoto, onExport }: {
  active: boolean;
  days: TimelineDay[];
  photos: SerializedPhoto[];
  selectedId?: string;
  onSelectPhoto: (photo: SerializedPhoto) => void;
  onExport: () => Promise<void>;
}) {
  const routeDays = days.filter((day) => day.gpsCount > 0);
  return (
    <section className={`${styles.timelineStage} ${active ? styles.visible : ""}`}>
      <header className={styles.timelineHero}>
        <div>
          <p>Travel Timeline</p>
          <h2>旅行时间轴</h2>
          <span>{days.length} 天 · {photos.length} 张照片 · {photos.filter((photo) => photo.location).length} 个地图点</span>
        </div>
        <button type="button" onClick={() => void onExport()}>导出旅程</button>
      </header>
      <div className={styles.routeRibbon}>
        <div>
          {(routeDays.length ? routeDays : days.slice(0, 4)).map((day) => {
            const cover = day.photos.find((photo) => photo.previewUrl);
            return (
              <button key={day.date} type="button" onClick={() => cover && onSelectPhoto(cover)}>
                <i />
                {cover?.previewUrl ? <img src={cover.previewUrl} alt="" /> : <span>{day.date.slice(5)}</span>}
                <b>{day.date === "unknown" ? "未知" : day.date.slice(5)}</b>
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.dayList}>
        {days.map((day) => (
          <article key={day.date} className={styles.dayCard}>
            <header>
              <p>{day.date}</p>
              <h3>{dayTitle(day.date)}</h3>
              <span>{day.photos.length} 张</span>
              <span>{day.gpsCount} 有位置</span>
              <span>{day.deviceCount} 设备</span>
              <span>{day.pendingCount} 待确认</span>
            </header>
            <div className={styles.photoGrid}>
              {day.photos.map((photo) => (
                <button key={photo.id} className={photo.id === selectedId ? styles.selected : ""} type="button" onClick={() => onSelectPhoto(photo)}>
                  {photo.previewUrl ? <img src={photo.previewUrl} alt="" /> : <span>No Preview</span>}
                  <b>{shortName(photo.fileName, 16, 6)}</b>
                  <small>{statusText(photo)}</small>
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DetailPanel({ photo, selectedPlace, onChanged }: { photo?: SerializedPhoto; selectedPlace?: PlaceSearchResult; onChanged: () => Promise<void> }) {
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  useEffect(() => {
    setLatitude(photo?.location ? String(round(photo.location.latitude, 7)) : "");
    setLongitude(photo?.location ? String(round(photo.location.longitude, 7)) : "");
  }, [photo?.id]);

  if (!photo) {
    return <aside className={styles.detailPanel}><div className={styles.emptyDetail}>选择一张照片查看详情</div></aside>;
  }

  async function setManualLocation(event: FormEvent) {
    event.preventDefault();
    if (!photo) return;
    await api.setLocation(photo.id, { latitude: Number(latitude), longitude: Number(longitude), status: "confirmed" });
    await onChanged();
  }

  return (
    <aside className={styles.detailPanel}>
      {photo.previewUrl ? <img className={styles.detailImage} src={photo.previewUrl} alt="" /> : <div className={styles.noPreview}>No Preview</div>}
      <div className={styles.detailTitle}>
        <div><p>{photo.locationStatus}</p><h2>{photo.fileName}</h2></div>
        <a href={photo.originalUrl} target="_blank" rel="noreferrer">原图</a>
      </div>
      <dl className={styles.detailList}>
        <div><dt>设备</dt><dd>{cameraLabel(photo) || "未知"}</dd></div>
        <div><dt>时间</dt><dd>{photoDate(photo) || "无"}</dd></div>
        <div><dt>坐标</dt><dd>{photo.location ? `${round(photo.location.latitude, 6)}, ${round(photo.location.longitude, 6)}` : "无"}</dd></div>
        <div><dt>来源</dt><dd>{statusText(photo)}</dd></div>
        <div><dt>尺寸</dt><dd>{photo.metadata.imageWidth && photo.metadata.imageHeight ? `${photo.metadata.imageWidth} x ${photo.metadata.imageHeight}` : "无"}</dd></div>
        <div><dt>参数</dt><dd>{exposureLabel(photo) || "无"}</dd></div>
        <div><dt>SHA-256</dt><dd>{photo.sha256.slice(0, 18)}...</dd></div>
      </dl>
      <form className={styles.locationForm} onSubmit={setManualLocation}>
        <input value={latitude} inputMode="decimal" placeholder="纬度" onChange={(event) => setLatitude(event.target.value)} />
        <input value={longitude} inputMode="decimal" placeholder="经度" onChange={(event) => setLongitude(event.target.value)} />
        <button type="submit">手动赋位</button>
      </form>
      <div className={styles.detailActions}>
        <button type="button" disabled={!photo.location} onClick={async () => { await api.confirmLocation(photo.id); await onChanged(); }}>确认位置</button>
        <button type="button" disabled={!photo.location} onClick={async () => { await api.clearLocation(photo.id); await onChanged(); }}>清除位置</button>
        <button type="button" disabled={!selectedPlace} onClick={async () => {
          if (!selectedPlace) return;
          await api.setLocation(photo.id, {
            latitude: selectedPlace.latitude,
            longitude: selectedPlace.longitude,
            placeName: selectedPlace.name,
            status: "confirmed",
          });
          await onChanged();
        }}>使用搜索地点</button>
      </div>
    </aside>
  );
}

function MobileTabs({ active, onChange }: { active: MobilePanel; onChange: (panel: MobilePanel) => void }) {
  const tabs: Array<[MobilePanel, string]> = [["map", "地图"], ["timeline", "时间线"], ["upload", "上传"], ["search", "搜索"], ["detail", "详情"]];
  return (
    <nav className={styles.mobileTabs} aria-label="移动端导航">
      {tabs.map(([panel, label]) => (
        <button key={panel} className={active === panel ? styles.active : ""} type="button" onClick={() => onChange(panel)}>{label}</button>
      ))}
    </nav>
  );
}

function filterPhotos(photos: SerializedPhoto[], query: string, gpsMode: GpsFilter) {
  const normalized = query.trim().toLowerCase();
  return photos.filter((photo) => {
    const hasLocation = Boolean(photo.location);
    const matchesGps =
      gpsMode === "all" ||
      (gpsMode === "with" && hasLocation) ||
      (gpsMode === "without" && !hasLocation) ||
      (gpsMode === "inferred" && photo.location?.source === "inferred") ||
      (gpsMode === "pending" && photo.locationStatus === "pending");
    if (!matchesGps) return false;
    if (!normalized) return true;
    return [
      photo.fileName,
      photo.metadata?.make,
      photo.metadata?.model,
      photo.metadata?.lens,
      photoDate(photo),
      photo.location?.placeName,
      photo.location?.source,
      photo.locationStatus,
    ].filter(Boolean).join(" ").toLowerCase().includes(normalized);
  });
}

const markerIcon = L.divIcon({
  className: styles.photoMarker,
  html: "<span></span>",
  iconSize: [30, 38],
  iconAnchor: [15, 36],
  popupAnchor: [0, -34],
});
