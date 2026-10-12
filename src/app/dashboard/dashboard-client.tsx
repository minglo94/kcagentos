"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { STATUS_COLOR, STATUS_LABEL } from "@/components/SkillRail";

interface DashTask {
  id:        string;
  title:     string;
  agentId:   string;
  status:    "RUNNING" | "DONE" | "FAILED" | "PENDING_APPROVAL";
  createdAt: string;
  document:  { id: string; docType: string } | null;
  user:      { name: string };
}

interface DashTodo {
  id:        string;
  text:      string;
  done:      boolean;
  createdAt: string;
}

interface DashData {
  scope:  "mine" | "all";
  vitals: { weekTasks: number; weekDocs: number; pendingApprovals: number; weekSubs: number };
  tasks:  DashTask[];
  todos:  DashTodo[];
}

const COMMAND_DECK: { icon: string; label: string; prompt: string }[] = [
  { icon: "📄", label: "出試卷",   prompt: "幫我出試卷" },
  { icon: "🔍", label: "夾空堂",   prompt: "幫我夾空堂，找共同空檔" },
  { icon: "✉️", label: "家長通告", prompt: "幫我出家長通告" },
  { icon: "📋", label: "代課安排", prompt: "幫我出代課安排通告" },
  { icon: "📊", label: "成績分析", prompt: "幫我分析班級成績" },
  { icon: "✏️", label: "出工作紙", prompt: "幫我出工作紙" },
];

const AGENT_NAME: Record<string, string> = {
  A01: "統籌", A02: "Ada", A03: "Ethan", A04: "Carla", A05: "Andy", A06: "Donna",
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "早晨";
  if (h < 18) return "午安";
  return "晚上好";
}

