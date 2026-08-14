import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

interface SpeechRecognitionErrorEventLike extends Event { error: string }

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getConstructor(): SpeechRecognitionConstructor | null {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function useSpeechInput(onTranscript: (text: string) => void, onError: (message: string) => void) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);
  const supported = Boolean(getConstructor());

  const stop = useCallback(() => recognitionRef.current?.stop(), []);
  const toggle = useCallback(() => {
    if (listening) { stop(); return; }
    const Recognition = getConstructor();
    if (!Recognition) { onError("当前运行环境不支持语音识别"); return; }
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) finalText += event.results[index][0].transcript;
      }
      if (finalText.trim()) onTranscript(finalText.trim());
    };
    recognition.onerror = (event) => {
      const errors: Record<string, string> = {
        "not-allowed": "麦克风权限被拒绝，请在系统设置中允许访问",
        "audio-capture": "未检测到可用麦克风",
        network: "语音识别服务连接失败",
        "no-speech": "没有识别到语音，请重试",
      };
      if (event.error !== "aborted") onError(errors[event.error] ?? "语音识别失败，请重试");
    };
    recognition.onend = () => { recognitionRef.current = null; setListening(false); };
    recognitionRef.current = recognition;
    try { recognition.start(); setListening(true); }
    catch { recognitionRef.current = null; onError("语音识别启动失败，请重试"); }
  }, [listening, onError, onTranscript, stop]);

  useEffect(() => () => recognitionRef.current?.abort(), []);
  return { listening, supported, toggle, stop };
}
