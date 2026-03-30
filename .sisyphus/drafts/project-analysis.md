# Galaxy Downloader 项目深度解析

## 一、项目概览

**galaxy-downloader** 是一个通用媒体下载器，支持从 Bilibili、抖音、小红书等平台下载视频和音频。

- **仓库**: `lxw15337674/galaxy-downloader`
- **部署地址**: `downloader.bhwa233.com`
- **运行时**: vinext (Next.js App Router 兼容层 → Cloudflare Workers)
- **前端**: Next.js 16 + React 19 + Vite 8 + Tailwind CSS + shadcn/ui

---

## 二、架构分析

### 2.1 核心发现：前后端分离架构

**这个项目不是纯前端项目。** 实际架构如下：

```
┌─────────────────────────────────────────────┐
│              浏览器 (前端)                    │
│  Next.js 16 App Router + React 19           │
│  部署于 Cloudflare Workers (via vinext)      │
│                                              │
│  职责:                                        │
│  - UI 渲染 (输入框、结果卡片、下载历史)        │
│  - 剪贴板读取                                 │
│  - FFmpeg.wasm 音频提取 (浏览器端)            │
│  - 图片代理 (绕过 Referer 限制)               │
│  - 下载历史 (localStorage)                    │
│  - i18n 多语言                                │
└──────────────────┬──────────────────────────┘
                   │ fetch('/v1/parse?url=...')
                   ▼
┌─────────────────────────────────────────────┐
│         API 代理层 (route.ts)                 │
│  src/app/[locale]/v1/[...path]/route.ts      │
│                                              │
│  将 /v1/* 请求转发到后端:                      │
│  API_BASE_URL/api/*  (默认 localhost:8080)   │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│         后端服务器 (不在本仓库中)              │
│  API_BASE_URL = process.env.API_BASE_URL     │
│                                              │
│  职责:                                        │
│  - 平台识别 (抖音/B站/小红书)                  │
│  - 短链接解析 (v.douyin.com → 完整URL)        │
│  - 视频元数据提取 (标题、封面、时长)           │
│  - 无水印视频 URL 获取                        │
│  - 签名验证 / Cookie 管理                     │
│  - 反爬对抗                                   │
└─────────────────────────────────────────────┘
```

### 2.2 前端代码流程

```
用户粘贴链接 → handleSubmit()
  → handleUnifiedParse(url)
    → requestUnifiedParse(url)
      → fetch('/v1/parse?url=...')    // 前端调用本域API
        → route.ts 代理               // 转发到后端
          → 后端解析返回 JSON
      ← { title, downloadVideoUrl, downloadAudioUrl, cover, ... }
    → setParseResult(data)
    → addToHistory(record)

用户点击"下载视频"
  → downloadFile(downloadVideoUrl)    // 直接用后端返回的URL下载
  → 或 window.open(downloadVideoUrl)

用户点击"提取音频" (抖音/小红书特有)
  → extractAudioFromVideo(videoUrl)
    → fetch(videoUrl)                 // 下载视频到浏览器
    → FFmpeg.wasm 转码 (MP4 → MP3)
    → downloadBlob(audioBlob)
```

### 2.3 关键代码文件

| 文件 | 职责 |
|------|------|
| `src/app/[locale]/unified-downloader.tsx` | 主客户端组件，处理用户交互 |
| `src/app/[locale]/v1/[...path]/route.ts` | **API 代理层**，转发请求到后端 |
| `src/app/api/proxy-image/route.ts` | 图片代理，设置 Referer 绕过防盗链 |
| `src/lib/config.ts` | API 端点配置 (`/v1/parse`, `/v1/download`) |
| `src/lib/types.ts` | 统一接口类型定义 |
| `src/lib/ffmpeg.ts` | FFmpeg.wasm 浏览器端音频提取 |
| `src/hooks/use-ffmpeg.ts` | FFmpeg React Hook |
| `src/components/downloader/ResultCard.tsx` | 结果展示卡片 (视频/音频/图片) |
| `src/components/downloader/ExtractAudioButton.tsx` | 音频提取按钮 |
| `worker/index.ts` | Cloudflare Worker 入口 (vinext 生成) |

### 2.4 支持的平台和链接格式

| 平台 | 链接格式 | 特殊处理 |
|------|----------|----------|
| Bilibili | `bilibili.com/video/BV...` 或 `b23.tv/...` | 多P视频支持、`bilibili_tv` 隐藏视频下载 |
| 抖音 | `douyin.com/...` 或 `v.douyin.com/...` | 无水印、FFmpeg 提取音频、图文笔记 |
| 小红书 | `xiaohongshu.com/explore/...` 或 `xhslink.com/...` | 图文笔记打包下载 (JSZip)、视频笔记 |
| TikTok | tiktok.com 链接 | 与抖音类似的处理 |

### 2.5 图片代理机制

`proxy-image/route.ts` 实现了图片代理，解决了跨域和 Referer 限制问题：

- **白名单域名**: `douyinpic.com`, `hdslb.com`, `bilibili.com`, `xhscdn.com`, `tiktokcdn.com` 等
- **Referer 注入**: 根据目标域名设置正确的 Referer (如抖音图片 → `https://www.douyin.com/`)
- **缓存策略**: `max-age=3600, s-maxage=86400`

