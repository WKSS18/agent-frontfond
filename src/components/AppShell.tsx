import { useState } from "react";
import { BookOpen, LogOut, MessageSquareText } from "lucide-react";

import type { AppView, User } from "../types";
import { ChatPage } from "./ChatPage";
import { NotesPage } from "./NotesPage";


interface AppShellProps {
  token: string;
  user: User;
  onLogout: () => void;
}

export function AppShell({ token, user, onLogout }: AppShellProps) {
  const [view, setView] = useState<AppView>("chat");
  const [noteRevision, setNoteRevision] = useState(0);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">F</div>
          <div>
            <strong>Fieldnote</strong>
            <span>AI workspace</span>
          </div>
        </div>

        <nav className="main-nav" aria-label="Main navigation">
          <button className={view === "chat" ? "is-active" : ""} onClick={() => setView("chat")}>
            <MessageSquareText size={19} />
            <span>Chat</span>
          </button>
          <button className={view === "notes" ? "is-active" : ""} onClick={() => setView("notes")}>
            <BookOpen size={19} />
            <span>知识笔记</span>
          </button>
        </nav>

        <div className="sidebar-account">
          <div className="account-avatar">{user.email.slice(0, 1).toUpperCase()}</div>
          <div className="account-copy">
            <strong>{user.email.split("@")[0]}</strong>
            <span>{user.email}</span>
          </div>
          <button className="icon-button" onClick={onLogout} aria-label="退出登录" title="退出登录">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="workspace">
        {view === "chat" ? (
          <ChatPage token={token} userId={user.id} noteRevision={noteRevision} />
        ) : (
          <NotesPage token={token} onNotesChanged={() => setNoteRevision((value) => value + 1)} />
        )}
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button className={view === "chat" ? "is-active" : ""} onClick={() => setView("chat")}>
          <MessageSquareText size={20} />
          <span>Chat</span>
        </button>
        <button className={view === "notes" ? "is-active" : ""} onClick={() => setView("notes")}>
          <BookOpen size={20} />
          <span>笔记</span>
        </button>
        <button onClick={onLogout}>
          <LogOut size={20} />
          <span>退出</span>
        </button>
      </nav>
    </div>
  );
}
