/** 已登录后的应用外壳：桌面/移动导航、账户区域和页面级视图切换。 */
import { useState } from "react";
import { BookOpen, LogOut, MessageSquareText, NotebookPen } from "lucide-react";

import type { AppView, User } from "../types";
import { ChatPage } from "./ChatPage";
import { NotesPage } from "./NotesPage";
import { VoiceRoom } from "./VoiceRoom";
import type { VoiceRoom as VoiceRoomData } from "../types";


interface AppShellProps {
  token: string;
  user: User;
  onLogout: () => void;
}

export function AppShell({ token, user, onLogout }: AppShellProps) {
  // 兼容标准查询参数和历史上被复制成路径的邀请链接：/voice_room=xxxx。
  const inviteRoomId = new URLSearchParams(window.location.search).get("voice_room")
    ?? window.location.pathname.match(/^\/voice_room=([^/]+)$/)?.[1]
    ?? null;
  const [view, setView] = useState<AppView>(inviteRoomId ? "notes" : "chat");
  const [noteRevision, setNoteRevision] = useState(0);
  // Notes 修改后递增版本号，让常驻 ChatPage 重新获取知识库数量而无需全局状态库。

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark"><NotebookPen size={21} /></div>
          <div>
            <strong>知记</strong>
            <span>AI 知识笔记</span>
          </div>
        </div>

        <nav className="main-nav" aria-label="Main navigation">
          <button className={view === "chat" ? "is-active" : ""} onClick={() => setView("chat")}>
            <MessageSquareText size={19} />
            <span>知识对话</span>
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
        {inviteRoomId ? (
          <VoiceRoomInvite token={token} roomId={inviteRoomId} onClose={() => window.history.replaceState({}, "", window.location.pathname)} />
        ) : view === "chat" ? (
          <ChatPage token={token} userId={user.id} noteRevision={noteRevision} />
        ) : (
          <NotesPage token={token} onNotesChanged={() => setNoteRevision((value) => value + 1)} />
        )}
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button className={view === "chat" ? "is-active" : ""} onClick={() => setView("chat")}>
          <MessageSquareText size={20} />
          <span>对话</span>
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

function VoiceRoomInvite({ token, roomId, onClose }: { token: string; roomId: string; onClose: () => void }) {
  const room: VoiceRoomData = { room_id: roomId, note_id: 0, expires_at: "" };
  return <section className="voice-invite-page"><VoiceRoom token={token} room={room} onClose={onClose} /></section>;
}
