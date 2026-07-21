import { useEffect, useMemo, useState, type FormEvent } from "react";
import { FilePlus2, Search, Trash2, X } from "lucide-react";

import { api } from "../api/client";
import type { Note } from "../types";


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

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedId) ?? null,
    [notes, selectedId],
  );

  useEffect(() => {
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

  const refreshNotes = async () => {
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

  return (
    <section className="notes-page">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Knowledge base</p>
          <h1>知识笔记</h1>
        </div>
        <button className="primary-button compact-button" onClick={() => setSelectedId("new")}>
          <FilePlus2 size={17} />
          <span>新建笔记</span>
        </button>
      </header>

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
              <textarea
                className="note-content-input"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="记录可供 Agent 检索的内容..."
                required
              />
              <div className="editor-footer">
                <span>{content.length} 字符</span>
                <button
                  type="submit"
                  className="primary-button compact-button"
                  disabled={isSaving || !title.trim() || !content.trim()}
                >
                  {isSaving ? "保存中..." : "保存笔记"}
                </button>
              </div>
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
