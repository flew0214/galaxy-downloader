# Work Plan: 集成抖音解析 Worker 到现有项目

## TL;DR

> 在 galaxy-downloader 的 Worker 中直接实现抖音视频解析逻辑，不再依赖外部后端。修改代理路由，对抖音链接进行本地解析，其他平台保持代理转发。
>
> **Deliverables**:
> - `src/lib/douyin-parser.ts` — 抖音解析核心逻辑
> - 修改 `src/app/[locale]/v1/[...path]/route.ts` — 本地处理抖音请求
>
> **Estimated Effort**: Short
> **Parallel Execution**: NO - sequential (2 tasks)
> **Critical Path**: Task 1 → Task 2

---

## Context

### Original Request
用户想要一个纯前端（Cloudflare Pages/Workers）的抖音视频下载方案。当前 galaxy-downloader 项目只有前端 UI，后端闭源。用户希望直接在现有 Worker 中集成解析逻辑。

### Research Findings
- **后端是闭源的** — galaxy-downloader 作者 (lxw15337674) 未公开后端代码
- **Issue #21** 有人遇到同样问题：部署了前端但 localhost:8080 无后端
- **douyinVd (338 stars)** 已用 Cloudflare Worker 实现了抖音解析，核心逻辑仅 ~80 行 TypeScript
- **核心原理**: 用移动端 UA 请求短链 → HTML 中正则提取 `play_addr.uri` → 拼接下载URL
- **不需要 `_ROUTER_DATA` 解析** — 正则直接提取关键字段即可

### Metis Review
**Identified Gaps** (to address):
- 需要支持短链和完整链接两种输入格式
- 需要处理图文笔记（无视频，返回图片列表）
- 需要 CORS 头（前端 fetch 跨域）
- 视频下载代理需要流式传输（大文件）
- 需要错误处理（链接失效、接口变更）

---

## Work Objectives

### Core Objective
在 galaxy-downloader 的 Worker 中实现抖音视频解析，消除对外部后端的依赖。

### Concrete Deliverables
- `src/lib/douyin-parser.ts` — 抖音解析模块（URL检测、短链解析、元数据提取、下载URL构造）
- 修改 `src/app/[locale]/v1/[...path]/route.ts` — 本地处理抖音 `/api/parse` 请求
- 修改 `src/lib/types.ts` — 添加平台检测函数（如果需要）

### Definition of Done
- [ ] 输入抖音短链或完整链接，返回 title/downloadVideoUrl/cover 等字段
- [ ] 前端 UI 可以正常解析抖音视频并显示下载按钮
- [ ] 点击下载可以获取无水印视频
- [ ] 其他平台（B站、小红书）保持原有代理逻辑不变

### Must Have
- 支持短链格式: `https://v.douyin.com/xxx/`
- 支持完整链接: `https://www.douyin.com/video/1234567890`
- 无水印视频 URL 构造
- CORS 头支持
- 错误处理（返回标准错误格式）

### Must NOT Have
- 不修改前端 UI 代码
- 不影响 Bilibili/小红书 的现有代理逻辑
- 不引入新的 npm 依赖
- 不存储/缓存任何数据

---

## Verification Strategy

### QA Policy
每个任务包含 agent-executed QA scenarios。

---

## Execution Strategy

### Sequential Execution (2 tasks)

```
Wave 1 (Sequential):
├── Task 1: 创建 douyin-parser.ts 解析模块
└── Task 2: 修改 route.ts 集成本地解析
```

---

## TODOs

- [ ] 1. 创建 `src/lib/douyin-parser.ts` — 抖音解析核心模块

  **What to do**:
  - 创建 `src/lib/douyin-parser.ts`
  - 实现 `parseDouyinUrl(inputUrl: string): Promise<DouyinParseResult>` 函数
  - 实现逻辑基于 douyinVd 项目的方案：
    1. 用移动端 User-Agent 请求输入的抖音链接
    2. 从 HTML 响应中正则提取关键字段：
       - `play_addr.uri`: `/"video":{"play_addr":{"uri":"([a-z0-9]+)"/`
       - `desc`: `/"desc":\s*"([^"]+)"/`
       - `nickname`: `/"nickname":\s*"([^"]+)"/`
       - `aweme_id`: `/"aweme_id":\s*"([^"]+)"/`
    3. 构造下载URL: `https://www.iesdouyin.com/aweme/v1/play/?video_id={uri}&ratio=720p&line=0`
    4. 构造封面URL（从 HTML 中提取 cover）
    5. 返回 UnifiedParseResult 格式的对象
  - 实现 `isDouyinUrl(url: string): boolean` 平台检测函数
  - 添加 CORS 头辅助函数 `corsHeaders(): Headers`
  - 添加移动端 UA 常量

  **Must NOT do**:
  - 不要修改任何其他文件
  - 不要引入新的 npm 依赖（只用原生 fetch）
  - 不要处理非抖音平台

  **References**:
  - `pwh-pwh/douyinVd/douyin.ts` — 参考解析逻辑实现
  - `src/lib/types.ts:UnifiedParseResult` — 返回值类型定义
  - `src/app/api/proxy-image/route.ts:3-14` — ALLOWED_IMAGE_HOSTS 参考抖音图片域名
  - `src/lib/config.ts` — API_ENDPOINTS 定义

  **Acceptance Criteria**:
  - [ ] 文件 `src/lib/douyin-parser.ts` 存在且无 TypeScript 错误
  - [ ] 导出 `parseDouyinUrl` 函数，接受 URL 字符串，返回 Promise
  - [ ] 导出 `isDouyinUrl` 函数，能正确识别 `v.douyin.com` 和 `douyin.com` 链接
  - [ ] 返回对象包含 `title`, `downloadVideoUrl`, `platform: 'douyin'` 字段

  **QA Scenarios**:

  ```
  Scenario: 解析抖音短链
    Tool: Bash (curl/Node.js)
    Preconditions: 无
    Steps:
      1. 运行 tsx/esbuild 执行 parseDouyinUrl("https://v.douyin.com/L5pbfdP/")
      2. 检查返回对象
    Expected Result: 返回 { title: "非空字符串", downloadVideoUrl: "https://www.iesdouyin.com/aweme/v1/play/...", platform: "douyin" }
    Failure Indicators: 返回 null/undefined、downloadVideoUrl 为空、抛出异常
    Evidence: .sisyphus/evidence/task-1-parse-test.txt

  Scenario: 检测抖音链接
    Tool: Bash (Node.js)
    Preconditions: 无
    Steps:
      1. isDouyinUrl("https://v.douyin.com/xxx/") → true
      2. isDouyinUrl("https://www.douyin.com/video/123") → true
      3. isDouyinUrl("https://www.bilibili.com/video/BV123") → false
    Expected Result: 正确识别平台
    Evidence: .sisyphus/evidence/task-1-detect-test.txt
  ```

  **Commit**: 暂不提交，等 Task 2 完成后一起