---

## 三、抖音视频下载原理详解

### 3.1 完整流程

```
步骤1: 用户输入链接
  输入: "https://v.douyin.com/FKWYQmtQ79E/"
  或: "复制打开抖音... https://v.douyin.com/FKWYQmtQ79E/"

步骤2: 提取URL
  正则提取: https://v.douyin.com/FKWYQmtQ79E/

步骤3: 短链接解析 (跟随重定向)
  GET https://v.douyin.com/FKWYQmtQ79E/
  → 302 重定向到 https://www.douyin.com/video/7123456789/

步骤4: 提取视频ID
  从URL解析: video_id = "7123456789"

步骤5: 获取视频元数据
  GET https://www.iesdouyin.com/share/video/7123456789/
  Headers: User-Agent=移动端, Referer=https://www.douyin.com/
  → HTML 中包含 window._ROUTER_DATA JSON
  → 解析出: item_list[0].video.play_addr.uri

步骤6: 构造下载URL
  方式A: https://aweme.snssdk.com/aweme/v1/play/?video_id={uri}&ratio=720p&line=0
  方式B: 直接使用 play_addr 中的完整URL

步骤7: 下载视频
  GET {下载URL}
  Headers: User-Agent=移动端
  → 返回无水印 MP4 视频流
```

### 3.2 去水印原理

**关键点**: 抖音的"水印"不是后期添加的，而是不同的视频源。

- **有水印版**: 桌面端 API 返回的视频流，已经合成水印
- **无水印版**: 移动端分享页 API (`iesdouyin.com/share/video/`) 返回的 `play_addr.uri`
  - 通过 `aweme.snssdk.com/aweme/v1/play/` 获取的视频流不含水印
  - 移动端 User-Agent 是获取无水印版本的关键

### 3.3 反爬对抗

抖音的反爬措施包括：
1. **短链接重定向**: 分享链接都是短链，需要跟随重定向
2. **签名验证**: 视频URL包含签名参数，会过期
3. **人机验证**: 网页端可能弹出验证码
4. **Cookie/Token**: 部分接口需要有效 Cookie
5. **频率限制**: 高频请求会被封 IP
6. **接口变更**: API 端点和参数格式经常变化

---

## 四、前端实现抖音下载的可行性分析

### 4.1 核心障碍

| 障碍 | 严重程度 | 说明 |
|------|----------|------|
| **CORS 限制** | 🔴 致命 | `iesdouyin.com` 和 `aweme.snssdk.com` 不设置 `Access-Control-Allow-Origin`，浏览器直接 fetch 会被 CORS 策略阻止 |
| **Referer 限制** | 🔴 致命 | 抖音检查 Referer 头，浏览器无法在 fetch 中自定义 Referer（被浏览器安全策略限制） |
| **签名过期** | 🟡 中等 | 视频 URL 包含时间敏感签名，需要实时生成 |
| **接口变更** | 🟡 中等 | 抖音频繁更改 API，纯前端难以快速适配 |
| **人机验证** | 🟡 中等 | 可能触发验证码，浏览器环境难以处理 |

### 4.2 方案对比

#### 方案A: Cloudflare Workers 代理 (推荐 ⭐⭐⭐⭐⭐)

```
┌────────────┐     ┌──────────────────────┐     ┌─────────────┐
│  CF Pages  │────▶│  CF Worker (代理)     │────▶│  抖音服务器  │
│  纯前端UI  │     │  处理CORS/Referer/签名 │     │             │
└────────────┘     └──────────────────────┘     └─────────────┘
```

- **原理**: 利用 Cloudflare Workers 作为轻量级代理，由 Worker 发起对抖音的请求（不受 CORS 限制）
- **优势**:
  - 免费额度充足 (10万请求/天)
  - 全球边缘节点，延迟低
  - 可以设置任意 Headers (Referer, Cookie)
  - 可以处理签名逻辑
  - 与 Cloudflare Pages 天然集成
- **劣势**:
  - 需要维护 Worker 代码
  - 抖音可能封禁 CF IP 段
- **实现复杂度**: 中等

#### 方案B: 纯前端 + 公共 CORS 代理 (⭐⭐⭐)

```
┌────────────┐     ┌────────────────────┐     ┌─────────────┐
│  浏览器    │────▶│  CORS Proxy 服务    │────▶│  抖音服务器  │
│  纯JS      │     │  (allorigins等)     │     │             │
└────────────┘     └────────────────────┘     └─────────────┘
```

- **原理**: 使用第三方 CORS 代理服务转发请求
- **可用代理**:
  - `corsproxy.io`
  - `api.allorigins.win`
  - `cors-anywhere` (需自建)
- **优势**: 真正的纯前端，无需后端
- **劣势**:
  - 依赖第三方服务，不稳定
  - 大视频文件传输受限
  - 无法设置 Referer 头（部分代理不支持自定义 Headers）
  - 安全性差（请求经过第三方）
  - 可能有速率限制

