"use client";

import { useEffect, useState } from "react";
import AccountProvisioning from "./account-provisioning";

interface User {
  id:          string;
  email:       string;
  name:        string;
  role:        string;
  department:  string | null;
  isActive:    boolean;
  lastLoginAt: string | null;
  createdAt:   string;
}

const ROLES = ["ADMIN", "APPROVER", "DEPT_HEAD", "TEACHER", "OFFICE"] as const;

const ROLE_COLOR: Record<string, string> = {
  ADMIN:     "var(--seal)",
  APPROVER:  "var(--primary)",
  DEPT_HEAD: "var(--amber)",
  TEACHER:   "var(--green)",
  OFFICE:    "var(--ink3)",
};

export default function AdminUsersClient() {
  const [users, setUsers]     = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState<string | null>(null);

  useEffect(() => { fetchUsers(); }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function update(id: string, data: Partial<User>) {
    setSaving(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...updated } : u)));
      }
    } finally {
      setSaving(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--sans)" }}>
      {/* 頁首 */}
      <div
        style={{
          background:   "var(--card)",
          borderBottom: "1px solid var(--border)",
          padding:      "14px 24px",
          display:      "flex",
          alignItems:   "center",
          gap:          12,
        }}
      >
        <a href="/" style={{ textDecoration: "none" }}>
          <div
            style={{
              width: 32, height: 32, background: "var(--seal)", color: "#fff",
              fontFamily: "var(--serif)", fontSize: 16, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "2px 2px 0 var(--primary-light)",
            }}
          >
            智
          </div>
        </a>
        <div>
          <div style={{ fontFamily: "var(--serif)", fontWeight: 700, fontSize: 16, color: "var(--ink)" }}>
            用戶管理
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--ink3)", textTransform: "uppercase" }}>
            ADMIN · USER MANAGEMENT
          </div>
        </div>
      </div>

      <div style={{ padding: "24px", maxWidth: 1100, margin: "0 auto" }}>
        <AccountProvisioning users={users} onChange={fetchUsers} />
        {loading ? (
          <p style={{ color: "var(--ink3)", textAlign: "center", padding: 40 }}>載入中…</p>
        ) : (
          <div
            style={{
              background:   "var(--card)",
              border:       "1px solid var(--border)",
              borderRadius: 5,
              boxShadow:    "2px 2px 0 var(--primary-light)",
              overflow:     "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--primary-light)", borderBottom: "1px solid var(--border)" }}>
                  {["姓名", "Email", "角色", "科組", "最後登入", "狀態"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding:    "10px 14px",
                        textAlign:  "left",
                        fontSize:   11,
                        fontFamily: "var(--mono)",
                        fontWeight: 600,
                        color:      "var(--primary-dark)",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user, i) => (
                  <tr
                    key={user.id}
                    style={{
                      borderBottom:  "1px solid var(--border)",
                      background:    i % 2 === 0 ? "var(--card)" : "var(--bg)",
                      opacity:       user.isActive ? 1 : 0.5,
                    }}
                  >
                    <td style={{ padding: "10px 14px", fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>
                      {user.name}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--ink2)", fontFamily: "var(--mono)" }}>
                      {user.email}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <select
                        value={user.role}
                        disabled={saving === user.id}
                        onChange={(e) => update(user.id, { role: e.target.value as typeof ROLES[number] })}
                        style={{
                          fontSize:    11,
                          fontFamily:  "var(--mono)",
                          color:       ROLE_COLOR[user.role] ?? "var(--ink2)",
                          fontWeight:  600,
                          background:  "var(--primary-light)",
                          border:      "1px solid var(--border)",
                          borderRadius: 3,
                          padding:     "3px 6px",
                          cursor:      "pointer",
                        }}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <input
                        type="text"
                        defaultValue={user.department ?? ""}
                        onBlur={(e) => {
                          if (e.target.value !== (user.department ?? "")) {
                            update(user.id, { department: e.target.value || undefined });
                          }
                        }}
                        placeholder="未設定"
                        style={{
                          fontSize:    12,
                          fontFamily:  "var(--sans)",
                          color:       "var(--ink2)",
                          background:  "transparent",
                          border:      "1px solid transparent",
                          borderRadius: 3,
                          padding:     "3px 6px",
                          width:       80,
                        }}
                        onFocus={(e) => (e.target.style.border = "1px solid var(--border2)")}
                      />
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 11, color: "var(--ink3)", fontFamily: "var(--mono)" }}>
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleDateString("zh-HK")
                        : "從未"}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <button
                        onClick={() => update(user.id, { isActive: !user.isActive })}
                        disabled={saving === user.id}
                        style={{
                          fontSize:    11,
                          fontFamily:  "var(--mono)",
                          padding:     "3px 10px",
                          borderRadius: 20,
                          border:      "1px solid",
                          cursor:      "pointer",
                          background:  user.isActive ? "rgba(26,122,98,0.1)" : "rgba(184,64,48,0.1)",
                          color:       user.isActive ? "var(--green)" : "var(--seal)",
                          borderColor: user.isActive ? "var(--green)" : "var(--seal)",
                        }}
                      >
                        {user.isActive ? "啟用" : "停用"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
