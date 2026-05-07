# Operations

## 部署

1. 准备 `.env`：

   ```bash
   cp .env.example .env
   ```

2. 设置生产值：

   - `APP_PASSWORD`
   - `SESSION_SECRET`
   - `POSTGRES_PASSWORD`
   - `HOST=0.0.0.0` when running in Docker or another container
   - 可选 `AMAP_KEY`

3. 启动：

   ```bash
   docker compose up --build -d
   ```

4. 访问 `http://服务器:5173`。容器内只运行 Fastify API 服务，它会托管已构建的 React 前端产物。

## 本地开发

```bash
npm install
npm run dev:all
```

`npm run dev:all` 会同时启动 API 和 Vite 前端。默认开发密码为 `picmap`，也可以在命令前覆盖：

```bash
APP_PASSWORD=change-me SESSION_SECRET=change-me npm run dev:all
```

如需拆开启动，分别运行：

```bash
npm run dev:api
npm run dev:web
```

前端 dev server 会代理 `/api` 和 `/media` 到 `http://127.0.0.1:5173`。

## 备份

v1 的可搬家数据都在 `data/`。

```bash
tar -czf pic-map-data-$(date +%Y%m%d).tar.gz data/
```

建议定期备份：

- `data/originals/`
- `data/previews/`
- `data/db/photos.json`
- `data/exports/`

## 应用内导出

登录后在时间轴点击“生成迁移 manifest”，或调用：

```bash
curl -X POST -b cookie.txt http://127.0.0.1:5173/api/exports
```

导出目录在 `data/exports/<export-id>/`，包含：

- `manifest.json`
- `photos-db.json`

## 恢复与迁移服务器

1. 停止旧服务。
2. 复制整个 `data/` 到新服务器项目目录。
3. 在新服务器配置 `.env`。
4. 启动服务：

   ```bash
   docker compose up --build -d
   ```

5. 登录后检查地图、时间轴、预览和原图链接。

因为索引中的文件路径均为相对 `data/` 的路径，所以不依赖旧服务器绝对路径。

## 故障处理

### 登录失败

- 确认使用的是 `APP_PASSWORD`。
- 修改 `.env` 后重启容器。

### 地点搜索返回配置错误

- 设置 `AMAP_KEY`。
- 重启服务。

### 上传 HEIC 预览失败

- 服务端仍会保存原图和 EXIF。
- 检查容器日志中 `heic-convert` 或 EXIF 解析错误。

### 照片没有 GPS

- 若同一时间窗口内有已确认 GPS 照片，系统会生成待确认推断位置。
- 可在详情中手动输入坐标，或搜索地点后点击“使用搜索地点”。

### 数据目录权限

容器内 `DATA_DIR=/app/data`，宿主机挂载为 `./data`。如果上传失败，确认运行 Docker 的用户可写 `./data`。

## 环境变量变更规则

新增部署环境变量时必须同步更新：

- `README.md`
- `docs/operations.md`
- `.env.example`
