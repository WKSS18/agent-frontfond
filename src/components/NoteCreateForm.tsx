import { useState, type FormEvent } from "react";
import { CheckCircle2, LoaderCircle, Save } from "lucide-react";

import { api } from "../api/client";
import type { ChatFormDescriptor, Note } from "../types";


interface NoteCreateFormProps {
  token: string;
  messageId: number;
  descriptor: ChatFormDescriptor;
  onCreated: (note: Note) => void;
}

export function NoteCreateForm({ token, messageId, descriptor, onCreated }: NoteCreateFormProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdNote, setCreatedNote] = useState<Note | null>(null);

  const titleField = descriptor.fields.find((field) => field.name === "title");
  const contentField = descriptor.fields.find((field) => field.name === "content");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (messageId <= 0 || !title.trim() || !content.trim() || isSubmitting || createdNote) return;

    setIsSubmitting(true);
    try {
      const note = await api.submitNoteForm(
        token,
        messageId,
        title.trim(),
        content.trim(),
      );
      setCreatedNote(note);
      onCreated(note);
    } catch {
      // 错误由统一 API 层提示。
    } finally {
      setIsSubmitting(false);
    }
  };

  const completedTitle = createdNote?.title ?? descriptor.result?.title;
  if (descriptor.status === "completed" || completedTitle) {
    return (
      <div className="inline-form-success" role="status">
        <CheckCircle2 size={19} />
        <div><strong>笔记已创建</strong><span>{completedTitle ?? "已保存到知识笔记"}</span></div>
      </div>
    );
  }

  return (
    <form className="inline-note-form" onSubmit={handleSubmit}>
      <header>
        <strong>{descriptor.title}</strong>
        <span>{descriptor.description}</span>
      </header>
      <label>
        <span>{titleField?.label ?? "标题"}</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={titleField?.placeholder}
          maxLength={titleField?.max_length ?? 200}
          disabled={isSubmitting}
          required
        />
      </label>
      <label>
        <span>{contentField?.label ?? "内容"}</span>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={contentField?.placeholder}
          rows={4}
          disabled={isSubmitting}
          required
        />
      </label>
      <button
        className="primary-button compact-button"
        type="submit"
        disabled={isSubmitting || messageId <= 0}
      >
        {isSubmitting ? <LoaderCircle className="spin-icon" size={16} /> : <Save size={16} />}
        <span>{isSubmitting ? "正在创建" : descriptor.submit_label}</span>
      </button>
    </form>
  );
}
