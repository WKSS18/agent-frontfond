type ErrorNotifier = (message: string) => void;


let errorNotifier: ErrorNotifier = (message) => console.error(message);


export function registerErrorNotifier(notifier: ErrorNotifier): () => void {
  errorNotifier = notifier;
  return () => {
    errorNotifier = (message) => console.error(message);
  };
}


export function notifyApiError(message: string): void {
  errorNotifier(message);
}
