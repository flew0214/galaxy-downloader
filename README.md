# 通用媒体下载器

这是一个基于 [vinext](https://github.com/cloudflare/vinext) 运行的 Next.js App Router 兼容项目，支持从 Bilibili、抖音、小红书等平台下载视频和音频。

## 功能特点

- 🎵 支持 Bilibili 视频/音频下载
- 🎬 支持抖音无水印视频下载及音频提取
- 📷 支持小红书视频笔记和图文笔记下载
- 🔍 自动识别平台链接
- 🎨 现代化的用户界面设计
- 💾 本地下载历史记录
- 🌍 多语言支持（简体中文、繁体中文、英文）

## 开始使用

首先，运行开发服务器：

```bash
pnpm dev
```

在浏览器中打开 [http://localhost:3000](http://localhost:3000) 即可看到应用界面。

如需回退到原始 Next.js CLI，可使用：

```bash
pnpm dev:next
```

## 使用方法

1. 复制视频链接（支持 Bilibili、抖音、小红书等平台）
2. 粘贴到输入框中
3. 点击解析按钮
4. 选择下载音频或视频
5. 等待下载完成，文件会自动保存

### 支持的链接格式

- **Bilibili**: `https://www.bilibili.com/video/BV...` 或 `https://b23.tv/...`
- **抖音**: `https://www.douyin.com/...` 或 `https://v.douyin.com/...`
- **小红书**: `https://www.xiaohongshu.com/explore/...` 或 `https://xhslink.com/...`

## 技术栈

- vinext
- Next.js 16 App Router API 兼容层
- React 19
- Vite 8
- TypeScript
- Tailwind CSS
- shadcn/ui
- Fetch API（前端网络请求）
- FFmpeg.wasm (浏览器端音频提取)
- JSZip (图片打包下载)

## 本地开发

1. 克隆项目
2. 安装依赖：
   ```bash
   pnpm install
   ```
3. 运行开发服务器：
   ```bash
   pnpm dev
   ```
4. 生产构建：
   ```bash
   pnpm build
   ```
5. 启动构建产物：
   ```bash
   pnpm start
   ```

兼容回退脚本：

- `pnpm dev:next`
- `pnpm build:next`
- `pnpm start:next`

## React Compiler 定向验证

已启用 `next.config.ts` 中的 `reactCompiler`。项目提供了一个“热点组件定向校验”脚本：

```bash
npm run react-compiler:check
```

脚本会基于 `.next` 构建产物检查关键客户端模块是否出现 React Compiler 标记（如 `react.memo_cache_sentinel` / `useMemoCache`），并生成报告：

- `.next/react-compiler-report.json`

## SEO 配置

部署时建议配置以下环境变量，避免预发环境被收录并确保 canonical 正确：

- `NEXT_PUBLIC_SITE_URL`: 当前环境站点地址（例如 `https://downloader.bhwa233.com`）
- `SEO_INDEXABLE`: 是否允许索引，`true` / `false`

默认策略：

- 在 Vercel 生产环境自动允许索引
- 在 Vercel 预览环境默认不允许索引
- 非 Vercel 环境按 `NODE_ENV === production` 判断是否允许索引
- 可通过 `SEO_INDEXABLE` 显式覆盖

## SEO 监控建议

建议每周检查以下指标，持续验证本仓库内的 SEO 配置是否生效：

1. Search Console 的 `索引页面` 与 `未编入索引原因`
2. `sitemap.xml` 提交状态与抓取成功率
3. Core Web Vitals（LCP、INP、CLS）趋势
4. 重点页面（首页、FAQ、Guides）的展示量与点击量
5. 多语言页面的 `hreflang` 与 canonical 是否一致

## 部署

默认使用 `vinext` 生成 `dist/` 构建产物。部署前请先执行：

```bash
pnpm build
```

如需继续使用原始 Next.js 构建链路，可改用 `pnpm build:next`。

Cloudflare Workers 部署请使用：

```bash
pnpm deploy
```

如果平台已经先执行过 `pnpm build`，部署命令请改为：

```bash
pnpm deploy:ci
```

预览部署可使用：

```bash
pnpm deploy:preview
```

不要直接使用 `wrangler deploy` 作为部署命令。当前项目基于 `vinext`，应由 `vinext deploy` 负责生成所需配置、构建并调用 Wrangler。
