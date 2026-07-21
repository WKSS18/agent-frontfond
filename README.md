# Fieldnote AI Agent 前端

Fieldnote 是一个 React + TypeScript 的个人知识工作台前端，配套后端位于同级目录 `../python-agent-demo`。项目覆盖登录、知识笔记、SSE 流式聊天、Markdown、引用来源、OSS 附件、图片/文档分析、会话历史、结构化业务表单和响应式布局。

## 1. 已实现功能

- 登录/注册一体化页面和 JWT 登录态恢复。
- 桌面侧栏与移动底部导航。
- 知识笔记搜索、新建、编辑和删除。
- 会话 ID 按用户保存，刷新后恢复历史消息。
- 用户消息与助手占位消息乐观渲染。
- `fetch + ReadableStream` 消费 POST SSE。
- Markdown、GFM 表格、列表、代码块和引用渲染。
- 流式回答自动顺滑跟随底部，用户向上阅读时停止抢滚动。
- 最近一个问题在回答滚动期间吸顶，效果接近 Cursor。
- 图片在用户消息上方展示，发送语句在图片下方展示。
- 选中文件后立即调用上传接口，而不是点击发送时才上传。
- 上传前本地 Blob 预览，上传后切换 OSS 签名 URL。
- 未发送附件移除时清理 OSS 孤儿对象。
- 附件、用户语句和助手分析刷新后可从历史恢复。
- 聊天内创建笔记的结构化表单和幂等完成态。
- API 统一错误提示、GET 并发去重和本地时区显示。

## 2. 技术栈

| 技术 | 用途 | 选型理由 |
| --- | --- | --- |
| React | 页面和状态组织 | 组件化、生态成熟 |
| TypeScript | DTO、Props、回调类型 | 接口变化可在编译期暴露影响范围 |
| Vite | 开发、代理和生产构建 | 启动快、配置简单 |
| Ant Design | 基础 UI、Message、主题 | 稳定的企业级组件和反馈机制 |
| Ant Design X | Sender、Attachments | 面向 AI 输入与附件场景 |
| react-markdown | 模型 Markdown 渲染 | 不直接使用 `dangerouslySetInnerHTML` |
| remark-gfm | GFM 扩展 | 支持表格、任务列表等常见模型输出 |
| lucide-react | 图标 | 风格统一、可按组件引入 |
| Fetch / ReadableStream | HTTP 和 SSE | 支持 POST、Bearer Header 与流式读取 |

## 3. 前端架构

```text
main.tsx
  ▼
App.tsx                     全局主题、Token、当前用户
  ▼
AppShell.tsx                导航和页面切换
  ├── NotesPage.tsx         笔记 CRUD
  └── ChatPage.tsx          会话、消息、附件、流式 UI
        └── NoteCreateForm  受控业务表单

所有组件
  ▼
api/client.ts               URL、鉴权、响应信封、SSE 拆包
  ▼
Vite /api proxy
  ▼
FastAPI
```

组件不直接拼接 URL，不解析统一响应，不处理 SSE 半包。网络细节集中到 `api/client.ts`，页面只处理语义化回调。

## 4. 目录说明

```text
src/
├── main.tsx                    # React 浏览器入口
├── App.tsx                     # 主题、登录态恢复和根视图
├── types.ts                   # 后端 DTO 的 TypeScript 映射
├── api/
│   ├── client.ts              # HTTP、上传、SSE 和错误解析
│   └── feedback.ts            # API 错误到 Ant Message 的桥
├── components/
│   ├── AppShell.tsx           # 桌面/移动导航和工作台外壳
│   ├── AuthPage.tsx           # 注册与登录
│   ├── ChatPage.tsx           # 聊天核心状态和渲染
│   ├── NoteCreateForm.tsx     # 聊天内创建笔记表单
│   └── NotesPage.tsx          # 笔记列表和编辑器
└── styles.css                 # 设计令牌、布局、Markdown、响应式样式
vite.config.ts                 # Vite 插件和 /api 开发代理
```

推荐阅读顺序：`types.ts -> api/client.ts -> App.tsx -> ChatPage.tsx -> styles.css`。

## 5. 快速启动

先启动后端：

```bash
cd ../python-agent-demo
./dev.sh
```

再启动前端：

```bash
cd ../agent-frontfond
npm install
npm run dev
```

