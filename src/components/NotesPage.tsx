/** 知识笔记工作台：搜索列表、创建/编辑器、删除确认和数据刷新。 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { FilePlus2, Search, Sparkles, Trash2, Upload, X, BrainCircuit, Mic } from "lucide-react";

import { api } from "../api/client";
import type { Note, NoteReview } from "../types";
import type { VoiceRoom as VoiceRoomData } from "../types";
import { VoiceRoom } from "./VoiceRoom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";


interface NotesPageProps {
  token: string;
  onNotesChanged: () => void;
}

export function NotesPage({ token, onNotesChanged }: NotesPageProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<number | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const [showcaseStatus, setShowcaseStatus] = useState("");
  const [isShowcaseImporting, setIsShowcaseImporting] = useState(false);
  const [review, setReview] = useState<NoteReview | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [voiceRoom, setVoiceRoom] = useState<VoiceRoomData | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedId) ?? null,
    [notes, selectedId],
  );

  useEffect(() => {
    // 简单防抖避免用户每输入一个字符就立即发起搜索请求。
    const timeout = window.setTimeout(() => {
      setIsLoading(true);
      api.listNotes(token, search.trim())
        .then((result) => setNotes(result))
        .catch(() => undefined)
        .finally(() => setIsLoading(false));
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [search, token]);

  useEffect(() => {
    if (selectedId === "new") {
      setTitle("");
      setContent("");
    } else if (selectedNote) {
      setTitle(selectedNote.title);
      setContent(selectedNote.content);
    }
  }, [selectedId, selectedNote]);

  useEffect(() => { setReview(null); setPreviewMode(false); }, [selectedId]);

  const handleReview = async () => {
    if (typeof selectedId !== "number") return;
    setIsReviewing(true);
    try { setReview(await api.reviewNote(token, selectedId)); }
    catch (error) { window.alert(error instanceof Error ? error.message : "复盘失败"); }
    finally { setIsReviewing(false); }
  };
  const handleVoiceRoom = async () => {
    if (typeof selectedId !== "number") return;
    try { const room = await api.createVoiceRoom(token, selectedId); setVoiceRoom(room); await navigator.clipboard?.writeText(`${location.origin}/?voice_room=${room.room_id}`); }
    catch (error) { window.alert(error instanceof Error ? error.message : "语音房创建失败"); }
  };

  const refreshNotes = async () => {
    // 修改后既刷新当前列表，也通知 ChatPage 更新知识库状态。
    const result = await api.listNotes(token, search.trim());
    setNotes(result);
    onNotesChanged();
    return result;
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !content.trim() || selectedId === null) return;

    setIsSaving(true);
    try {
      const saved = selectedId === "new"
        ? await api.createNote(token, title.trim(), content.trim())
        : await api.updateNote(token, selectedId, title.trim(), content.trim());
      await refreshNotes();
      setSelectedId(saved.id);
    } catch {
      // 错误由统一 API 层提示。
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (typeof selectedId !== "number" || !selectedNote) return;
    if (!window.confirm(`确认删除“${selectedNote.title}”吗？`)) return;

    setIsSaving(true);
    try {
      await api.deleteNote(token, selectedId);
      setSelectedId(null);
      await refreshNotes();
    } catch {
      // 错误由统一 API 层提示。
    } finally {
      setIsSaving(false);
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportStatus("正在上传文档并创建 RabbitMQ 任务…");
    try {
      let task = await api.importNoteDocument(token, file);
      const labels: Record<string, string> = {
        queued: "文档已排队，等待 RabbitMQ Worker…",
        parsing: "后台 Worker 正在解析文档/OCR…",
        creating_note: "解析完成，正在创建笔记和索引任务…",
        retrying: "处理失败，正在等待自动重试…",
      };
      for (let attempt = 0; attempt < 180 && !["completed", "failed"].includes(task.status); attempt += 1) {
        setImportStatus(labels[task.stage] ?? "后台正在处理文档…");
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        task = await api.getDocumentImportTask(token, task.id);
      }
      if (task.status !== "completed" || task.note_id === null) {
        setImportStatus(task.last_error ? `导入失败：${task.last_error}` : "导入超时，请稍后刷新查看。 ");
        return;
      }
      setImportStatus("文档解析完成，笔记已创建；Embedding 正在后台写入 Qdrant。");
      await refreshNotes();
      setSelectedId(task.note_id);
    } catch {
      setImportStatus("");
    }
  };

  const handleShowcaseImport = async () => {
    if (isShowcaseImporting) return;
    setIsShowcaseImporting(true);
    setShowcaseStatus("正在整理真实 Agent 项目能力…");
    try {
      const result = await api.importAgentShowcase(token);
      setSearch("[Agent项目]");
      const projectNotes = await api.listNotes(token, "[Agent项目]");
      setNotes(projectNotes);
      setSelectedId(result.notes[0]?.id ?? projectNotes[0]?.id ?? null);
      onNotesChanged();
      setShowcaseStatus(
        result.created_count > 0
          ? `已导入 ${result.created_count} 条项目笔记，可到知识对话中按推荐问题演示。`
          : "项目笔记已经存在，保留了你后续的编辑内容。",
      );
    } catch {
      setShowcaseStatus("");
    } finally {
      setIsShowcaseImporting(false);
    }
  };

  return (
    <section className="notes-page">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Knowledge base</p>
          <h1>知识笔记</h1>
        </div>
        <div className="notes-header-actions">
          <input
            ref={importInputRef}
            className="visually-hidden"
            type="file"
            accept=".txt,.md,.csv,.pdf,.docx,.png,.jpg,.jpeg,.webp"
            onChange={(event) => void handleImport(event)}
          />
          <button
            className="secondary-button compact-button"
            onClick={() => void handleShowcaseImport()}
            disabled={isShowcaseImporting}
            title="导入可检索、可引用的真实项目能力说明"
          >
            <Sparkles size={17} />
            <span>{isShowcaseImporting ? "整理中…" : "Agent 项目笔记"}</span>
          </button>
          <button
            className="secondary-button compact-button"
            onClick={() => importInputRef.current?.click()}
            disabled={Boolean(importStatus.startsWith("正在"))}
          >
            <Upload size={17} />
            <span>{importStatus.startsWith("正在") ? "解析中…" : "导入文档"}</span>
          </button>
          <button className="primary-button compact-button" onClick={() => setSelectedId("new")}>
            <FilePlus2 size={17} />
            <span>新建笔记</span>
          </button>
        </div>
      </header>

      {importStatus && <div className="note-import-status" role="status">{importStatus}</div>}
      {showcaseStatus && <div className="note-import-status" role="status">{showcaseStatus}</div>}

      <div className="notes-workspace">
        <div className="notes-list-panel">
          <div className="search-field">
            <Search size={17} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索标题或内容"
            />
          </div>

          <div className="notes-list">
            {isLoading ? (
              <div className="list-loading"><span /><span /><span /></div>
            ) : notes.length === 0 ? (
              <div className="notes-empty-list">
                <FilePlus2 size={22} />
                <p>{search ? "没有匹配的笔记" : "还没有知识笔记"}</p>
              </div>
            ) : (
              notes.map((note) => (
                <button
                  key={note.id}
                  className={`note-list-item ${selectedId === note.id ? "is-active" : ""}`}
                  onClick={() => setSelectedId(note.id)}
                >
                  <strong>{note.title}</strong>
                  <span>{note.content}</span>
                  <time>{formatNoteDate(note.updated_at)}</time>
                </button>
              ))
            )}
          </div>
        </div>

        <div className={`note-editor-panel ${selectedId !== null ? "is-open" : ""}`}>
          {selectedId === null ? (
            <div className="editor-empty">
              <FilePlus2 size={28} />
              <h2>选择或新建一条笔记</h2>
              <p>保存后的内容会成为 Agent 回答时的检索上下文。</p>
            </div>
          ) : (
            <form className="note-editor" onSubmit={handleSave}>
              <div className="editor-toolbar">
                <span>{selectedId === "new" ? "新笔记" : "编辑笔记"}</span>
                <div>
                  {typeof selectedId === "number" && <button type="button" className="text-button" onClick={() => setPreviewMode((value) => !value)}>{previewMode ? "编辑" : "Markdown 预览"}</button>}
                  {typeof selectedId === "number" && (
                    <button
                      type="button"
                      className="icon-button danger-button"
                      onClick={() => void handleDelete()}
                      disabled={isSaving}
                      aria-label="删除笔记"
                      title="删除笔记"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-button mobile-editor-close"
                    onClick={() => setSelectedId(null)}
                    aria-label="关闭编辑器"
                  >
                    <X size={19} />
                  </button>
                </div>
              </div>

              <input
                className="note-title-input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="笔记标题"
                maxLength={200}
                required
              />
              {previewMode ? (
                <article className="note-markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content || "（暂无内容）"}</ReactMarkdown></article>
              ) : (
                <textarea className="note-content-input" value={content} onChange={(event) => setContent(event.target.value)} placeholder="记录可供 Agent 检索的内容..." required />
              )}
              <div className="editor-footer">
                <span>{content.length} 字符</span>
                {typeof selectedId === "number" && (
                  <button type="button" className="secondary-button compact-button" onClick={() => void handleReview()} disabled={isReviewing}>
                    <BrainCircuit size={16} /> {isReviewing ? "复盘中…" : "生成今日复盘"}
                  </button>
                )}
                {typeof selectedId === "number" && <button type="button" className="secondary-button compact-button" onClick={() => void handleVoiceRoom()}><Mic size={16} />语音复盘</button>}
                <button
                  type="submit"
                  className="primary-button compact-button"
                  disabled={isSaving || !title.trim() || !content.trim()}
                >
                  {isSaving ? "保存中..." : "保存笔记"}
                </button>
              </div>
              {review && (
                <div className="note-review-card">
                  <strong>今日复盘</strong><p>{review.summary}</p>
                  <b>关键点</b><ul>{review.key_points.map((item) => <li key={item}>{item}</li>)}</ul>
                  <b>自测题</b><ul>{review.questions.map((item) => <li key={item}>{item}</li>)}</ul>
                  <b>待办</b><ul>{review.todo_items.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              )}
              {voiceRoom && <VoiceRoom token={token} room={voiceRoom} onClose={() => setVoiceRoom(null)} />}
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function formatNoteDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
