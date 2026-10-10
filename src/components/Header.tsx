"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";

export type AgentStatus = "idle" | "running" | "done";

export interface AgentPill {
  id:     string;
  name:   string;
  status: AgentStatus;
}

const AGENTS: AgentPill[] = [
  { id: "A01", name: "統籌", status: "idle" },
  { id: "A02", name: "Ada",  status: "idle" },
  { id: "A03", name: "Ethan", status: "idle" },
  { id: "A04", name: "Carla", status: "idle" },
  { id: "A05", name: "Andy", status: "idle" },
  { id: "A06", name: "Donna", status: "idle" },
];

interface HeaderProps {
  agentStatuses?: Record<string, AgentStatus>;
  engine?: string;
  onOpenSettings?: () => void;
}

export default function Header({ agentStatuses = {}, engine = "ollama", onOpenSettings }: HeaderProps) {
  const { data: session } = useSession();
  const [showMenu,      setShowMenu]      = useState(false);
  const [pendingCount,  setPendingCount]  = useState(0);

  const isApprover = session?.user?.role === "ADMIN" || session?.user?.role === "APPROVER";

  useEffect(() => {
    if (!isApprover) return;
    async function fetchPending() {
      try {
        const res = await fetch("/api/approvals?status=PENDING");
        if (res.ok) {
          const data = await res.json();
          setPendingCount(Array.isArray(data) ? data.length : 0);
        }
      } catch {}
    }
    fetchPending();
    const id = setInterval(fetchPending, 30_000);
    return () => clearInterval(id);
  }, [isApprover]);

  const engineLabel = engine === "claude" ? "Claude" : engine === "ollama" ? "本地 Ollama" : "本地 LM Studio";
  const engineColor = engine === "claude" ? "var(--primary)" : "var(--amber)";

  return (
    <header
      style={{
        background:   "var(--card)",
        borderBottom: "1px solid var(--border)",
        padding:      "0 20px",
        height:       56,
        display:      "flex",
        alignItems:   "center",
        gap:          16,
        position:     "sticky",
        top:          0,
        zIndex:       100,
        boxShadow:    "0 2px 0 var(--primary-light)",
      }}
    >
      {/* 印章 Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div
          style={{
            width:      36,
            height:     36,
            background: "var(--seal)",
            color:      "#fff",
            fontFamily: "var(--serif)",
            fontSize:   18,
            fontWeight: 700,
            display:    "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow:  "2px 2px 0 var(--primary-light)",
            flexShrink: 0,
          }}
        >
          智
        </div>
        <div>
          <div style={{ fontFamily: "var(--serif)", fontWeight: 700, fontSize: 15, color: "var(--ink)", lineHeight: 1.2 }}>
            基智 Agent OS
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--ink3)", textTransform: "uppercase" }}>
            KCSS · 教師工作台
          </div>
        </div>
      </div>

      {/* Agent Pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "nowrap", overflow: "hidden", flex: 1 }}>
        {AGENTS.map((agent) => {
          const status = agentStatuses[agent.id] ?? "idle";
          return (
            <div
              key={agent.id}
              style={{
                padding:       "3px 9px",
                borderRadius:  20,
                fontSize:      11,
                fontFamily:    "var(--mono)",
                fontWeight:    500,
                background:    status === "running" ? "var(--amber)"
                             : status === "done"    ? "var(--green)"
                             :                       "var(--primary-light)",
                color:         status === "idle"    ? "var(--ink3)" : "#fff",
                border:        `1px solid ${status === "idle" ? "var(--border)" : "transparent"}`,
                transition:    "all 0.2s",
                display:       "flex",
                alignItems:    "center",
                gap:           4,
                whiteSpace:    "nowrap",
              }}
            >
              {status === "running" && (
                <span style={{ animation: "pulse 1s infinite" }}>●</span>
              )}
              {agent.id} {agent.name}
            </div>
          );
        })}
      </div>

      {/* 指揮中心 */}
      <a
        href="/dashboard"
        style={{
          fontFamily:  "var(--mono)",
          fontSize:    10,
          color:       "var(--ink3)",
          background:  "var(--primary-light)",
          border:      "1px solid var(--border)",
          padding:     "2px 8px",
          borderRadius: 3,
          flexShrink:  0,
          textDecoration: "none",
          display:     "flex",
          alignItems:  "center",
          gap:         4,
        }}
        title="指揮中心"
      >
        🎛 儀表板
      </a>

      {/* 待批核文件徽章 (ADMIN/APPROVER) */}
      {isApprover && (
        <a
          href="/approvals"
          style={{
            fontFamily:  "var(--mono)",
            fontSize:    10,
            color:       pendingCount > 0 ? "#fff" : "var(--ink3)",
            background:  pendingCount > 0 ? "var(--amber)" : "var(--primary-light)",
            border:      `1px solid ${pendingCount > 0 ? "var(--amber)" : "var(--border)"}`,
            padding:     "2px 8px",
            borderRadius: 3,
            flexShrink:  0,
            textDecoration: "none",
            display:     "flex",
            alignItems:  "center",
            gap:         4,
          }}
          title="待批核文件"
        >
          📋 {pendingCount > 0 ? `${pendingCount} 待批核` : "批核"}
        </a>
      )}

      {/* 引擎標籤（撳入去開設定） */}
      <button
        onClick={onOpenSettings}
        title="引擎設定"
        style={{
          fontFamily: "var(--mono)",
          fontSize:   10,
          color:      engineColor,
          border:     `1px solid ${engineColor}`,
          padding:    "2px 8px",
          borderRadius: 3,
          flexShrink: 0,
          background: "none",
          cursor:     onOpenSettings ? "pointer" : "default",
          display:    "flex",
          alignItems: "center",
          gap:        4,
        }}
      >
        ⚙ {engineLabel}
      </button>

      {/* 用戶選單 */}
      {session?.user && (
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setShowMenu((v) => !v)}
            style={{
              background: "var(--primary-light)",
              border:     "1px solid var(--border)",
              borderRadius: 4,
              padding:    "4px 10px",
              fontSize:   12,
              color:      "var(--ink2)",
              cursor:     "pointer",
              fontFamily: "var(--sans)",
            }}
          >
            {session.user.name?.split(" ")[0]}
          </button>
          {showMenu && (
            <div
              style={{
                position:  "absolute",
                top:       "calc(100% + 6px)",
                right:     0,
                background: "var(--card)",
                border:    "1px solid var(--border)",
                borderRadius: 4,
                padding:   "8px 0",
                minWidth:  160,
                boxShadow: "2px 2px 0 var(--primary-light)",
                zIndex:    200,
              }}
            >
              <div style={{ padding: "4px 16px 8px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{session.user.name}</div>
                <div style={{ fontSize: 10, color: "var(--ink3)", fontFamily: "var(--mono)" }}>{session.user.email}</div>
                <div style={{ fontSize: 10, color: "var(--primary)", marginTop: 2 }}>{session.user.role}</div>
              </div>
              <a href="/settings/templates" style={{ display: "block", padding: "6px 16px", fontSize: 13, color: "var(--ink2)", textDecoration: "none" }}>
                範本庫
              </a>
              {session.user.role === "ADMIN" && (
                <>
                  <a href="/settings/timetable" style={{ display: "block", padding: "6px 16px", fontSize: 13, color: "var(--ink2)", textDecoration: "none" }}>
                    時間表上載
                  </a>
                  <a href="/admin/users" style={{ display: "block", padding: "6px 16px", fontSize: 13, color: "var(--ink2)", textDecoration: "none" }}>
                    用戶管理
                  </a>
                </>
              )}
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "6px 16px", fontSize: 13, color: "var(--seal)",
                  background: "none", border: "none", cursor: "pointer",
                  fontFamily: "var(--sans)",
                }}
              >
                登出
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }
      `}</style>
    </header>
  );
}