默认地址：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:8000`
- Swagger：`http://127.0.0.1:8000/docs`

常用命令：

```bash
npm run dev       # 开发服务器和 HMR
npm run lint      # 当前脚本执行 TypeScript 项目检查
npm run build     # TypeScript 检查 + Vite 生产构建
npm run preview   # 本地预览 dist
```

项目使用 `package-lock.json`，团队协作建议统一使用 npm，避免同时维护多种 lockfile。

## 6. 环境变量与代理

开发环境默认请求 `/api`，`vite.config.ts` 会代理到 `http://127.0.0.1:8000`。

前后端分域部署时可创建 `.env.production`：

```dotenv
VITE_API_BASE_URL=https://api.example.com
```

重要安全规则：所有 `VITE_` 变量都会被打进浏览器资源，因此只能放公开配置。模型 Token、JWT Secret、OSS AccessKey 必须留在 Python 后端。

## 7. 登录态设计

```text
注册（可选）
  -> 登录获取 access_token
  -> /users/me 获取用户
  -> localStorage 保存 Token
  -> React 内存保存 User
```

刷新启动时：

1. 从 `localStorage` 读取 Token。
2. 调用 `/users/me` 验证 Token 并恢复用户。
3. 401 时清除本地 Token 并回到登录页。

Token 使用 localStorage 是 Demo 的简化方案。生产环境如果风险模型允许，通常优先考虑 `HttpOnly + Secure + SameSite` Cookie，并配套 CSRF 策略，降低 XSS 窃取 Token 的风险。

## 8. API 客户端

普通接口统一处理：

```json
{
  "data": {},
  "code": 200,
  "message": "success"
}
```

`request<T>` 的职责：

- 自动拼接 API Base URL。
- 按需添加 Bearer Token。
- JSON 请求自动设置 Content-Type。
- FormData 不手动设置 Content-Type，让浏览器生成 multipart boundary。
- 网络失败、非 JSON、HTTP 错误和业务错误统一转换为 `ApiError`。
- 通过 `feedback.ts` 调用 Ant Design Message，组件不重复维护错误提示。
- 合并尚未完成的相同 GET，降低 React StrictMode 下的重复请求。

GET 去重不是长期缓存；请求结束后立即从 Map 删除，因此刷新和主动切换仍会获得最新数据。

## 9. SSE 流式聊天

### 9.1 为什么不用 EventSource

原生 EventSource 主要面向 GET，不便携带 JSON Body 和自定义 Authorization Header。本项目需要 POST 问题、会话 ID 和 Bearer Token，因此用 `fetch` 获取 `ReadableStream`。

### 9.2 为什么需要 buffer

网络 chunk 和 SSE event 没有一一对应关系：一个 chunk 可能是半条事件，也可能包含多条事件。

```text
reader.read()
  -> TextDecoder
  -> append buffer
  -> 按 \n\n 找完整事件
  -> 解析 event: 和 data:
  -> JSON.parse
  -> 分发 callback
```

支持的回调：

| 回调 | SSE 事件 | 页面作用 |
| --- | --- | --- |
| `onSession` | `session` | 保存会话 ID |
| `onSources` | `sources` | 绑定引用笔记 |
| `onAttachment` | `attachment` | 更新附件信息 |
| `onDelta` | `delta` | 追加回答文本 |
| `onForm` | `form` | 切换到业务表单渲染 |
| `onDone` | `done` | 替换临时消息 ID并结束 pending |

### 9.3 乐观消息

用户点击发送后，页面立即插入：

1. 一条负数临时 ID 的用户消息。
2. 一条空内容、pending 的助手消息。

这样页面无需等服务端首包。收到 `done.message_id` 后再把助手临时 ID 换成数据库 ID。若是新会话，`session` 事件会保存 ID，并跳过一次会覆盖乐观消息的历史拉取。

## 10. Markdown 渲染

助手文本通过 `react-markdown + remark-gfm` 渲染，支持：

- 标题、段落和加粗。
- 有序/无序列表。
- 行内代码和代码块。
- 引用和分割线。
- GFM 表格与任务列表。

用户消息仍按普通文本展示，避免把用户输入误解释成复杂富文本。Markdown 样式集中在 `.message--assistant .message-content` 相关 CSS 中。

生产化如需允许原始 HTML，应额外使用严格白名单清洗；不要直接使用 `dangerouslySetInnerHTML` 渲染模型输出。

