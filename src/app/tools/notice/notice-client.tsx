"use client";

import Link from "next/link";
import { useState } from "react";

interface Session {
  date: string;
  startTime: string;
  endTime: string;
  arrivalTime: string;
  location: string;
}

interface Student {
  classCode: string;
  studentId: string;
  name: string;
}

const BODY_TEMPLATES = [
  "本校將舉辦上述活動，為豐富同學學習經驗，現徵得家長同意，邀請貴子弟參加。",
  "本校將組隊參加上述比賽，為豐富同學學習經驗，現徵得家長同意，邀請貴子弟參加。",
  "本校將安排同學參加上述交流活動，現徵得家長同意，邀請貴子弟一同前往。",
  "本校將舉辦上述工作坊，為提升同學技能，現徵得家長同意，邀請貴子弟參加。",
];

const WEEKDAYS = ["", "一", "二", "三", "四", "五", "六", "日"];

function formatDate(d: string) {
  if (!d) return "";
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;
  const day = dt.getDate();
  const wd = WEEKDAYS[dt.getDay() === 0 ? 7 : dt.getDay()];
  return `${y}年${m}月${day}日（星期${wd}）`;
}

export default function NoticeClient() {
  const today = new Date().toISOString().split("T")[0];

  const [activityName, setActivityName] = useState("");
  const [noticeNo,     setNoticeNo]     = useState("");
  const [issueDate,    setIssueDate]    = useState(today);
  const [teacher,      setTeacher]      = useState("");
  const [phone,        setPhone]        = useState("2342-2954");
  const [tutorType,    setTutorType]    = useState<"school" | "external">("school");
  const [tutorOrg,     setTutorOrg]     = useState("");
  const [bodyText,     setBodyText]     = useState(BODY_TEMPLATES[0]);
  const [sessions,     setSessions]     = useState<Session[]>([
    { date: today, startTime: "09:00", endTime: "17:00", arrivalTime: "08:45", location: "" },
  ]);
  const [students, setStudents]         = useState<Student[]>([{ classCode: "", studentId: "", name: "" }]);
  const [fad8Cat,  setFad8Cat]          = useState("1");
  const [dept,     setDept]             = useState("");
  const [loading,  setLoading]          = useState(false);

  function addSession() {
    setSessions((s) => [...s, { date: today, startTime: "09:00", endTime: "17:00", arrivalTime: "08:45", location: "" }]);
  }
  function removeSession(i: number) {
    setSessions((s) => s.filter((_, idx) => idx !== i));
  }
  function updateSession(i: number, field: keyof Session, val: string) {
    setSessions((s) => s.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  }

  function addStudent() {
    setStudents((s) => [...s, { classCode: "", studentId: "", name: "" }]);
  }
  function removeStudent(i: number) {
    setStudents((s) => s.filter((_, idx) => idx !== i));
  }
  function updateStudent(i: number, field: keyof Student, val: string) {
    setStudents((s) => s.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTableElement>) {
    const text = e.clipboardData.getData("text");
    const rows = text.trim().split("\n").map((r) => r.split("\t"));
    if (!rows.length) return;
    e.preventDefault();
    const newStudents = rows.map((r) => ({
      classCode: r[0]?.trim() ?? "",
      studentId: r[1]?.trim() ?? "",
      name:      r[2]?.trim() ?? "",
    }));
    setStudents(newStudents);
  }

  async function handleGenerate() {
    if (!activityName || !teacher || sessions.some((s) => !s.location)) {
      alert("請填寫活動名稱、負責老師及所有活動地點。");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/tools/notice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityName, noticeNo, issueDate, teacher, phone, tutorType, tutorOrg, bodyText, sessions, students, fad8Cat, dept }),
      });
      if (!res.ok) throw new Error("生成失敗");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${activityName}_文件.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("生成失敗，請再試。");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    border: "1px solid var(--border2)", borderRadius: 4, padding: "7px 10px",
    fontSize: 13, fontFamily: "var(--sans)", color: "var(--ink)",
    background: "var(--bg)", width: "100%", outline: "none",
    boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontFamily: "var(--mono)", color: "var(--primary-dark)",
    textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 4, display: "block",
  };
  const sectionStyle: React.CSSProperties = {
    background: "var(--card)", border: "1px solid var(--border)",
    borderRadius: 5, padding: "20px 22px", marginBottom: 16,
    boxShadow: "2px 2px 0 var(--primary-light)",
  };
  const sectionTitle: React.CSSProperties = {
    fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600,
    color: "var(--primary)", textTransform: "uppercase" as const,
    letterSpacing: 1, marginBottom: 14,
    paddingLeft: 8, borderLeft: "3px solid var(--primary)",
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--sans)" }}>
      {/* 頁首 */}
      <div style={{ background: "var(--card)", borderBottom: "1px solid var(--border)", padding: "12px 24px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 50, boxShadow: "0 2px 0 var(--primary-light)" }}>
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, background: "var(--seal)", color: "#fff", fontFamily: "var(--serif)", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "2px 2px 0 var(--primary-light)" }}>智</div>
          <span style={{ fontFamily: "var(--serif)", fontSize: 14, color: "var(--ink2)" }}>基智 Agent OS</span>
        </Link>
        <span style={{ color: "var(--ink3)" }}>›</span>
        <span style={{ fontFamily: "var(--serif)", fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>活動通告生成</span>
        <div style={{ marginLeft: "auto", fontSize: 9, fontFamily: "var(--mono)", color: "var(--seal)", border: "1px solid var(--seal)", padding: "2px 7px", borderRadius: 2 }}>基智 · KCSS</div>
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 20px 100px" }}>

        {/* ① 基本資料 */}
        <div style={sectionStyle}>
          <div style={sectionTitle}>① 基本資料</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>活動名稱 *</label>
              <input style={inputStyle} value={activityName} onChange={(e) => setActivityName(e.target.value)} placeholder="例：2025-26 英語話劇比賽" required />
            </div>
            <div>
              <label style={labelStyle}>通告編號</label>
              <input style={inputStyle} value={noticeNo} onChange={(e) => setNoticeNo(e.target.value)} placeholder="例：072/2025" />
            </div>
            <div>
              <label style={labelStyle}>發出日期 *</label>
              <input style={{ ...inputStyle }} type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>負責老師 *</label>
              <input style={inputStyle} value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="老師姓名" required />
            </div>
            <div>
              <label style={labelStyle}>聯絡電話</label>
              <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>導師類別</label>
              <div style={{ display: "flex", gap: 16, paddingTop: 8 }}>
                {(["school", "external"] as const).map((t) => (
                  <label key={t} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ink2)", cursor: "pointer" }}>
                    <input type="radio" value={t} checked={tutorType === t} onChange={() => setTutorType(t)} />
                    {t === "school" ? "本校老師" : "校外導師/機構"}
                  </label>
                ))}
              </div>
            </div>
            {tutorType === "external" && (
              <div style={{ gridColumn: "span 2" }}>
                <label style={labelStyle}>機構/導師名稱</label>
                <input style={inputStyle} value={tutorOrg} onChange={(e) => setTutorOrg(e.target.value)} placeholder="機構或導師全名" />
              </div>
            )}
          </div>
        </div>

        {/* ② 活動節次 */}
        <div style={sectionStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={sectionTitle}>② 活動節次</div>
            <button onClick={addSession} style={{ fontSize: 12, padding: "4px 12px", background: "var(--primary-light)", border: "1px solid var(--border2)", borderRadius: 3, cursor: "pointer", color: "var(--primary-dark)", fontFamily: "var(--sans)" }}>＋ 加節次</button>
          </div>
          {sessions.map((s, i) => (
            <div key={i} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 4, padding: "14px", marginBottom: 10, position: "relative" }}>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--ink3)", marginBottom: 10 }}>節次 {i + 1} {s.date && `· ${formatDate(s.date)}`}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <div><label style={labelStyle}>日期</label><input style={inputStyle} type="date" value={s.date} onChange={(e) => updateSession(i, "date", e.target.value)} /></div>
                <div><label style={labelStyle}>開始時間</label><input style={inputStyle} type="time" value={s.startTime} onChange={(e) => updateSession(i, "startTime", e.target.value)} /></div>
                <div><label style={labelStyle}>結束時間</label><input style={inputStyle} type="time" value={s.endTime} onChange={(e) => updateSession(i, "endTime", e.target.value)} /></div>
                <div><label style={labelStyle}>到達時間</label><input style={inputStyle} type="time" value={s.arrivalTime} onChange={(e) => updateSession(i, "arrivalTime", e.target.value)} /></div>
                <div style={{ gridColumn: "span 2" }}><label style={labelStyle}>地點 *</label><input style={inputStyle} value={s.location} onChange={(e) => updateSession(i, "location", e.target.value)} placeholder="活動地點" /></div>
              </div>
              {sessions.length > 1 && (
                <button onClick={() => removeSession(i)} style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", color: "var(--seal)", fontSize: 16, cursor: "pointer" }}>×</button>
              )}
            </div>
          ))}
        </div>

        {/* ③ 通告正文 */}
        <div style={sectionStyle}>
          <div style={sectionTitle}>③ 通告正文</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {BODY_TEMPLATES.map((t, i) => (
              <button key={i} onClick={() => setBodyText(t)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, border: "1px solid", cursor: "pointer", fontFamily: "var(--sans)", background: bodyText === t ? "var(--primary)" : "var(--card)", color: bodyText === t ? "#fff" : "var(--primary-dark)", borderColor: bodyText === t ? "var(--primary)" : "var(--border2)" }}>
                {["課程報名", "比賽活動", "交流參訪", "工作坊"][i]}
              </button>
            ))}
          </div>
          <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
        </div>

        {/* ④ 學生名單 */}
        <div style={sectionStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={sectionTitle}>④ 學生名單（{students.length} 人）</div>
            <button onClick={addStudent} style={{ fontSize: 12, padding: "4px 12px", background: "var(--primary-light)", border: "1px solid var(--border2)", borderRadius: 3, cursor: "pointer", color: "var(--primary-dark)", fontFamily: "var(--sans)" }}>＋ 加學生</button>
          </div>
          <p style={{ fontSize: 11, color: "var(--ink3)", marginBottom: 10 }}>可直接從 Excel 複製貼上（格式：班別、學號、姓名）</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }} onPaste={handlePaste}>
              <thead>
                <tr style={{ background: "var(--primary-light)" }}>
                  {["班別", "學號", "姓名", ""].map((h) => (
                    <th key={h} style={{ padding: "6px 10px", fontSize: 11, fontFamily: "var(--mono)", color: "var(--primary-dark)", textAlign: "left", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    {(["classCode", "studentId", "name"] as const).map((f) => (
                      <td key={f} style={{ padding: "4px 6px" }}>
                        <input style={{ ...inputStyle, padding: "5px 8px" }} value={s[f]} onChange={(e) => updateStudent(i, f, e.target.value)} placeholder={f === "classCode" ? "如 3A" : f === "studentId" ? "學號" : "姓名"} />
                      </td>
                    ))}
                    <td style={{ padding: "4px 6px" }}>
                      {students.length > 1 && <button onClick={() => removeStudent(i)} style={{ background: "none", border: "none", color: "var(--seal)", fontSize: 16, cursor: "pointer" }}>×</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ⑤ FAD8 設定 */}
        <div style={sectionStyle}>
          <div style={sectionTitle}>⑤ FAD8 學生學習紀錄</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>類別</label>
              <select style={inputStyle} value={fad8Cat} onChange={(e) => setFad8Cat(e.target.value)}>
                <option value="1">1 — 獎項/比賽</option>
                <option value="2">2 — 藝術/表演</option>
                <option value="3">3 — 領袖/服務</option>
                <option value="4">4 — 體育</option>
                <option value="5">5 — 制服團體</option>
                <option value="6">6 — 工作體驗</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>科組/部門</label>
              <input style={inputStyle} value={dept} onChange={(e) => setDept(e.target.value)} placeholder="例：英文科、體育科" list="dept-list" />
              <datalist id="dept-list">
                {["中文科","英文科","數學科","通識科","物理科","化學科","生物科","體育科","視藝科","音樂科","ICT 科","歷史科","地理科","經濟科","德育及公民教育","課外活動組"].map((d) => <option key={d} value={d} />)}
              </datalist>
            </div>
          </div>
        </div>
      </div>

      {/* 底部生成按鈕 */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "var(--card)", borderTop: "1px solid var(--border)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 -2px 0 var(--primary-light)" }}>
        <div style={{ fontSize: 12, color: "var(--ink3)" }}>
          生成：通告.docx · 出席紀錄.xlsx · FAD8.xlsx{tutorType === "external" ? " · 導師簽到.docx" : ""}
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{ padding: "10px 28px", background: loading ? "var(--ink3)" : "var(--primary)", color: "#fff", border: "none", borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: loading ? "wait" : "pointer", fontFamily: "var(--sans)", boxShadow: "2px 2px 0 var(--primary-light)" }}
        >
          {loading ? "生成中…" : "⬇ 生成 ZIP"}
        </button>
      </div>
    </div>
  );
}
