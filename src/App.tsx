/**
 * 应用根组件：配置 UI 主题、恢复登录态，并在认证页与工作台之间切换。
 * 这里只管理全局身份，不承载聊天或笔记的具体业务状态。
 */
import { useEffect, useState } from "react";
import { App as AntdApp, ConfigProvider } from "antd";

import { api, ApiError } from "./api/client";
import { registerErrorNotifier } from "./api/feedback";
import { AppShell } from "./components/AppShell";
import { AuthPage } from "./components/AuthPage";
import type { User } from "./types";


const TOKEN_KEY = "fieldnote_access_token";

export default function App() {
  // ConfigProvider 统一品牌 token；AntdApp 为 message 等静态反馈提供 React 上下文。
  return (
    <ConfigProvider theme={{ token: { colorPrimary: "#176b62", borderRadius: 6 } }}>
      <AntdApp>
        <Application />
      </AntdApp>
    </ConfigProvider>
  );
}

function Application() {
  const { message } = AntdApp.useApp();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [isBooting, setIsBooting] = useState(Boolean(token));

  // 将无 UI 依赖的 API 层错误桥接到 Ant Design，全站只维护一套错误提示。
  useEffect(() => registerErrorNotifier((text) => void message.error(text)), [message]);

  useEffect(() => {
    if (!token) {
      setIsBooting(false);
      return;
    }
    // 登录页已经取得用户信息时直接复用，避免设置 token 后重复请求 /users/me。
    if (user) {
      setIsBooting(false);
      return;
    }

    let active = true;
    api.getCurrentUser(token)
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch((error: unknown) => {
        if (active && error instanceof ApiError && error.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
        }
      })
      .finally(() => {
        if (active) setIsBooting(false);
      });

    return () => {
      active = false;
    };
  }, [token, user]);

  const handleAuthenticated = (accessToken: string, currentUser: User) => {
    // Token 负责刷新恢复；User 只存内存，启动时重新向后端确认令牌是否仍有效。
    localStorage.setItem(TOKEN_KEY, accessToken);
    setToken(accessToken);
    setUser(currentUser);
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  if (isBooting) {
    return (
      <main className="boot-screen" aria-label="Loading application">
        <div className="brand-mark brand-mark--large">F</div>
        <span className="loading-line" />
      </main>
    );
  }

  if (!token || !user) {
    return <AuthPage onAuthenticated={handleAuthenticated} />;
  }

  return <AppShell token={token} user={user} onLogout={handleLogout} />;
}