## 11. 自动滚动与问题吸顶

流式内容高频更新时，如果每个 delta 都启动一次 `scrollIntoView({behavior: "smooth"})`，动画会不断被重启并产生抖动。本项目采用：

- `requestAnimationFrame` 合并同一帧内的多次滚动请求。
- 直接设置容器 `scrollTop = scrollHeight`，保证稳定跟随。
- `ResizeObserver` 监听 Markdown 重排和图片加载造成的高度变化。
- `autoFollowRef` 记录用户是否仍在底部；用户主动向上阅读时停止抢滚动。
- 用户发送新消息时强制恢复自动跟随。

消息按“用户问题 + 对应回答”分组为 `ConversationTurn`。每个 turn 内用户问题使用 `position: sticky`，下一个问题滚入时自然顶走上一个，实现类似 Cursor 的最近问题吸顶。

## 12. 附件上传与历史恢复

### 12.1 正确时序

```text
用户选择文件
  -> 本地校验扩展名和 10 MB 大小
  -> Blob URL 立即预览
  -> POST /uploads 上传 OSS
  -> 保存 object_key 和签名 URL
  -> 用户点击发送
  -> POST /agent/files/analyze
  -> SSE 分析
```

附件应该在选择后上传，因为用户需要看到上传状态，发送按钮也必须等上传成功才能提交分析。若用户移除附件，调用 `DELETE /uploads` 删除尚未发送的 OSS 对象。

### 12.2 为什么刷新后图片仍能显示

服务端在用户消息的 `message_data` 中保存附件元数据和稳定的 `object_key`。历史接口读取消息时重新生成短期签名 URL，前端只按 `attachment.url` 渲染，因此不会依赖已经过期的旧 URL。

### 12.3 预览 URL 生命周期

- 选择后：使用 `URL.createObjectURL(file)` 本地预览。
- 上传成功：使用 OSS 签名 URL。
- 文件切换/移除/组件卸载：`URL.revokeObjectURL` 释放 Blob URL。

## 13. 结构化表单消息

聊天消息不仅是纯文本。`message_type` 作为判别字段：

```text
text -> Markdown / 普通文本
form + kind=note_create -> NoteCreateForm
```

`kind` 必须显式映射到已实现组件和固定 API。前端不会读取模型输出的任意 URL 并执行，这能降低提示词注入导致的越权操作。

表单成功后同时支持两种完成态：

- 当前页面的 `createdNote`。
- 历史消息中后端持久化的 `descriptor.status/result`。

因此刷新页面不会再次出现可重复提交的表单。

## 14. 笔记页面

NotesPage 使用本地状态管理列表、选择项和编辑草稿：

- 搜索输入使用 220ms 防抖。
- `useMemo` 从列表派生当前选中笔记。
- 新建与编辑复用同一个表单。
- 删除前使用确认框。
- 保存/删除后重新查询列表，并通过 `noteRevision` 通知聊天页更新知识库数量。

当前数据规模较小，直接重查可以保证 UI 与服务端一致。生产化可以使用 TanStack Query 管理缓存、失效、重试和请求状态。

## 15. 时间处理

数据库的 SQLite `CURRENT_TIMESTAMP` 是 UTC。后端历史消息统一返回带 `Z` 的 ISO 时间，前端用 `Intl.DateTimeFormat` 转换为浏览器本地时区。

前端同时兼容旧数据：若时间字符串没有 `Z` 或 `+08:00` 等偏移，则按 UTC 补 `Z`，避免把 `10:55 UTC` 错显示成北京时间 `10:55`。

原则是：存储和接口使用 UTC，展示时再根据用户时区转换。

## 16. 响应式与可访问性

- 大屏使用固定侧栏与双栏笔记编辑器。
- 小屏切换到底部导航和覆盖式编辑器。
- 输入、按钮提供 `focus-visible` 焦点样式。
- 图标按钮带 `aria-label`/`title`。
- 重要状态使用 `role=status`。
- `prefers-reduced-motion` 下关闭非必要动画。

样式使用 CSS 变量集中维护颜色、边框、阴影和间距，避免组件内散落魔法值。

## 17. 构建与部署

```bash
npm run lint
npm run build
```

产物输出到 `dist/`。生产环境常见部署方式：

```text
Nginx
  ├── /        -> dist 静态文件，SPA fallback 到 index.html
  └── /api     -> FastAPI:8000
```

