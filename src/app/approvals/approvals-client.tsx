import Link from "next/link";

export default function ApprovalsClient() {
  return <main style={{ padding: 24 }}>
    <h1>校務批准請在 Portal 處理</h1>
    <p>計劃、內容、收件人及發送的確認由 Portal 保存。管理指揮台不能代老師批准。</p>
    <Link href="/office">返回管理指揮台</Link>
  </main>;
}
