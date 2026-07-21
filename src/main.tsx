/** 浏览器入口：挂载 React 根节点并引入全局样式。 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./styles.css";


createRoot(document.getElementById("root")!).render(
  // 开发环境保留 StrictMode，用重复执行副作用帮助发现不安全的 Effect。
  <StrictMode>
    <App />
  </StrictMode>,
);
