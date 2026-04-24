# Photo Atlas Parser

本阶段只做图片解析，不接数据库。

## 使用

```bash
npm run build
npm run parse -- /path/to/photo.jpg
```

网页验证：

```bash
npm run build
npm run serve
```

然后打开 `http://127.0.0.1:5173` 上传图片。网页不会写数据库；上传文件只会保存到临时目录用于解析，解析完成后删除。

也可以一次解析多张：

```bash
npm run parse -- ./a.jpg ./b.heic ./c.cr3
```

## 当前能力

- 优先调用本机 `exiftool`，可覆盖 HEIC、RAW、CR3 等更多格式。
- 如果没有 `exiftool`，自动降级为内置 JPEG EXIF 解析。
- 输出标准化 JSON 字段：
  - 文件：路径、文件名、大小、修改时间、MIME 猜测
  - 图片：宽高、方向
  - 设备：厂商、型号、软件、机身序列号
  - 镜头：镜头型号、镜头序列号
  - 时间：拍摄时间、创建时间、修改时间、时区偏移、亚秒
  - 参数：焦距、光圈、快门、ISO
  - 位置：纬度、经度、海拔、GPS 时间

当前项目已安装 `exiftool-vendored`，不依赖系统级 `exiftool`。如果 vendored 解析异常，JPEG 会继续使用内置 EXIF 解析兜底。
