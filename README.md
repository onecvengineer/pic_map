# Pic Map

私有照片地图 + 旅行时间轴。v1 是本地开发、可 Docker 部署的 Web 应用：网页批量上传照片，服务端保存原图和预览，解析 EXIF/GPS，按地图和日期时间轴浏览。

代码已改成前后分离结构：`apps/web` 是 Vite/React 前端，`apps/api` 是 Fastify API，`packages/shared` 放共享类型。生产环境仍由 API 服务托管前端构建产物，部署入口保持一个端口。

根目录 `public/` 作为前端公共静态资源目录使用；用于设计参考、候选视觉图或不需要经过模块导入的资源，构建时会复制到 `apps/web/dist/`。

## 本地启动

```bash
npm install
npm run build
APP_PASSWORD=change-me SESSION_SECRET=change-me npm run serve
```

打开 `http://127.0.0.1:5173`。未设置 `APP_PASSWORD` 时开发默认密码是 `picmap`。

## 环境变量

- `PORT`：HTTP 端口，默认 `5173`。
- `HOST`：HTTP 监听地址，本地默认 `127.0.0.1`，Docker 使用 `0.0.0.0`。
- `DATA_DIR`：图库数据目录，默认 `./data`。
- `APP_PASSWORD`：单用户登录密码，生产必须设置。
- `SESSION_SECRET`：登录 cookie 签名密钥，生产必须设置。
- `AMAP_KEY`：高德地点搜索 Key；未设置时地点搜索 API 返回配置错误。
- `INFERENCE_WINDOW_MINUTES`：无 GPS 照片自动推断时间窗口，默认 `30`。

## 数据目录

所有可搬家的数据都放在同一个 `data/` 下：

```text
data/
  originals/   # 原图，按 sha256 前缀分目录
  previews/    # 浏览器可显示预览
  db/          # 当前 v1 文件索引 photos.json
  exports/     # 迁移 manifest 和数据库快照
```

## 常用命令

```bash
npm run dev:all      # 一键启动 API 和 Vite 前端
npm run dev          # 只启动 API；等同 npm run dev:api
npm run dev:api      # 只启动 API
npm run dev:web      # Vite dev server，代理 /api 和 /media 到 5173
npm run build
npm run parse -- /path/to/photo.jpg
npm run serve
docker compose up --build
```

## Docker 部署

```bash
cp .env.example .env
docker compose up --build -d
```

`docker-compose.yml` 挂载 `./data:/app/data`，迁移服务器时复制整个 `data/` 目录即可保留原图、预览、索引和导出 manifest。

## 文档

- [产品说明](docs/product.md)
- [架构说明](docs/architecture.md)
- [API 文档](docs/api.md)
- [数据结构](docs/schema.md)
- [运维手册](docs/operations.md)
