import { useState, type FormEvent } from "react";
import { ArrowRight, BookOpen, Eye, EyeOff, MessageSquareText, ShieldCheck } from "lucide-react";

import { api } from "../api/client";
import type { User } from "../types";


interface AuthPageProps {
  onAuthenticated: (token: string, user: User) => void;
}

type AuthMode = "login" | "register";

export function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      if (mode === "register") {
        await api.register(email, password);
      }
      const tokenResponse = await api.login(email, password);
      const user = await api.getCurrentUser(tokenResponse.access_token);
      onAuthenticated(tokenResponse.access_token, user);
    } catch {
      // API 客户端已经通过 Ant Design message 统一提示。
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
  };

  return (
    <main className="auth-layout">
      <section className="auth-intro" aria-labelledby="product-title">
        <div className="auth-brand">
          <div className="brand-mark">F</div>
          <span>Fieldnote AI</span>
        </div>
        <div className="auth-intro-copy">
          <p className="eyebrow">Personal knowledge workspace</p>
          <h1 id="product-title">把笔记变成可对话的知识。</h1>
          <p>
            整理工作笔记，向 Agent 提问，并保留每一次对话上下文。
          </p>
        </div>
        <div className="capability-list" aria-label="Product capabilities">
          <div><BookOpen size={18} /><span>私有笔记库</span></div>
          <div><MessageSquareText size={18} /><span>上下文问答</span></div>
          <div><ShieldCheck size={18} /><span>账户数据隔离</span></div>
        </div>
      </section>

      <section className="auth-form-region" aria-label="Account access">
        <div className="auth-form-wrap">
          <div className="segmented-control" aria-label="Authentication mode">
            <button
              type="button"
              className={mode === "login" ? "is-active" : ""}
              onClick={() => switchMode("login")}
            >
              登录
            </button>
            <button
              type="button"
              className={mode === "register" ? "is-active" : ""}
              onClick={() => switchMode("register")}
            >
              注册
            </button>
          </div>

          <div className="auth-heading">
            <h2>{mode === "login" ? "欢迎回来" : "创建账户"}</h2>
            <p>{mode === "login" ? "继续你的知识整理与对话。" : "建立你的独立知识空间。"}</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <label>
              <span>邮箱</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
                required
              />
            </label>

            <label>
              <span>密码</span>
              <div className="password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="至少 6 位"
                  minLength={6}
                  maxLength={72}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  title={showPassword ? "隐藏密码" : "显示密码"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            <button type="submit" className="primary-button auth-submit" disabled={isSubmitting}>
              <span>{isSubmitting ? "处理中..." : mode === "login" ? "进入工作台" : "注册并进入"}</span>
              {!isSubmitting && <ArrowRight size={18} />}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