SSE 代理需要注意：

- 关闭响应缓冲。
- 增大读取超时。
- 不要缓存流式接口。
- 后端已经发送 `X-Accel-Buffering: no`。

当前 Vite 构建会提示主 chunk 超过 500 KB，这是警告不是失败。生产化可对 Ant Design、Markdown 和页面进行动态 import/code splitting。

## 18. 面试讲法

### 30 秒版本

> 我用 React、TypeScript、Vite 和 Ant Design X 做了一个知识库 Agent 前端。API 层统一处理 JWT、普通响应、文件上传和 POST SSE；聊天页通过乐观消息和事件回调增量更新回答，用 react-markdown 渲染模型内容，并解决了流式滚动抖动、最近问题吸顶、附件上传生命周期和刷新历史恢复。业务表单通过 message_type 和白名单 kind 显式映射，不执行模型任意动作。

### 2 分钟展开顺序

1. 从 App 讲登录态恢复和 401 退出。
2. 从 client.ts 讲统一 API、FormData 和 SSE buffer。
3. 从 ChatPage 讲乐观消息、流式增量与真实消息 ID。
4. 讲滚动优化：RAF、ResizeObserver、是否在底部。
5. 讲附件：选择即上传、Blob 预览、OSS object_key、历史重新签名。
6. 讲安全：Markdown 不直接插 HTML，前端不持有长期密钥，表单 kind 白名单。

### 高频追问

**为什么不用 EventSource？** 需要 POST Body 和 Authorization Header，fetch 的 ReadableStream 更适合。

**如何处理 SSE 半包？** 用 TextDecoder 解码后累计 buffer，按空行切完整事件，不能假设一次 `read()` 就是一条消息。

**为什么流式页面会抖？** 高频 delta 反复启动 smooth 动画。使用 RAF 合帧并直接更新 scrollTop，再监听布局高度变化。

**如何避免用户向上看历史时被拉到底？** 根据距离底部阈值维护 auto-follow 状态，只有仍在底部或主动发送时才自动跟随。

**附件为什么选择时就上传？** 上传是独立异步状态，用户需要即时反馈；发送前必须已有稳定 object_key。移除时再清理未发送对象。

**刷新后图片为什么不会丢？** 消息持久化 object_key，后端历史接口重新签名 URL，前端从 attachment 恢复。

**为什么不用 Redux？** 当前跨页面状态只有用户、视图和 noteRevision，局部 useState 足够。状态复杂后可引入 Zustand/Redux Toolkit，服务端缓存优先考虑 TanStack Query。

## 19. 当前边界与优化方向

当前是面试/学习项目，以下属于下一步，不应描述成已经完成：

- Vitest + React Testing Library 单元和交互测试。
- Playwright 登录、聊天、附件和刷新恢复 E2E。
- TanStack Query 统一服务端状态和缓存失效。
- AbortController 取消流式请求和文件上传。
- 会话列表、重命名、删除和多会话切换。
- Markdown 代码高亮、复制按钮和超长回答虚拟化。
- 路由级拆包、组件懒加载和 bundle 体积优化。
- HttpOnly Cookie、CSP、前端监控和错误上报。

## 20. 常见故障

- 页面请求 404：确认 FastAPI 在 8000 端口，Vite 代理配置正确。
- 401：清除旧 localStorage Token 后重新登录，检查后端 `SECRET_KEY` 是否变化。
- SSE 无增量：检查代理缓冲、Network Response 和后端模型日志。
- 上传 503：后端 OSS 尚未配置，不是前端密钥问题。
- 分析 422：检查文件是否为空、超限、损坏或格式不支持。
- 图片刷新后不显示：确认历史消息包含 `attachment.object_key`，后端能够重新签名。
- 时间少 8 小时：确认后端 ISO 时间带 `Z`，前端不要直接截取字符串。
- 开发环境看到重复 GET：StrictMode 会检查副作用；相同 pending GET 已在 API 层合并。

## 21. 配套后端

后端项目：`../python-agent-demo`

后端 README 包含数据库模型、JWT、事务边界、LangGraph、RAG、文件解析、OSS 和 API 说明。面试前建议沿着“前端发送 -> Vite 代理 -> FastAPI Route -> Service -> Agent/CRUD -> SSE 返回”的完整链路走读一次。