export default function DashboardClient({ userName, role }: { userName: string; role: string }) {
  const [data,     setData]     = useState<DashData | null>(null);
  const [scope,    setScope]    = useState<"mine" | "all">("mine");
  const [newTodo,  setNewTodo]  = useState("");
  const [adding,   setAdding]   = useState(false);

  const isApprover = role === "ADMIN" || role === "APPROVER";

  const load = useCallback(async (s: "mine" | "all") => {
    try {
      const res = await fetch(`/api/dashboard?scope=${s}`);
      if (res.ok) setData(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    load(scope);
    const interval = setInterval(() => load(scope), 15_000);
    return () => clearInterval(interval);
  }, [scope, load]);

  async function addTodo() {
    const text = newTodo.trim();
    if (!text || adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/todos", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text }),
      });
      if (res.ok) {
        setNewTodo("");
        await load(scope);
      }
    } catch {}
    setAdding(false);
  }

  async function toggleTodo(todo: DashTodo) {
    // 樂觀更新
    setData((d) => d && {
      ...d,
      todos: d.todos.map((t) => t.id === todo.id ? { ...t, done: !t.done } : t),
    });
    try {
      await fetch(`/api/todos/${todo.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ done: !todo.done }),
      });
    } catch {}
    load(scope);
  }

  async function deleteTodo(id: string) {
    setData((d) => d && { ...d, todos: d.todos.filter((t) => t.id !== id) });
    try {
      await fetch(`/api/todos/${id}`, { method: "DELETE" });
    } catch {}
    load(scope);
  }

  const tasks       = data?.tasks ?? [];
  const todos       = data?.todos ?? [];
  const running     = tasks.filter((t) => t.status === "RUNNING");
  const pending     = tasks.filter((t) => t.status === "PENDING_APPROVAL");
  const done        = tasks.filter((t) => t.status === "DONE");
  const failed      = tasks.filter((t) => t.status === "FAILED");
  const openTodos   = todos.filter((t) => !t.done);

  const dateStr = new Date().toLocaleDateString("zh-HK", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });

  const vitalTiles = [
    { label: "本週任務",   value: data?.vitals.weekTasks ?? "—",        accent: "var(--primary)" },
    { label: "生成文件",   value: data?.vitals.weekDocs ?? "—",         accent: "var(--green)" },
    { label: "待批核",     value: data?.vitals.pendingApprovals ?? "—", accent: "var(--amber)" },
    { label: "代課安排",   value: data?.vitals.weekSubs ?? "—",         accent: "var(--seal)" },
  ];

  function TaskCard({ task }: { task: DashTask }) {
    return (
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderLeft: `3px solid ${STATUS_COLOR[task.status]}`,
        borderRadius: 4, padding: "8px 10px", marginBottom: 6,
        boxShadow: "1px 1px 0 var(--primary-light)",
      }}>
        <div style={{ fontSize: 12, color: "var(--ink)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {task.title}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, alignItems: "center" }}>
          <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--ink3)" }}>
            {AGENT_NAME[task.agentId] ?? task.agentId}
            {data?.scope === "all" && task.user?.name ? ` · ${task.user.name}` : ""}
          </span>
          <span style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--ink3)" }}>
            {new Date(task.createdAt).toLocaleDateString("zh-HK", { month: "numeric", day: "numeric" })}
          </span>
        </div>
        {task.status === "RUNNING" && (
          <div style={{ marginTop: 5, height: 3, background: "var(--bg2)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: "40%", background: "var(--amber)", borderRadius: 2, animation: "slide 1.2s ease-in-out infinite" }} />
          </div>
        )}
      </div>
    );
  }

  function Column({ title, color, count, children }: { title: string; color: string; count: number; children: React.ReactNode }) {
    return (
      <div style={{ flex: 1, minWidth: 200, background: "var(--bg2)", borderRadius: 6, border: "1px solid var(--border)", display: "flex", flexDirection: "column", maxHeight: 520 }}>
        <div style={{ padding: "10px 12px", borderBottom: `2px solid ${color}`, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", fontFamily: "var(--sans)" }}>{title}</span>
          <span style={{ marginLeft: "auto", fontSize: 10, fontFamily: "var(--mono)", color, fontWeight: 700 }}>{count}</span>
        </div>
        <div style={{ padding: 10, overflowY: "auto", flex: 1 }}>{children}</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)", fontFamily: "var(--sans)" }}>
      {/* 頂欄 */}
      <div style={{ background: "var(--card)", borderBottom: "1px solid var(--border)", padding: "14px 24px", display: "flex", alignItems: "center", gap: 16, position: "sticky", top: 0, zIndex: 50 }}>
        <Link href="/" style={{ color: "var(--primary)", textDecoration: "none", fontSize: 13 }}>← 返回工作台</Link>
        <Link href="/office" style={{ color: "var(--primary)", fontSize: 13 }}>Hermes 指揮台 ↗</Link>
        <span style={{ color: "var(--border)" }}>|</span>
        <h1 style={{ margin: 0, fontSize: 18, fontFamily: "var(--serif)", color: "var(--primary)", fontWeight: 700 }}>基智指揮中心</h1>
        <span style={{ marginLeft: "auto", fontSize: 10, fontFamily: "var(--mono)", color: "var(--ink3)" }}>
          KCSS · COMMAND CENTER
        </span>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px 60px" }}>

        {/* 今日概覽 */}
        <div style={{
          background: "var(--card)", border: "1px solid var(--border2)",
          borderLeft: "4px solid var(--primary)", borderRadius: 6,
          padding: "18px 22px", marginBottom: 20,
          boxShadow: "2px 2px 0 var(--primary-light)",
          display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
        }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 20, fontFamily: "var(--serif)", fontWeight: 700, color: "var(--ink)" }}>
              {greeting()}，{userName}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 4, fontFamily: "var(--mono)" }}>{dateStr}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { label: "待批核", n: isApprover ? (data?.vitals.pendingApprovals ?? 0) : pending.length, color: "var(--amber)" },
              { label: "處理中", n: running.length, color: "var(--primary)" },
              { label: "待辦",   n: openTodos.length, color: "var(--seal)" },
            ].map((c) => (
              <span key={c.label} style={{
                fontSize: 11, fontFamily: "var(--mono)", padding: "4px 12px",
                borderRadius: 20, border: `1px solid ${c.color}`,
                color: c.n > 0 ? "#fff" : c.color,
                background: c.n > 0 ? c.color : "transparent",
                fontWeight: 600,
              }}>
                {c.label} {c.n}
              </span>
            ))}
          </div>
        </div>

        {/* Vitals */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
          {vitalTiles.map((v) => (
            <div key={v.label} style={{
              background: "var(--card)", border: "1px solid var(--border)",
              borderLeft: `4px solid ${v.accent}`, borderRadius: 5,
              padding: "14px 16px", boxShadow: "2px 2px 0 var(--primary-light)",
            }}>
              <div style={{ fontSize: 26, fontFamily: "var(--mono)", fontWeight: 700, color: v.accent, lineHeight: 1 }}>
                {v.value}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink3)", marginTop: 6 }}>{v.label}<span style={{ fontSize: 9, fontFamily: "var(--mono)", marginLeft: 4 }}>7日</span></div>
            </div>
          ))}
        </div>

        {/* Command Deck */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, color: "var(--primary)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, paddingLeft: 6, borderLeft: "3px solid var(--primary)" }}>
            Command Deck · 快速指令
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {COMMAND_DECK.map((c) => (
              <Link
                key={c.label}
                href={`/?prompt=${encodeURIComponent(c.prompt)}`}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", background: "var(--card)",
                  border: "1px solid var(--border2)", borderRadius: 4,
                  fontSize: 12, color: "var(--ink)", textDecoration: "none",
                  boxShadow: "1px 1px 0 var(--primary-light)", fontFamily: "var(--sans)",
                }}
              >
                <span>{c.icon}</span> {c.label}
              </Link>
            ))}
          </div>
        </div>

        {/* 任務進度板 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, color: "var(--primary)", textTransform: "uppercase", letterSpacing: 1, paddingLeft: 6, borderLeft: "3px solid var(--primary)" }}>
            任務進度板
          </div>
          {isApprover && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              {(["mine", "all"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  style={{
                    padding: "3px 12px", borderRadius: 20, fontSize: 10, fontFamily: "var(--mono)",
                    cursor: "pointer",
                    background: scope === s ? "var(--primary)" : "var(--card)",
                    color:      scope === s ? "#fff" : "var(--ink3)",
                    border:     `1px solid ${scope === s ? "var(--primary)" : "var(--border)"}`,
                  }}
                >
                  {s === "mine" ? "只看我的" : "全校任務"}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "stretch", flexWrap: "wrap" }}>
          {/* 待辦：個人 todos + 待批核任務 */}
          <Column title="待辦" color="var(--seal)" count={openTodos.length + pending.length}>
            {/* 新增待辦 */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <input
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addTodo(); }}
                placeholder="加個人待辦…"
                style={{
                  flex: 1, minWidth: 0, border: "1px solid var(--border)", borderRadius: 3,
                  padding: "6px 8px", fontSize: 11, background: "var(--card)",
                  color: "var(--ink)", fontFamily: "var(--sans)", outline: "none",
                }}
              />
              <button
                onClick={addTodo}
                disabled={!newTodo.trim() || adding}
                style={{
                  padding: "6px 10px", background: "var(--seal)", color: "#fff",
                  border: "none", borderRadius: 3, fontSize: 11, fontWeight: 600,
                  cursor: "pointer", opacity: !newTodo.trim() ? 0.5 : 1, flexShrink: 0,
                }}
              >
                ＋
              </button>
            </div>
            {/* 個人 todos */}
            {todos.map((todo) => (
              <div key={todo.id} style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "var(--card)", border: "1px solid var(--border)",
                borderRadius: 4, padding: "7px 10px", marginBottom: 6,
                boxShadow: "1px 1px 0 var(--primary-light)",
                opacity: todo.done ? 0.55 : 1,
              }}>
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => toggleTodo(todo)}
                  style={{ cursor: "pointer", accentColor: "var(--green)", flexShrink: 0 }}
                />
                <span style={{
                  fontSize: 12, color: "var(--ink)", flex: 1, lineHeight: 1.4,
                  textDecoration: todo.done ? "line-through" : "none", wordBreak: "break-word",
                }}>
                  {todo.text}
                </span>
                <button
                  onClick={() => deleteTodo(todo.id)}
                  title="刪除"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink3)", fontSize: 13, padding: 0, flexShrink: 0 }}
                >
                  ×
                </button>
              </div>
            ))}
            {/* 待批核任務 */}
            {pending.length > 0 && (
              <div style={{ fontSize: 9, fontFamily: "var(--mono)", color: "var(--ink3)", margin: "8px 0 6px", textTransform: "uppercase", letterSpacing: 1 }}>
                {STATUS_LABEL.PENDING_APPROVAL}文件
              </div>
            )}
            {pending.map((t) => <TaskCard key={t.id} task={t} />)}
            {openTodos.length === 0 && pending.length === 0 && todos.length === 0 && (
              <p style={{ fontSize: 11, color: "var(--ink3)", textAlign: "center", padding: "16px 0" }}>暫無待辦</p>
            )}
          </Column>

          {/* 處理中 */}
          <Column title="處理中" color="var(--amber)" count={running.length}>
            {running.map((t) => <TaskCard key={t.id} task={t} />)}
            {running.length === 0 && (
              <p style={{ fontSize: 11, color: "var(--ink3)", textAlign: "center", padding: "16px 0" }}>暫無處理中任務</p>
            )}
          </Column>

          {/* 完成 */}
          <Column title="完成" color="var(--green)" count={done.length}>
            {done.map((t) => <TaskCard key={t.id} task={t} />)}
            {done.length === 0 && (
              <p style={{ fontSize: 11, color: "var(--ink3)", textAlign: "center", padding: "16px 0" }}>暫無完成任務</p>
            )}
          </Column>

          {/* 失敗 */}
          {failed.length > 0 && (
            <Column title="失敗" color="var(--seal)" count={failed.length}>
              {failed.map((t) => <TaskCard key={t.id} task={t} />)}
            </Column>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slide {
          0%   { margin-left: -40%; }
          100% { margin-left: 100%; }
        }
      `}</style>
    </div>
  );
}