#### 方案C: 纯前端 + iframe/Service Worker (⭐⭐)

- **原理**: 利用 iframe 加载抖音页面，从中提取数据
- **优势**: 不需要代理
- **劣势**:
  - X-Frame-Options 阻止嵌入
  - 跨域 iframe 无法读取内容
  - 极其不稳定

#### 方案D: 自建 CORS 代理 (⭐⭐⭐⭐)

```
┌────────────┐     ┌────────────────────┐     ┌─────────────┐
│  CF Pages  │────▶│  自建代理 (CF/Railway)│────▶│  抖音服务器  │
│  纯前端UI  │     │  处理所有反爬逻辑     │     │             │
└────────────┘     └────────────────────┘     └─────────────┘
```

- 本质与方案A类似，但可以更复杂（处理签名、Cookie 管理等）

### 4.3 推荐方案: Cloudflare Worker 代理

**最佳实践架构**:

```
galaxy-downloader/
├── frontend/          ← Cloudflare Pages (纯静态)
│   ├── index.html
│   ├── app.js         ← UI 逻辑
│   └── ffmpeg.wasm    ← 音频提取
│
└── worker/            ← Cloudflare Worker (API 代理)
    └── index.ts       ← 处理:
                         - 短链接解析
                         - 视频元数据提取
                         - 无水印URL获取
                         - CORS 头设置
                         - 视频流代理
```

**Worker 核心逻辑伪代码**:

```typescript
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 解析接口
    if (url.pathname === '/api/parse') {
      const videoUrl = url.searchParams.get('url');
      // 1. 提取短链接 → 跟随重定向获取完整URL
      // 2. 提取 video_id
      // 3. 请求 iesdouyin.com/share/video/{id}/ 获取元数据
      // 4. 从 _ROUTER_DATA 提取 play_addr.uri
      // 5. 构造下载URL
      // 6. 返回 JSON { title, downloadVideoUrl, cover, ... }
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 视频代理下载
    if (url.pathname === '/api/proxy-video') {
      const videoApiUrl = url.searchParams.get('url');
      // 代理视频流，设置正确的 UA 和 Referer
      const resp = await fetch(videoApiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; ...)',
        }
      });
      return new Response(resp.body, {
        headers: { 'Content-Type': 'video/mp4' }
      });
    }
  }
}
```

### 4.4 关键技术点

1. **短链接解析**: Worker 中使用 `fetch` + `redirect: 'manual'` 跟随重定向
2. **Referer 设置**: Worker 不受浏览器限制，可以设置任意 Headers
3. **视频流代理**: 大文件通过 `response.body` (ReadableStream) 流式传输，不占用 Worker 内存
4. **CORS 头**: Worker 响应中添加 `Access-Control-Allow-Origin: *`
5. **FFmpeg.wasm**: 仍在浏览器端运行，下载视频后在浏览器中提取音频

### 4.5 已知风险

| 风险 | 应对策略 |
|------|----------|
| 抖音封禁 CF IP | Worker 支持多区域部署，可切换入口 |
| 接口频繁变更 | Worker 代码热更新 (无需重新构建前端) |
| 签名算法变化 | 需要持续维护，可参考开源项目如 `Douyin_TikTok_Download_API` |
| 大视频文件 | 流式代理，不缓存在 Worker 中 |
| _ROUTER_DATA 格式变化 | 灵活的 JSON 解析逻辑 (递归查找 item_list) |

---

## 五、项目技术亮点

1. **FFmpeg.wasm 浏览器端音频提取**: 不需要后端处理音视频，直接在浏览器中用 WebAssembly 转码
2. **图片代理 + Referer 注入**: 解决了跨平台图片防盗链问题
3. **vinext 运行时**: 将 Next.js App Router 部署到 Cloudflare Workers，比标准 Next.js 更轻量
4. **PWA 支持**: Serwist 实现 Service Worker，支持离线访问和安装
5. **多语言 i18n**: 支持简中/繁中/英/日四种语言
6. **API 错误码体系**: 完整的错误码定义和国际化错误消息

---

## 六、总结

### 项目本质
galaxy-downloader 是一个**前后端分离**的项目。前端是 UI 壳，后端（不在本仓库）负责实际的视频解析。通过 `/v1/*` 代理路由连接。

### 抖音下载原理
1. 短链接重定向 → 提取 video_id
2. 访问移动端分享页 → 解析 `_ROUTER_DATA` JSON
3. 获取无水印 `play_addr.uri` → 构造下载URL
4. 通过移动端 UA 获取无水印视频流

### 前端-only 可行性
**纯前端直接调用抖音 API 不可行** (CORS + Referer 限制)。

**推荐方案**: 使用 **Cloudflare Worker 作为轻量级代理**，配合 Cloudflare Pages 部署前端。这样：
- 前端是纯静态页面 (Pages)
- Worker 处理所有与抖音的交互 (绕过 CORS/Referer)
- 两者天然集成在 Cloudflare 生态中
- 免费额度足够个人使用

这个方案本质上与当前项目架构相同，只是把后端从独立服务器换成了 Cloudflare Worker，更加轻量和免费。
