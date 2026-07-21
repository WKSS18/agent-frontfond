/** API 层到 UI 层的轻量错误通知桥，避免 client.ts 直接依赖 React 组件。 */
type ErrorNotifier = (message: string) => void;


let errorNotifier: ErrorNotifier = (message) => console.error(message);


export function registerErrorNotifier(notifier: ErrorNotifier): () => void {
  // 返回清理函数，符合 useEffect 的订阅/退订模型。
  errorNotifier = notifier;
  return () => {
    errorNotifier = (message) => console.error(message);
  };
}


export function notifyApiError(message: string): void {
  errorNotifier(message);
}
