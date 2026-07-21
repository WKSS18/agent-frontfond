import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Attachments, Sender, type AttachmentsProps } from "@ant-design/x";
import { App as AntdApp, Button, Tooltip } from "antd";
import { BookOpen, Bot, File, FileText, Image, Paperclip, Plus, UserRound } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { api, ApiError, type ChatStreamCallbacks } from "../api/client";
import type { AgentMessage, AttachmentInfo, ChatFormDescriptor, Note, UploadedFile } from "../types";
import { NoteCreateForm } from "./NoteCreateForm";


interface ChatPageProps {
  token: string;
  userId: number;
  noteRevision: number;
}

interface DisplayMessage extends AgentMessage {
  usedNotes?: Note[];
  pending?: boolean;
}

interface ConversationTurn {
  key: number;
  messages: DisplayMessage[];
}

const STARTER_PROMPTS = [
  "总结我的最近笔记",
  "RAG 的核心流程是什么？",
  "帮我创建一条笔记",
];
const ACCEPTED_FILES = ".txt,.md,.csv,.pdf,.docx,.png,.jpg,.jpeg,.webp";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MARKDOWN_PLUGINS = [remarkGfm];

export function ChatPage({ token, userId, noteRevision }: ChatPageProps) {
  const { message: messageApi } = AntdApp.useApp();
  const storageKey = `fieldnote_session_${userId}`;
  const [sessionId, setSessionId] = useState<number | null>(() => {
    const stored = localStorage.getItem(storageKey);
    return stored ? Number(stored) : null;
  });
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(Boolean(sessionId));
  const [noteCount, setNoteCount] = useState(0);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const attachmentsRef = useRef<ComponentRef<typeof Attachments>>(null);
  const skipNextHistoryLoadRef = useRef(false);
  const uploadAttemptRef = useRef(0);
  const autoFollowRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);

  useEffect(() => {
    api.listNotes(token)
      .then((notes) => setNoteCount(notes.length))
      .catch(() => setNoteCount(0));
  }, [token, noteRevision]);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      setIsLoadingHistory(false);
      return;
    }

    if (skipNextHistoryLoadRef.current) {
      skipNextHistoryLoadRef.current = false;
      setIsLoadingHistory(false);
      return;
    }

    let active = true;
    setIsLoadingHistory(true);
    api.listMessages(token, sessionId)
      .then((history) => {
        if (active) setMessages(history);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        if (requestError instanceof ApiError && requestError.status === 404) {
          localStorage.removeItem(storageKey);
          setSessionId(null);
          setMessages([]);
          return;
        }
      })
      .finally(() => {
        if (active) setIsLoadingHistory(false);
      });

    return () => {
      active = false;
    };
  }, [sessionId, storageKey, token]);

  const scheduleScrollToBottom = useCallback((force = false) => {
    if (!force && !autoFollowRef.current) return;
    if (force) autoFollowRef.current = true;
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    // 流式 delta 可能非常密集，每帧最多滚动一次，避免反复重启 smooth 动画导致抖动。
    scrollFrameRef.current = requestAnimationFrame(() => {
      const container = chatScrollRef.current;
      if (container) container.scrollTop = container.scrollHeight;
      scrollFrameRef.current = null;
    });
  }, []);

  useEffect(() => {
    scheduleScrollToBottom();
  }, [messages, isSending, scheduleScrollToBottom]);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList) return;
    // Markdown 重排、图片加载都会改变高度，高度变化后继续跟随底部。
    const observer = new ResizeObserver(() => scheduleScrollToBottom());
    observer.observe(messageList);
    return () => observer.disconnect();
  }, [messages.length, scheduleScrollToBottom]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  useEffect(() => {
    if (!selectedFile?.type.startsWith("image/")) {
      setSelectedPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(selectedFile);
    setSelectedPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  const removeSelectedFile = () => {
    uploadAttemptRef.current += 1;
    const orphan = uploadedFile;
    setSelectedFile(null);
    setUploadedFile(null);
    setIsUploading(false);
    if (orphan) {
      void api.deleteUploadedFile(token, orphan.object_key).catch(() => undefined);
    }
  };

  const sendMessage = async (content: string) => {
    const trimmed = content.trim();
    const uploadFile = selectedFile;
    const uploadedAttachment = uploadedFile;
    if ((!trimmed && !uploadFile) || isSending || isUploading) return;
    if (uploadFile && !uploadedAttachment) {
      void messageApi.warning("附件正在上传，请稍候。");
      return;
    }

    // 点击发送后立即清空编辑区；后续上传或分析失败也不回填已发送内容。
    setQuestion("");
    setSelectedFile(null);
    setUploadedFile(null);
    setIsSending(true);
    autoFollowRef.current = true;

    // 附件名已在 attachment 中保存，消息正文只展示用户真正发送的语句。
    const displayContent = uploadFile
      ? trimmed || "请总结并分析这份文件"
      : trimmed;
    const attachment: AttachmentInfo | null = uploadedAttachment;

    const optimisticMessage: DisplayMessage = {
      id: -Date.now(),
      session_id: sessionId ?? 0,
      role: "user",
      content: displayContent,
      message_type: "text",
      message_data: null,
      used_notes: [],
      attachment,
      created_at: new Date().toISOString(),
      pending: true,
    };
    const assistantMessageId = optimisticMessage.id - 1;
    const streamingMessage: DisplayMessage = {
      id: assistantMessageId,
      session_id: sessionId ?? 0,
      role: "assistant",
      content: "",
      message_type: "text",
      message_data: null,
      used_notes: [],
      attachment: null,
      created_at: new Date().toISOString(),
      pending: true,
    };
    setMessages((current) => [...current, optimisticMessage, streamingMessage]);
    scheduleScrollToBottom(true);

    try {
      const callbacks: ChatStreamCallbacks = {
        onSession: (nextSessionId) => {
          if (sessionId === null) {
            skipNextHistoryLoadRef.current = true;
            setSessionId(nextSessionId);
            localStorage.setItem(storageKey, String(nextSessionId));
          }
          setMessages((current) => current.map((message) =>
            message.id === optimisticMessage.id || message.id === assistantMessageId
              ? { ...message, session_id: nextSessionId, pending: message.role === "assistant" }
              : message,
          ));
        },
        onSources: (notes) => {
          setMessages((current) => current.map((message) =>
            message.id === assistantMessageId ? { ...message, usedNotes: notes } : message,
          ));
        },
        onAttachment: (nextAttachment: AttachmentInfo) => {
          setMessages((current) => current.map((message) =>
            message.id === optimisticMessage.id
              ? { ...message, attachment: nextAttachment }
              : message,
          ));
        },
        onDelta: (delta) => {
          setMessages((current) => current.map((message) =>
            message.id === assistantMessageId
              ? { ...message, content: message.content + delta }
              : message,
          ));
        },
        onForm: (form) => {
          setMessages((current) => current.map((message) =>
            message.id === assistantMessageId
              ? { ...message, message_type: "form", message_data: form }
              : message,
          ));
        },
        onDone: (messageId) => {
          setMessages((current) => current.map((message) => {
            if (message.id === optimisticMessage.id) return { ...message, pending: false };
            if (message.id === assistantMessageId) return { ...message, id: messageId, pending: false };
            return message;
          }));
        },
      };
      if (uploadFile && uploadedAttachment) {
        await api.streamFileAnalysis(
          token,
          uploadFile,
          trimmed,
          sessionId,
          uploadedAttachment.object_key,
          callbacks,
        );
      } else {
        await api.streamChat(token, trimmed, sessionId, callbacks);
      }
    } catch {
      setMessages((current) => current
        .filter((message) => {
          if (message.id === assistantMessageId && !message.content) return false;
          return true;
        })
        .map((message) =>
          message.id === optimisticMessage.id || message.id === assistantMessageId
            ? { ...message, pending: false }
            : message,
        ));
    } finally {
      setIsSending(false);
    }
  };

  const startNewSession = () => {
    if (isSending) return;
    localStorage.removeItem(storageKey);
    setSessionId(null);
    setMessages([]);
    setQuestion("");
    removeSelectedFile();
    autoFollowRef.current = true;
  };

  const selectFile = (file: File): boolean => {
      const suffix = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
      if (!ACCEPTED_FILES.split(",").includes(suffix)) {
        void messageApi.warning("仅支持 txt、md、csv、pdf、docx 和常见图片格式");
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        void messageApi.warning("文件不能超过 10 MB");
        return false;
      }

      const previousUpload = uploadedFile;
      const attemptId = uploadAttemptRef.current + 1;
      uploadAttemptRef.current = attemptId;
      if (previousUpload) {
        void api.deleteUploadedFile(token, previousUpload.object_key).catch(() => undefined);
      }
      setSelectedFile(file);
      setUploadedFile(null);
      setIsUploading(true);
      void api.uploadFile(token, file)
        .then((result) => {
          if (uploadAttemptRef.current !== attemptId) {
            // 用户在上传期间移除或替换了附件，清理迟到的对象。
            void api.deleteUploadedFile(token, result.object_key).catch(() => undefined);
            return;
          }
          setUploadedFile(result);
        })
        .catch(() => {
          if (uploadAttemptRef.current === attemptId) {
            setSelectedFile(null);
            setUploadedFile(null);
          }
        })
        .finally(() => {
          if (uploadAttemptRef.current === attemptId) setIsUploading(false);
        });
      return true;
  };

  const attachmentItems: NonNullable<AttachmentsProps["items"]> = useMemo(() => (
    selectedFile ? [{
      uid: "selected-file",
      name: selectedFile.name,
      size: selectedFile.size,
      type: selectedFile.type,
      status: isUploading ? "uploading" : "done",
      thumbUrl: selectedPreviewUrl ?? undefined,
    }] : []
  ), [isUploading, selectedFile, selectedPreviewUrl]);

  return (
    <section className="chat-page">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Agent workspace</p>
          <h1>知识对话</h1>
        </div>
        <div className="header-actions">
          <div className="knowledge-status" title="当前知识笔记数量">
            <BookOpen size={16} />
            <span>{noteCount} 条笔记</span>
          </div>
          <button className="secondary-button" onClick={startNewSession} disabled={isSending}>
            <Plus size={17} />
            <span>新会话</span>
          </button>
        </div>
      </header>

      <div
        ref={chatScrollRef}
        className="chat-scroll"
        aria-live="polite"
        onScroll={(event) => {
          const container = event.currentTarget;
          const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
          autoFollowRef.current = distanceToBottom < 96;
        }}
      >
        {isLoadingHistory ? (
          <div className="conversation-loading"><span /><span /><span /></div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <div className="assistant-emblem"><Bot size={28} /></div>
            <h2>从你的笔记开始思考</h2>
            <p>Agent 会优先检索当前账户的知识笔记，再组织回答。</p>
            <div className="starter-prompts">
              {STARTER_PROMPTS.map((prompt) => (
                <button key={prompt} onClick={() => void sendMessage(prompt)}>
                  <FileText size={16} />
                  <span>{prompt}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div ref={messageListRef} className="message-list">
            {groupMessagesIntoTurns(messages).map((turn) => (
              <section key={turn.key} className="chat-turn">
              {turn.messages.map((message) => {
              const usedNotes = message.usedNotes ?? message.used_notes;
              const displayContent = getDisplayContent(message);
              return (
              <article key={message.id} className={`message message--${message.role}`}>
                <div className="message-avatar" aria-hidden="true">
                  {message.role === "assistant" ? <Bot size={18} /> : <UserRound size={18} />}
                </div>
                <div className="message-body">
                  <div className="message-meta">
                    <strong>{message.role === "assistant" ? "Fieldnote Agent" : "你"}</strong>
                    <time>{formatMessageTime(message.created_at)}</time>
                  </div>
                  {message.attachment && message.role === "user" && (
                    <AttachmentPreview attachment={message.attachment} />
                  )}
                  {message.message_type === "form" && isChatFormDescriptor(message.message_data) ? (
                    <NoteCreateForm
                      token={token}
                      messageId={message.id}
                      descriptor={message.message_data}
                      onCreated={() => {
                        // 幂等接口可能返回已存在的 Note，重新查询可避免数量被重复累加。
                        void api.listNotes(token).then((notes) => setNoteCount(notes.length));
                      }}
                    />
                  ) : (
                    <div className={`message-content ${message.pending ? "is-pending" : ""}`}>
                      {message.role === "assistant" && message.pending && !displayContent ? (
                      <span className="typing-indicator" aria-label="Agent 正在思考">
                        <span /><span /><span />
                      </span>
                      ) : message.role === "assistant" ? (
                        <Markdown remarkPlugins={MARKDOWN_PLUGINS}>{displayContent}</Markdown>
                      ) : displayContent}
                    </div>
                  )}
                  {usedNotes.length > 0 && (
                    <details className="source-notes">
                      <summary>
                        <BookOpen size={15} />
                        引用了 {usedNotes.length} 条笔记
                      </summary>
                      <div>
                        {usedNotes.map((note) => (
                          <p key={note.id}><strong>{note.title}</strong><span>{note.content}</span></p>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </article>
              );
              })}
              </section>
            ))}
          </div>
        )}
      </div>

      <div className="composer-region">
        <Sender
          rootClassName="composer composer-x"
          value={question}
          onChange={setQuestion}
          onSubmit={(value) => void sendMessage(value)}
          submitType="enter"
          loading={isSending}
          disabled={isSending}
          autoSize={{ minRows: 1, maxRows: 5 }}
          placeholder={selectedFile ? "补充分析要求（可选）" : "向你的知识库提问..."}
          prefix={(
            <Tooltip title="上传图片或文档">
              <Button
                type="text"
                icon={<Paperclip size={19} />}
                onClick={() => attachmentsRef.current?.select({ accept: ACCEPTED_FILES })}
                aria-label="上传图片或文档"
              />
            </Tooltip>
          )}
          header={(
            <Sender.Header
              title="附件"
              open={Boolean(selectedFile)}
              forceRender
              onOpenChange={(open) => { if (!open) removeSelectedFile(); }}
            >
              <Attachments
                ref={attachmentsRef}
                accept={ACCEPTED_FILES}
                maxCount={1}
                items={attachmentItems}
                overflow="scrollX"
                beforeUpload={(file) => {
                  selectFile(file);
                  return false;
                }}
                onRemove={() => {
                  removeSelectedFile();
                  return true;
                }}
              />
            </Sender.Header>
          )}
          onPasteFile={(files) => {
            const file = files.item(0);
            if (file) selectFile(file);
          }}
        />
      </div>
    </section>
  );
}

function AttachmentPreview({ attachment }: { attachment: AttachmentInfo }) {
  const isImage = attachment.media_type.startsWith("image/");
  return (
    <div className={`message-attachment ${isImage ? "message-attachment--image" : ""}`}>
      {isImage && attachment.url ? (
        <a href={attachment.url} target="_blank" rel="noreferrer" className="message-image-link">
          <img src={attachment.url} alt={attachment.name} />
        </a>
      ) : isImage ? <Image size={19} /> : <File size={19} />}
      {!isImage && (
        <span className="message-attachment-meta">
          <strong>{attachment.name}</strong>
          <small>
            {formatFileSize(attachment.size)}
            {attachment.extraction_method ? ` · ${attachment.extraction_method}` : ""}
          </small>
        </span>
      )}
    </div>
  );
}

function groupMessagesIntoTurns(messages: DisplayMessage[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  for (const message of messages) {
    if (message.role === "user" || turns.length === 0) {
      turns.push({ key: message.id, messages: [message] });
      continue;
    }
    turns[turns.length - 1].messages.push(message);
  }
  return turns;
}

function isChatFormDescriptor(value: AgentMessage["message_data"]): value is ChatFormDescriptor {
  return Boolean(value && "kind" in value && value.kind === "note_create");
}

function getDisplayContent(message: DisplayMessage): string {
  if (message.role !== "user" || !message.attachment) return message.content;

  // 兼容旧历史数据：旧版曾把文件名和分析标签一起存入消息正文。
  const analysisPrefix = "分析要求：";
  const analysisStart = message.content.indexOf(analysisPrefix);
  if (analysisStart >= 0) {
    return message.content.slice(analysisStart + analysisPrefix.length).trim()
      || "请总结并分析这份文件";
  }
  if (message.content.startsWith("上传文件：")) {
    return "请总结并分析这份文件";
  }
  return message.content;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
