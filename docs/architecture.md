# Architecture

## 服务结构

- `apps/web`：Vite/React/TypeScript 前端，负责地图工作台、旅行时间轴、上传入口、搜索、详情和移动端 Tab。
- `apps/api`：Fastify/TypeScript API，负责登录、上传、EXIF 解析、预览生成、照片查询、地点搜索、位置修正、媒体鉴权、导出 manifest 和生产前端托管。
- `packages/shared`：前后端共享类型。
- `public/`：前端公共静态资源目录，用于设计参考图和不经过模块导入的资源；Vite 构建时复制到 `apps/web/dist/`。
- `data/`：可搬家的数据根目录，包含原图、预览、文件索引和导出快照。
- `postgres-postgis`：Docker Compose 中预留的目标索引库。当前代码的 v1 纵向切片使用 `data/db/photos.json`，数据模型与 `docs/schema.md` 的 SQL 设计保持同名语义，方便后续迁入 PostGIS。

开发时前端和后端分离启动；生产时 `apps/api` 托管 `apps/web/dist`，对外仍是一个 HTTP 服务。

## 数据流

1. 浏览器上传单张或多张照片到 `POST /api/photos/upload`。
2. API 把上传文件写入临时目录，调用 `exiftool-vendored` 解析元数据。
3. HEIC/HEIF 使用 `heic-convert` 生成 JPEG 预览；RAW/JPEG 优先提取内嵌预览。
4. API 计算原图 SHA-256，原图按 hash 保存到 `data/originals/<prefix>/<hash>.<ext>`。
5. 预览保存到 `data/previews/<prefix>/<hash>.<ext>`。
6. 照片索引、导入记录、地点缓存和导出记录写入 `data/db/photos.json`。
7. React 前端通过 `/api/photos`、`/api/timeline`、`/media/...` 渲染地图、时间轴和详情。

## 坐标体系

- 系统内部统一使用 WGS84。
- Leaflet 展示 WGS84；前端通过本机 `/tiles/osm/:z/:x/:y` 读取后端代理的 OpenStreetMap 瓦片，减少浏览器直连瓦片服务失败导致的灰屏。
- 高德搜索返回 GCJ-02，经服务端转换为 WGS84 后再进入地点缓存和手动赋位流程。

## GPS 推断

- 有 EXIF GPS 的照片位置来源为 `exif`，状态为 `confirmed`。
- 无 GPS 照片会按拍摄时间寻找默认 30 分钟窗口内最近的已确认照片。
- 推断位置来源为 `inferred`，状态为 `pending`，包含置信度和参考照片 ID。
- 用户可确认、清除或用地点搜索/手动坐标覆盖推断位置。

## 鉴权

- v1 使用单用户密码登录。
- `APP_PASSWORD` 校验成功后写入 HttpOnly `pic_map_session` cookie。
- `SESSION_SECRET` 用于 HMAC 签名 cookie。
- `/api/photos`、`/api/timeline`、`/api/places/search`、`/api/exports` 和 `/media/...` 均要求登录。
- `/api/parse` 保留为开发调试接口，不写入图库。

## 迁移设计

- 原图、预览、索引和导出 manifest 都在 `data/` 下。
- `POST /api/exports` 在 `data/exports/<export-id>/` 生成：
  - `manifest.json`：版本、照片数量、hash、相对路径。
  - `photos-db.json`：当前文件索引完整快照。
- 服务器迁移时复制整个 `data/` 目录；新实例设置相同 `DATA_DIR` 后即可读到图库。
