import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import type { VoiceRoom } from "../types";

export function VoiceRoom({ token, room, onClose }: { token: string; room: VoiceRoom; onClose: () => void }) {
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState("等待另一位参与者加入…");
  const [participants, setParticipants] = useState<string[]>([]);
  const local = useRef<MediaStream | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    let disposed = false;
    const run = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (disposed) return;
      local.current = stream;
      const connection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      peer.current = connection;
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));
      connection.ontrack = (event) => { if (audio.current) audio.current.srcObject = event.streams[0]; };
      const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/voice-rooms/${room.room_id}/signal?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl); socket.current = ws;
      connection.onicecandidate = (event) => event.candidate && ws.send(JSON.stringify({ type: "ice-candidate", candidate: event.candidate }));
      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data) as { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit; peer_count?: number; participants?: { name: string }[] };
        if (message.type === "room-ready") {
          setParticipants((message.participants ?? []).map((item) => item.name));
          setStatus(message.peer_count === 2 ? "已连接，可以开始复盘" : "等待另一位参与者加入…");
          if (message.peer_count === 2) { const offer = await connection.createOffer(); await connection.setLocalDescription(offer); ws.send(JSON.stringify({ type: "offer", sdp: offer })); }
        } else if (message.type === "offer") { await connection.setRemoteDescription(message.sdp!); const answer = await connection.createAnswer(); await connection.setLocalDescription(answer); ws.send(JSON.stringify({ type: "answer", sdp: answer })); }
        else if (message.type === "answer") await connection.setRemoteDescription(message.sdp!);
        else if (message.type === "ice-candidate") await connection.addIceCandidate(message.candidate!);
        else if (message.type === "hangup") {
          setStatus("对方已结束语音复盘");
          connection.close();
          audio.current?.srcObject && (audio.current.srcObject = null);
          local.current?.getTracks().forEach((track) => track.stop());
          ws.close(1000, "peer-hangup");
        }
      };
      ws.onclose = (event) => {
        if (!disposed && event.code !== 1000) setStatus("房间连接被拒绝，请确认使用不同账号并重新打开邀请链接");
      };
    };
    run().catch(() => setStatus("无法访问麦克风，请使用 HTTPS 并允许麦克风权限"));
    return () => {
      disposed = true;
      if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: "hangup" }));
      socket.current?.close();
      peer.current?.close();
      local.current?.getTracks().forEach((track) => track.stop());
    };
  }, [room.room_id, token]);
  return <div className="voice-room-card"><strong>笔记语音复盘</strong><span>{status}</span><small className="voice-room-participants">参与者：{participants.length ? participants.join("、") : "等待加入"}</small><audio ref={audio} autoPlay /><div><button className="secondary-button" onClick={() => { local.current?.getAudioTracks().forEach((track) => { track.enabled = muted; }); setMuted(!muted); }}>{muted ? <MicOff size={16} /> : <Mic size={16} />}{muted ? "取消静音" : "静音"}</button><button className="danger-button secondary-button" onClick={onClose}><PhoneOff size={16} />结束</button></div></div>;
}
