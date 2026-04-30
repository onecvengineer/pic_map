# Schema

当前 v1 纵向切片使用 `data/db/photos.json` 持久化索引。Docker Compose 同时提供 PostGIS 服务，后续迁移时按本页 SQL 语义落表。

## File-backed v1

`data/db/photos.json`：

```json
{
  "version": 1,
  "photos": [],
  "imports": [],
  "placeCache": [],
  "exports": []
}
```

### `photos`

- `id`：照片 UUID。
- `sha256`：原图 SHA-256，用于去重。
- `fileName`：上传时文件名。
- `fileSize`：原图大小。
- `mimeGuess`：按扩展名或解析结果推断的 MIME。
- `originalPath`：相对 `data/` 的原图路径。
- `previewPath`：相对 `data/` 的预览路径。
- `previewMime`：预览 MIME。
- `importedAt`：首次入库时间。
- `metadata`：标准化 EXIF 元数据。
- `locationStatus`：`confirmed`、`pending`、`missing`。
- `location`：WGS84 位置、来源、状态、置信度、参考照片和地点名。

### `imports`

每次上传都有导入记录，即使原图 hash 已存在。

- `id`
- `photoId`
- `sha256`
- `fileName`
- `fileSize`
- `duplicate`
- `importedAt`

### `placeCache`

- `id`
- `query`
- `provider`
- `name`
- `address`
- `latitude` / `longitude`：WGS84。
- `providerLatitude` / `providerLongitude`：高德原始 GCJ-02。
- `createdAt`

### `exports`

- `id`
- `path`：相对 `data/` 的导出目录。
- `photoCount`
- `createdAt`

## Target PostGIS Tables

```sql
create extension if not exists postgis;

create table photos (
  id uuid primary key,
  sha256 text not null unique,
  file_name text not null,
  file_size bigint not null,
  mime_guess text not null,
  original_path text not null,
  preview_path text,
  preview_mime text,
  imported_at timestamptz not null,
  metadata jsonb not null,
  location_status text not null check (location_status in ('confirmed', 'pending', 'missing')),
  location geometry(Point, 4326),
  location_source text check (location_source in ('exif', 'inferred', 'manual')),
  location_confidence numeric,
  location_reference_photo_id uuid references photos(id),
  location_place_name text,
  location_updated_at timestamptz
);

create index photos_location_gix on photos using gist(location);
create index photos_taken_at_idx on photos ((metadata->>'dateTimeOriginal'));
create index photos_location_status_idx on photos(location_status);
create index photos_sha256_idx on photos(sha256);

create table photo_imports (
  id uuid primary key,
  photo_id uuid not null references photos(id),
  sha256 text not null,
  file_name text not null,
  file_size bigint not null,
  duplicate boolean not null,
  imported_at timestamptz not null
);

create table place_cache (
  id uuid primary key,
  query text not null,
  provider text not null,
  name text not null,
  address text,
  location geometry(Point, 4326) not null,
  provider_location geometry(Point, 4326) not null,
  created_at timestamptz not null
);

create index place_cache_query_idx on place_cache(lower(query));

create table export_jobs (
  id text primary key,
  path text not null,
  photo_count integer not null,
  created_at timestamptz not null
);
```

## 迁移说明

- JSON 字段名与 SQL 字段保持直接映射。
- `originalPath`、`previewPath` 始终是相对 `data/` 路径，不依赖服务器绝对路径。
- PostGIS 中 `location` 必须保持 SRID 4326。
