import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, RefreshCw } from "lucide-react";
import type { VoiceRoom } from "../types";

type MicrophoneState = "idle" | "requesting" | "ready" | "denied" | "unavailable";

interface SignalMessage {
  type: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  peer_count?: number;
  participants?: { name: string }[];
}

function microphoneErrorMessage(state: MicrophoneState): string | null {
  if (state === "denied") return "麦克风权限未开启。请在地址栏的网站设置中允许麦克风，然后点击重试。";
  if (state === "unavailable") return "没有检测到可用麦克风，或麦克风正被其他程序占用。";
  if (state === "requesting") return "正在请求麦克风权限…";
  return null;
}

export function VoiceRoom({ token, room, onClose }: { token: string; room: VoiceRoom; onClose: () => void }) {
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState("正在加入语音房间…");
  const [participants, setParticipants] = useState<string[]>([]);
  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>("idle");
  const local = useRef<MediaStream | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const disposed = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const enableMicrophone = useCallback(async () => {
    if (local.current?.active) return;
    setMicrophoneState("requesting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("getUserMedia unavailable", "NotSupportedError");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (disposed.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      local.current = stream;
      const connection = peer.current;
      if (connection) {
        const existingTrackIds = new Set(connection.getSenders().map((sender) => sender.track?.id));
        stream.getTracks().forEach((track) => {
          if (!existingTrackIds.has(track.id)) connection.addTrack(track, stream);
        });
      }
      setMuted(false);
      setMicrophoneState("ready");
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setMicrophoneState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
    }
  }, []);

  useEffect(() => {
    disposed.current = false;
    const connection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peer.current = connection;
    connection.ontrack = (event) => {
      if (audio.current) audio.current.srcObject = event.streams[0];
    };

    const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/voice-rooms/${room.room_id}/signal?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    connection.onicecandidate = (event) => {
      if (event.candidate && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ice-candidate", candidate: event.candidate }));
      }
    };
    ws.onopen = () => setStatus("已加入房间，等待另一位参与者…");
    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data) as SignalMessage;
      if (message.type === "room-ready") {
        setParticipants((message.participants ?? []).map((item) => item.name));
        setStatus(message.peer_count === 2 ? "两位参与者已加入，正在建立语音连接…" : "已加入房间，等待另一位参与者…");
        if (message.peer_count === 2) {
          const offer = await connection.createOffer();
          await connection.setLocalDescription(offer);
          ws.send(JSON.stringify({ type: "offer", sdp: offer }));
        }
      } else if (message.type === "offer") {
        await connection.setRemoteDescription(message.sdp!);
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "answer", sdp: answer }));
        setStatus("语音连接已建立");
      } else if (message.type === "answer") {
        await connection.setRemoteDescription(message.sdp!);
        setStatus("语音连接已建立");
      } else if (message.type === "ice-candidate") {
        await connection.addIceCandidate(message.candidate!);
      } else if (message.type === "hangup") {
        connection.close();
        if (audio.current) audio.current.srcObject = null;
        local.current?.getTracks().forEach((track) => track.stop());
        ws.close(1000, "peer-hangup");
        window.alert("对方已结束语音复盘，房间已关闭。");
        onCloseRef.current();
      }
    };
    ws.onerror = () => setStatus("房间连接失败，请刷新邀请链接后重试");
    ws.onclose = (event) => {
      if (!disposed.current && event.code !== 1000) setStatus("房间连接被拒绝，请确认使用不同账号并重新打开邀请链接");
    };

    // 房间成员同步不依赖麦克风权限；即使用户拒绝授权，也能看到双方用户名并可再次授权。
    void enableMicrophone();

    return () => {
      disposed.current = true;
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "hangup" }));
      ws.close();
      connection.close();
      local.current?.getTracks().forEach((track) => track.stop());
      local.current = null;
    };
  }, [enableMicrophone, room.room_id, token]);

  const microphoneMessage = microphoneErrorMessage(microphoneState);
  return (
    <div className="voice-room-card">
      <strong>笔记语音复盘</strong>
      <span>{status}</span>
      {microphoneMessage && <span role="status">{microphoneMessage}</span>}
      <small className="voice-room-participants">参与者：{participants.length ? participants.join("、") : "正在连接"}</small>
      <audio ref={audio} autoPlay />
      <div>
        {microphoneState === "denied" || microphoneState === "unavailable" ? (
          <button className="secondary-button" onClick={() => void enableMicrophone()}>
            <RefreshCw size={16} />重试麦克风
          </button>
        ) : (
          <button
            className="secondary-button"
            disabled={microphoneState !== "ready"}
            onClick={() => {
              local.current?.getAudioTracks().forEach((track) => { track.enabled = muted; });
              setMuted(!muted);
            }}
          >
            {muted ? <MicOff size={16} /> : <Mic size={16} />}{muted ? "取消静音" : "静音"}
          </button>
        )}
        <button className="danger-button secondary-button" onClick={onClose}><PhoneOff size={16} />结束</button>
      </div>
    </div>
  );
}
