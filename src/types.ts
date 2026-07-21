/**
 * 前后端共享数据合同在前端的 TypeScript 映射。
 * 这里不放组件状态，确保 API 返回结构变化时编译器能定位所有受影响调用方。
 */

export interface User {
  id: number;
  email: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  owner_id: number;
  created_at: string;
  updated_at: string;
}

export interface ChatFormField {
  name: "title" | "content";
  label: string;
  type: "text" | "textarea";
  placeholder: string;
  required: boolean;
  max_length?: number;
}

export interface ChatFormDescriptor {
  /** kind 是受控组件的判别字段，不能执行模型任意生成的 URL 或动作。 */
  kind: "note_create";
  status?: "pending" | "completed";
  title: string;
  description: string;
  submit_label: string;
  fields: ChatFormField[];
  result?: {
    note_id: number;
    title: string;
    completed_at: string;
  };
}

export interface AgentMessage {
  /** message_type 决定消息使用 Markdown 还是业务表单渲染器。 */
  id: number;
  session_id: number;
  role: "user" | "assistant";
  content: string;
  message_type: "text" | "form";
  message_data: ChatFormDescriptor | Record<string, unknown> | null;
  used_notes: Note[];
  attachment: AttachmentInfo | null;
  created_at: string;
}

export interface AttachmentInfo {
  /** object_key 用于服务端重新签名；url 只是有有效期的临时预览地址。 */
  name: string;
  media_type: string;
  size: number;
  extraction_method?: string;
  extracted_chars?: number;
  truncated?: boolean;
  object_key?: string;
  url?: string;
}

export interface UploadedFile extends AttachmentInfo {
  object_key: string;
  url: string;
}

export interface AgentChatResponse {
  session_id: number;
  answer: string;
  used_notes: Note[];
}

export type AppView = "chat" | "notes";