---

- [ ] 2. 修改 `src/app/[locale]/v1/[...path]/route.ts` — 集成本地抖音解析

  **What to do**:
  - 修改 `src/app/[locale]/v1/[...path]/route.ts`
  - 在 `proxyRequest` 函数中添加逻辑分支：
    1. 检测请求路径是否为 `parse`
    2. 从 URL 参数中获取 `url`
    3. 使用 `isDouyinUrl()` 检测是否为抖音链接
    4. 如果是抖音链接 → 调用本地 `parseDouyinUrl()` → 返回 JSON（带 CORS 头）
    5. 如果不是 → 保持原有代理逻辑
  - 添加 CORS 头到响应：
    - `Access-Control-Allow-Origin: *`
    - `Access-Control-Allow-Methods: GET, OPTIONS`
    - `Content-Type: application/json`
  - 添加错误处理：解析失败时返回标准错误格式 `{ success: false, error: "...", code: "PARSE_FAILED" }`
  - 确保 OPTIONS 请求返回正确的 CORS preflight 响应

  **Must NOT do**:
  - 不要修改非抖音平台的代理逻辑
  - 不要修改前端代码
  - 不要添加新的路由文件

  **References**:
  - `src/app/[locale]/v1/[...path]/route.ts` — 当前代理逻辑
  - `src/lib/types.ts:UnifiedParseResult` — 响应格式
  - `src/lib/api-errors.ts` — 错误处理模式

  **Acceptance Criteria**:
  - [ ] `pnpm build` 构建成功
  - [ ] 抖音链接请求 `/v1/parse?url=https://v.douyin.com/xxx` 返回本地解析结果
  - [ ] 非抖音链接请求 `/v1/parse?url=https://www.bilibili.com/...` 保持代理转发
  - [ ] 响应包含 `Access-Control-Allow-Origin` 头
  - [ ] 错误情况返回 `{ success: false, error: "..." }` 格式

  **QA Scenarios**:

  ```
  Scenario: 抖音视频解析端到端
    Tool: Bash (curl)
    Preconditions: Worker 已运行 (pnpm dev)
    Steps:
      1. curl "http://localhost:3000/v1/parse?url=https://v.douyin.com/L5pbfdP/"
      2. 检查 HTTP 状态码
      3. 检查响应 JSON 格式
    Expected Result: status=200, body 包含 { success: true, data: { title, downloadVideoUrl, platform: "douyin" } }
    Failure Indicators: status!=200, 缺少字段, CORS 错误
    Evidence: .sisyphus/evidence/task-2-douyin-parse.json

  Scenario: Bilibili 链接保持代理
    Tool: Bash (curl)
    Preconditions: Worker 已运行
    Steps:
      1. curl "http://localhost:3000/v1/parse?url=https://www.bilibili.com/video/BV1xx411c7mD"
    Expected Result: 请求被代理到 API_BASE_URL（可能因后端不可用而失败，但代理行为正确）
    Evidence: .sisyphus/evidence/task-2-bilibili-proxy.txt

  Scenario: CORS preflight
    Tool: Bash (curl)
    Preconditions: Worker 已运行
    Steps:
      1. curl -X OPTIONS "http://localhost:3000/v1/parse?url=..." -H "Origin: http://localhost:3000"
    Expected Result: 返回 200/204 且包含 CORS 头
    Evidence: .sisyphus/evidence/task-2-cors.txt
  ```

  **Commit**: YES
  - Message: `feat: integrate Douyin parser into Worker (no external backend needed)`
  - Files: `src/lib/douyin-parser.ts`, `src/app/[locale]/v1/[...path]/route.ts`

---

## Commit Strategy

- **Final**: `feat: integrate Douyin parser into Worker (no external backend needed)` — `src/lib/douyin-parser.ts`, `src/app/[locale]/v1/[...path]/route.ts`, `pnpm test`

---

## Success Criteria

### Verification Commands
```bash
pnpm build    # Expected: build success
pnpm dev      # Expected: server starts
# 然后在浏览器中粘贴抖音链接测试
```

### Final Checklist
- [ ] 抖音链接可以在前端正常解析
- [ ] 无水印视频可以下载
- [ ] B站/小红书链接不受影响
- [ ] `pnpm build` 通过
- [ ] 无新增 npm 依赖
