"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import DocCard from "./DocCard";
import VoiceButton from "./VoiceButton";
import type { AgentStatus } from "./Header";

interface Message {
  role:          "user" | "assistant";
  content:       string;
  agentId?:      string;
  documentId?:   string;
  docType?:      string;
  docTitle?:     string;
  needsApproval?: boolean;
}

const CHIPS = [
  "幫我出 F.3 數學測驗",
  "代課安排通告",
  "夾空堂",
  "出工作紙",
  "分析成績",
  "家長通告",
];

const AGENT_NAME: Record<string, string> = {
  A01: "統籌助手", A02: "Ada 課程顧問", A03: "Ethan 試卷設計師",
  A04: "Carla 內容製作師", A05: "Andy 校務行政", A06: "Donna 數據分析師",
};

interface ChatPanelProps {
  onAgentStatus?: (agentId: string, status: AgentStatus) => void;
  initialPrompt?: string;
  engine?: string;
  engineConfig?: { baseUrl?: string; model?: string };
}

export default function ChatPanel({ onAgentStatus, initialPrompt, engine = "ollama", engineConfig }: ChatPanelProps) {
  const [messages, setMessages]     = useState<Message[]>([]);
  const [input, setInput]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [streaming, setStreaming]   = useState("");
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [privacyHint, setPrivacyHint] = useState(false);
  const bottomRef                   = useRef<HTMLDivElement>(null);
  const textareaRef                 = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialPrompt) {
      setInput(initialPrompt);
      textareaRef.current?.focus();
    }
  }, [initialPrompt]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setLoading(true);
    setStreaming("");

    const apiMessages = history.map((m) => ({ role: m.role, content: m.content }));
    let   accumulated  = "";
    let   currentAgent = "A01";
    let   docInfo: Partial<Message> = {};

    try {
      const res = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ messages: apiMessages, engine, engineConfig }),
      });

      const reader = res.body!.getReader();
      const dec    = new TextDecoder();
      let   buf    = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.status === "running" && data.agentId) {
              currentAgent = data.agentId;
              setActiveAgent(data.agentId);
              onAgentStatus?.(data.agentId, "running");
            }

            // A06 雲端成績分析 → 建議切換本地引擎
            if (data.privacyHint) setPrivacyHint(true);

            // 伺服器錯誤 → 顯示錯誤訊息
            if (data.error) {
              accumulated = `⚠ ${data.error}`;
            }

            if (data.chunk && data.text) {
              accumulated += data.text;
              setStreaming(accumulated);
            }

            if (data.status === "done" && data.agentId) {
              onAgentStatus?.(data.agentId, "done");
            }

            if (data.final) {
              if (data.documentId) {
                docInfo = {
                  documentId:    data.documentId,
                  docType:       data.docType,
                  needsApproval: data.needsApproval,
                };
              }
              // Dispatcher 直接回傳（非 stream）
              if (!data.chunk && data.text && !accumulated) accumulated = data.text;
            }
          } catch {}
        }
      }

      const cleanText = accumulated
        .replace(/\[DOCREADY\]/g, "")
        .replace(/\[DOCTYPE:[^\]]+\]/g, "")
        .replace(/\[NEEDS_APPROVAL\]/g, "")
        .replace(/\[ROUTE:\w+\]/g, "")
        .replace(/\[NEED_TOOL:\w+\](\s*\{[\s\S]*?\})?/g, "")
        .replace(/\[TITLE:[^\]]+\]/g, "")
        .trim();

      // 只有真正有內容才加到訊息列表
      if (cleanText) {
        setMessages((prev) => [
          ...prev,
          {
            role:    "assistant",
            content: cleanText,
            agentId: currentAgent,
            ...docInfo,
            docTitle: cleanText.split("\n").find((l) => l.trim())?.slice(0, 50),
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "系統出現問題，請稍後再試。", agentId: "A01" },
      ]);
    } finally {
      setStreaming("");
      setLoading(false);
      setActiveAgent(null);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div
      style={{
        flex:       1,
        display:    "flex",
        flexDirection: "column",
        overflow:   "hidden",
        background: "var(--bg)",
        position:   "relative",
      }}
    >
      {/* A06 私隱提示 */}
      {privacyHint && (
        <div
          style={{
            background: "#FFF8ED",
            borderBottom: "1px solid var(--amber)",
            padding:    "8px 20px",
            fontSize:   12,
            color:      "var(--ink)",
            display:    "flex",
            alignItems: "center",
            gap:        8,
          }}
        >
          <span>💡 處理學生成績等敏感數據時，建議切換<strong>本地引擎</strong>（撳右上角 ⚙ 引擎標籤），數據不出校。</span>
          <button
            onClick={() => setPrivacyHint(false)}
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--ink3)", fontSize: 14 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 訊息區 */}
      <div
        style={{
          flex:       1,
          overflowY:  "auto",
          padding:    "24px 20px",
          display:    "flex",
          flexDirection: "column",
          gap:        16,
        }}
      >
        {/* 歡迎空狀態 */}
        {messages.length === 0 && !loading && (
          <div
            style={{
              flex:           1,
              display:        "flex",
              flexDirection:  "column",
              alignItems:     "center",
              justifyContent: "center",
              position:       "relative",
              minHeight:      300,
            }}
          >
            {/* 巨型水印 */}
            <div
              style={{
                position:  "absolute",
                fontFamily: "var(--serif)",
                fontSize:  "20vw",
                color:     "var(--primary)",
                opacity:   0.04,
                lineHeight: 1,
                pointerEvents: "none",
                userSelect: "none",
              }}
              aria-hidden
            >
              基智
            </div>
            <div style={{ position: "relative", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--serif)", fontSize: 22, color: "var(--ink)", marginBottom: 8 }}>
                你好！我係基智 Agent OS
              </div>
              <div style={{ fontFamily: "var(--sans)", fontSize: 14, color: "var(--ink3)", lineHeight: 1.7 }}>
                直接告訴我你想做咩<br />
                例如：「幫我出 F.3 數學測驗」或「代課安排通告」
              </div>
            </div>
          </div>
        )}

        {/* 訊息列表 */}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display:       "flex",
              flexDirection: msg.role === "user" ? "row-reverse" : "row",
              alignItems:    "flex-start",
              gap:           10,
            }}
          >
            {msg.role === "assistant" && (
              <div
                style={{
                  width:      30,
                  height:     30,
                  background: "var(--primary)",
                  color:      "#fff",
                  borderRadius: 2,
                  display:    "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize:   11,
                  fontFamily: "var(--mono)",
                  flexShrink: 0,
                  boxShadow:  "1px 1px 0 var(--primary-light)",
                }}
              >
                {msg.agentId?.slice(-2) ?? "AI"}
              </div>
            )}
            <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", gap: 6 }}>
              {msg.role === "assistant" && msg.agentId && (
                <div style={{ fontSize: 10, color: "var(--ink3)", fontFamily: "var(--mono)" }}>
                  {AGENT_NAME[msg.agentId] ?? msg.agentId}
                </div>
              )}
              <div
                style={{
                  background:   msg.role === "user" ? "var(--primary)" : "var(--card)",
                  color:        msg.role === "user" ? "#fff" : "var(--ink)",
                  padding:      "10px 14px",
                  borderRadius: 4,
                  fontSize:     14,
                  lineHeight:   1.7,
                  border:       msg.role === "user" ? "none" : "1px solid var(--border)",
                  boxShadow:    "2px 2px 0 var(--primary-light)",
                  whiteSpace:   "pre-wrap",
                  fontFamily:   "var(--sans)",
                }}
              >
                {msg.content}
              </div>
              {msg.documentId && (
                <DocCard
                  documentId={msg.documentId}
                  title={msg.docTitle ?? msg.docType ?? "文件"}
                  docType={msg.docType ?? "文件"}
                  needsApproval={msg.needsApproval}
                />
              )}
            </div>
          </div>
        ))}

        {/* 串流中 */}
        {(loading || streaming) && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div
              style={{
                width:      30,
                height:     30,
                background: "var(--amber)",
                color:      "#fff",
                borderRadius: 2,
                display:    "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize:   11,
                fontFamily: "var(--mono)",
                flexShrink: 0,
              }}
            >
              {activeAgent?.slice(-2) ?? "AI"}
            </div>
            <div
              style={{
                background: "var(--card)",
                border:     "1px solid var(--border)",
                borderRadius: 4,
                padding:    "10px 14px",
                fontSize:   14,
                lineHeight: 1.7,
                boxShadow:  "2px 2px 0 var(--primary-light)",
                maxWidth:   "72%",
                whiteSpace: "pre-wrap",
                fontFamily: "var(--sans)",
                color:      "var(--ink)",
              }}
            >
              {streaming || (
                <span style={{ color: "var(--ink3)" }}>
                  {activeAgent ? `${AGENT_NAME[activeAgent] ?? activeAgent} 處理中…` : "處理中…"}
                </span>
              )}
              {streaming && (
                <span
                  style={{
                    display:    "inline-block",
                    width:      8,
                    height:     14,
                    background: "var(--primary)",
                    marginLeft: 2,
                    animation:  "blink 0.8s step-end infinite",
                    verticalAlign: "text-bottom",
                  }}
                />
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 快捷 chips */}
      {messages.length === 0 && (
        <div style={{ padding: "0 20px 10px", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => sendMessage(chip)}
              style={{
                padding:      "5px 12px",
                background:   "var(--card)",
                border:       "1px solid var(--border2)",
                borderRadius: 20,
                fontSize:     12,
                color:        "var(--primary-dark)",
                cursor:       "pointer",
                fontFamily:   "var(--sans)",
                boxShadow:    "1px 1px 0 var(--primary-light)",
              }}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* 輸入區 */}
      <form
        onSubmit={handleSubmit}
        style={{
          borderTop:   "1px solid var(--border)",
          padding:     "12px 20px",
          background:  "var(--card)",
          display:     "flex",
          gap:         10,
          alignItems:  "flex-end",
        }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="輸入任何指示…（Enter 發送，Shift+Enter 換行）"
          rows={2}
          disabled={loading}
          style={{
            flex:       1,
            resize:     "none",
            border:     "1px solid var(--border2)",
            borderRadius: 4,
            padding:    "10px 14px",
            fontSize:   14,
            fontFamily: "var(--sans)",
            color:      "var(--ink)",
            background: "var(--bg)",
            outline:    "none",
            boxShadow:  "2px 2px 0 var(--primary-light)",
            lineHeight: 1.5,
          }}
        />
        <VoiceButton
          onResult={(text) => setInput((prev) => prev ? `${prev} ${text}` : text)}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            padding:      "10px 18px",
            background:   loading ? "var(--ink3)" : "var(--primary)",
            color:        "#fff",
            border:       "none",
            borderRadius: 4,
            fontSize:     14,
            fontWeight:   600,
            cursor:       loading ? "wait" : "pointer",
            fontFamily:   "var(--sans)",
            boxShadow:    "2px 2px 0 var(--primary-light)",
            flexShrink:   0,
            alignSelf:    "flex-end",
          }}
        >
          {loading ? "…" : "發送"}
        </button>
      </form>

      <style>{`
        @keyframes blink { 0%,100% { opacity:1 } 50% { opacity:0 } }
      `}</style>
    </div>
  );
}
