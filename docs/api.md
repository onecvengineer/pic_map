# API

所有响应均为 JSON，除 `/api/health`、`/api/session`、`/api/auth/login`、`/api/auth/logout`、`/api/parse` 和静态页面外，API 与 `/media/...` 都需要登录 cookie。

## Auth

### `POST /api/auth/login`

请求：

```json
{ "password": "change-me" }
```

成功返回 `200`：

```json
{ "ok": true }
```

失败返回 `401`：

```json
{ "error": "Invalid password" }
```

### `POST /api/auth/logout`

清除登录 cookie。

### `GET /api/session`

返回：

```json
{ "authenticated": true }
```

## Photos

### `POST /api/photos/upload`

`multipart/form-data`，字段名 `file`。服务端会保存原图、生成预览、解析元数据、计算 hash 并写入索引。

成功返回 `201`；重复原图返回 `200` 且 `duplicate: true`。

```json
{
  "photo": {
    "id": "uuid",
    "sha256": "hex",
    "fileName": "IMG_0001.HEIC",
    "previewUrl": "/media/previews/ab/hash.jpg",
    "originalUrl": "/media/originals/ab/hash.heic",
    "locationStatus": "confirmed",
    "location": {
      "latitude": 31.2304,
      "longitude": 121.4737,
      "source": "exif",
      "status": "confirmed"
    }
  },
  "duplicate": false
}
```

### `GET /api/photos`

查询参数：

- `q`：搜索文件名、设备、日期、地点、GPS 状态。
- `gps`：`all`、`with`、`without`、`inferred`、`pending`。

返回照片数组。

### `PATCH /api/photos/:id/location`

手动给单张照片赋位。

```json
{
  "latitude": 31.2304,
  "longitude": 121.4737,
  "placeName": "上海",
  "status": "confirmed"
}
```

### `POST /api/photos/bulk/location`

批量赋位。

```json
{
  "photoIds": ["id1", "id2"],
  "latitude": 31.2304,
  "longitude": 121.4737,
  "placeName": "上海",
  "status": "confirmed"
}
```

### `POST /api/photos/:id/confirm-location`

把推断或手动待确认位置标记为 `confirmed`。

### `POST /api/photos/:id/clear-location`

清除照片位置，状态变为 `missing`。

## Timeline

### `GET /api/timeline`

返回按日期分组的照片。

```json
{
  "days": [
    {
      "date": "2026-04-30",
      "deviceCount": 2,
      "placeCount": 1,
      "gpsCount": 12,
      "pendingCount": 3,
      "photos": []
    }
  ]
}
```

## Places

### `GET /api/places/search?q=关键词`

使用高德地点搜索。需要 `AMAP_KEY`。服务端会把高德 GCJ-02 坐标转换为 WGS84，并缓存结果。

未配置 `AMAP_KEY` 返回 `503`。

## Media

### `GET /media/originals/:prefix/:file`

登录后下载原图。

### `GET /media/previews/:prefix/:file`

登录后读取预览。

## Tiles

### `GET /tiles/osm/:z/:x/:y`

后端代理 OpenStreetMap PNG 瓦片，供 Leaflet 地图使用。该路由不返回 JSON，不要求登录；前端仍显示 OpenStreetMap attribution。

## Exports

### `GET /api/exports`

返回已有导出记录。

### `POST /api/exports`

在 `data/exports/<export-id>/` 创建 `manifest.json` 和 `photos-db.json`。

## Dev Parser

### `POST /api/parse`

保留给开发调试的单文件解析接口，不写入图库，不要求登录。

## 错误码

- `400`：请求格式错误。
- `401`：未登录或密码错误。
- `404`：资源不存在。
- `405`：方法不允许。
- `503`：外部服务未配置，例如 `AMAP_KEY`。
- `500`：服务端错误。
