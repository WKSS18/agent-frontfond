# AI Agent React 前端

该项目与 `../ai-agent-python-demo` Python 后端位于同一级目录，使用 React、TypeScript、Vite、Ant Design 和 Ant Design X 实现登录、Notes 管理、SSE 聊天、文件分析和结构化表单消息。

## 目录

```text
src/
  api/client.ts                 HTTP 请求与 SSE 协议解析
  components/ChatPage.tsx      聊天状态和消息类型分发
  components/NoteCreateForm.tsx 聊天内创建笔记表单
  components/NotesPage.tsx     Notes 管理
  App.tsx                       登录态与主视图
  types.ts                      前后端 DTO 类型
  styles.css                    布局、组件和响应式样式
```

组件不拼接后端 URL，也不处理网络半包。网络职责集中在 `api/client.ts`，Chat 页面只响应 `onSession`、`onSources`、`onDelta`、`onForm` 和 `onDone` 回调。

## 启动

先启动 Python 后端的 8000 端口，再执行：

```bash
cd /Users/admin/Desktop/面试/frontend
npm install
npm run dev
```

默认访问 `http://127.0.0.1:5173`。`vite.config.ts` 会将 `/api` 转发到 `http://127.0.0.1:8000`。

检查和构建：

```bash
npm run lint
npm run build
npm run preview
```

生产构建产物在 `dist/`。正式部署通常由 Nginx 托管静态文件并反向代理 `/api`。

## SSE 解析

聊天使用 `fetch` 发 POST 请求，读取 `response.body.getReader()`。TCP chunk 可能只包含半个事件，也可能包含多个事件，所以客户端把文本放进 buffer，按 `\n\n` 拆出完整 SSE 块，再读取 `event:` 和 `data:`。

普通文本流程：

1. 乐观加入用户消息和 pending 助手消息。
2. `session` 保存会话 ID。
3. `sources` 绑定引用笔记。
4. 每个 `delta` 追加文本，形成打字效果。
5. `done` 用数据库消息 ID 替换临时 ID。

## Ant Design X 输入区与附件

聊天输入使用 `@ant-design/x` 的 `Sender`，附件面板使用 `Sender.Header + Attachments`。支持点击回形针选取文件，也支持把文件粘贴到输入框；`Sender` 自身负责 Enter 发送、Shift+Enter 换行和 loading 交互。

前端只做扩展名和 10 MB 大小的快速校验，安全校验和内容解析仍以后端为准。选中图片后先用 `URL.createObjectURL` 生成本地 Blob 地址交给 `Attachments`，因此尚未上传也能立即预览；移除或发送完成后会释放该地址。

发送附件时依次执行：

1. 调用 `POST /uploads`，由 Python 后端把文件上传到阿里云 OSS。
2. 用返回的签名 URL 替换本地预览，并保存 `object_key`。
3. 调用 `POST /agent/files/analyze`，同时提交原文件、`object_key` 和分析要求。
4. 统一解析 `session/attachment/delta/done/error` SSE 事件。

两个文件请求都使用 `FormData`，不能手动设置 `Content-Type`，浏览器需要自动添加 multipart boundary。OSS AccessKey 只配置在 Python 项目的 `.env` 中，React 只拿有有效期的签名 URL，不接触长期密钥。

Ant Design X 负责 AI 交互组件，不负责替代业务 API。当前 DeepSeek 兼容接口不支持直接传图片或文档，所以后端先做 PDF/DOCX 文本提取或图片 OCR，再把文本交给模型分析。

当前对话使用 SSE `sources` 即时展示引用；重新进入会话时，消息接口从 MySQL 中读取持久化的 `used_notes` 快照，因此刷新不会丢失引用。

## 统一接口处理

普通接口由 `api/client.ts` 统一解析 `{ data, code, message }`：`code=200` 时只把 `data` 返回给组件，其他业务码统一抛出 `ApiError`。`App.tsx` 注册 Ant Design `message` 反馈器，所以页面组件不再重复解析异常或维护多套错误提示。

401 发生后，API 层先展示后端 `message`，App 再清除本地 token 并回到登录页。SSE 初始 HTTP 错误同样解析统一响应包，流建立后的错误则解析 `error` 事件里的 `code/message`。

开发环境保留 React `StrictMode`。它会重复执行 Effect 来检查副作用，因此 API 层使用 `pendingGetRequests` 合并尚未完成的相同 GET；登录页已经取得用户信息时，App 也会直接复用，不再重复请求 `/users/me`。Vite 热更新或主动切换页面产生的新请求属于正常重新加载，不会被长期缓存。

## 结构化表单消息

发送“帮我创建一条笔记”时，后端返回 `form` 事件。`ChatPage` 根据 `message_type === "form"` 渲染 `NoteCreateForm`；提交表单后调用 `POST /agent/forms/note`。后端原子地创建 Note 并把消息状态改成 `completed`，因此刷新后只显示成功提示，重复提交也不会新增第二条 Note。

表单描述来自后端白名单，包含 `kind`、标题、说明和字段配置。前端不会执行模型返回的任意 URL，具体 `kind` 必须映射到代码中明确实现的组件和 API。

新增另一种表单时，推荐步骤：

1. 在后端定义新的白名单 `kind` 和字段 DTO。
2. 为业务动作提供受鉴权、校验权限的后端 API。
3. 在 `types.ts` 扩展联合类型。
4. 新建独立表单组件。
5. 在消息分发处显式映射 `kind -> Component`。

## 环境变量

开发环境默认使用 `/api` 代理。前后端分开部署时可创建 `.env.production`：

```dotenv
VITE_API_BASE_URL=https://your-api.example.com
```

不要把后端模型密钥放进 `VITE_` 环境变量；Vite 的这类变量会被打包到浏览器代码中。
