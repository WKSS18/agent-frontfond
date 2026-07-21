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
