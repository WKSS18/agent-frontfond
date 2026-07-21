import type {
  AgentChatResponse,
  AgentMessage,
  AttachmentInfo,
  ChatFormDescriptor,
  Note,
  TokenResponse,
  UploadedFile,
  User,
} from "../types";
import { notifyApiError } from "./feedback";


const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const pendingGetRequests = new Map<string, Promise<unknown>>();

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiResponse<T> {
  data: T | null;
  code: number;
  message: string;
}

function fail(message: string, code: number): never {
  notifyApiError(message);
  throw new ApiError(message, code);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  if (method !== "GET") {
    return executeRequest<T>(path, options, token);
  }

  // StrictMode 会重复执行 Effect；相同 GET 在完成前只保留一个真实网络请求。
  const requestKey = `${token ?? "anonymous"}:${path}`;
  const pendingRequest = pendingGetRequests.get(requestKey);
  if (pendingRequest) {
    return pendingRequest as Promise<T>;
  }

  const requestPromise = executeRequest<T>(path, options, token);
  pendingGetRequests.set(requestKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    if (pendingGetRequests.get(requestKey) === requestPromise) {
      pendingGetRequests.delete(requestKey);
    }
  }
}

async function executeRequest<T>(
  path: string,
  options: RequestInit,
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (
    options.body
    && !(options.body instanceof URLSearchParams)
    && !(options.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch {
    return fail("网络连接失败，请检查服务是否已启动。", 0);
  }

  let payload: ApiResponse<T> | null = null;
  try {
    payload = await response.json() as ApiResponse<T>;
  } catch {
    return fail(`服务返回格式错误（HTTP ${response.status}）`, response.status);
  }

  if (!response.ok || payload.code !== 200) {
    return fail(payload.message || `请求失败（HTTP ${response.status}）`, payload.code || response.status);
  }
  return payload.data as T;
}

export interface ChatStreamCallbacks {
  onSession: (sessionId: number) => void;
  onSources: (notes: Note[]) => void;
  onDelta: (content: string) => void;
  onForm: (form: ChatFormDescriptor) => void;
  onDone: (messageId: number) => void;
  onAttachment?: (attachment: AttachmentInfo) => void;
}

type SsePayload = {
  session_id?: number;
  used_notes?: Note[];
  content?: string;
  message_id?: number;
  message?: string;
  form?: ChatFormDescriptor;
  code?: number;
  attachment?: AttachmentInfo;
};

async function streamChat(
  token: string,
  question: string,
  sessionId: number | null,
  callbacks: ChatStreamCallbacks,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/agent/chat/stream`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ question, session_id: sessionId }),
    });
  } catch {
    return fail("网络连接失败，请检查服务是否已启动。", 0);
  }

  await consumeStreamResponse(response, callbacks);
}

async function streamFileAnalysis(
  token: string,
  file: File,
  prompt: string,
  sessionId: number | null,
  objectKey: string,
  callbacks: ChatStreamCallbacks,
): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  form.append("prompt", prompt);
  if (sessionId !== null) form.append("session_id", String(sessionId));
  form.append("object_key", objectKey);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/agent/files/analyze`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
      body: form,
    });
  } catch {
    return fail("网络连接失败，请检查服务是否已启动。", 0);
  }
  await consumeStreamResponse(response, callbacks);
}

async function consumeStreamResponse(
  response: Response,
  callbacks: ChatStreamCallbacks,
): Promise<void> {
  if (!response.ok) {
    try {
      const payload = await response.json() as ApiResponse<null>;
      return fail(payload.message, payload.code);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      return fail(`聊天请求失败（HTTP ${response.status}）`, response.status);
    }
  }
  if (!response.body) {
    return fail("浏览器没有收到流式响应。", 502);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const consumeEvent = (block: string) => {
    let eventName = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0) return;

    const payload = JSON.parse(dataLines.join("\n")) as SsePayload;
    if (eventName === "session" && payload.session_id !== undefined) {
      callbacks.onSession(payload.session_id);
    } else if (eventName === "sources") {
      callbacks.onSources(payload.used_notes ?? []);
    } else if (eventName === "delta") {
      callbacks.onDelta(payload.content ?? "");
    } else if (eventName === "form" && payload.form) {
      callbacks.onForm(payload.form);
    } else if (eventName === "attachment" && payload.attachment) {
      callbacks.onAttachment?.(payload.attachment);
    } else if (eventName === "done" && payload.message_id !== undefined) {
      callbacks.onDone(payload.message_id);
    } else if (eventName === "error") {
      return fail(payload.message ?? "模型服务暂时不可用。", payload.code ?? 502);
    }
  };

  // TCP 分块边界不等于 SSE 事件边界，所以必须先缓存再按空行拆包。
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replaceAll("\r\n", "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      consumeEvent(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }
  if (buffer.trim()) consumeEvent(buffer);
}

export const api = {
  register(email: string, password: string): Promise<User> {
    return request<User>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  login(email: string, password: string): Promise<TokenResponse> {
    const form = new URLSearchParams({ username: email, password });
    return request<TokenResponse>("/auth/login", { method: "POST", body: form });
  },

  getCurrentUser(token: string): Promise<User> {
    return request<User>("/users/me", {}, token);
  },

  listNotes(token: string, keyword = ""): Promise<Note[]> {
    const query = keyword ? `?keyword=${encodeURIComponent(keyword)}` : "";
    return request<Note[]>(`/notes${query}`, {}, token);
  },

  createNote(token: string, title: string, content: string): Promise<Note> {
    return request<Note>(
      "/notes",
      { method: "POST", body: JSON.stringify({ title, content }) },
      token,
    );
  },

  uploadFile(token: string, file: File): Promise<UploadedFile> {
    const form = new FormData();
    form.append("file", file);
    return request<UploadedFile>("/uploads", { method: "POST", body: form }, token);
  },

  submitNoteForm(
    token: string,
    messageId: number,
    title: string,
    content: string,
  ): Promise<Note> {
    return request<Note>(
      "/agent/forms/note",
      {
        method: "POST",
        body: JSON.stringify({ message_id: messageId, title, content }),
      },
      token,
    );
  },

  updateNote(token: string, noteId: number, title: string, content: string): Promise<Note> {
    return request<Note>(
      `/notes/${noteId}`,
      { method: "PUT", body: JSON.stringify({ title, content }) },
      token,
    );
  },

  deleteNote(token: string, noteId: number): Promise<void> {
    return request<void>(`/notes/${noteId}`, { method: "DELETE" }, token);
  },

  chat(token: string, question: string, sessionId: number | null): Promise<AgentChatResponse> {
    return request<AgentChatResponse>(
      "/agent/chat",
      {
        method: "POST",
        body: JSON.stringify({ question, session_id: sessionId }),
      },
      token,
    );
  },

  streamChat,
  streamFileAnalysis,

  listMessages(token: string, sessionId: number): Promise<AgentMessage[]> {
    return request<AgentMessage[]>(`/agent/sessions/${sessionId}/messages`, {}, token);
  },
};
