import { PrismaClient } from "@prisma/client";
import { planWithHermes } from "../src/lib/office/hermes";
import { inspectWithCodex } from "../src/lib/office/readonly";
import { recoverExpired, runNext } from "../src/lib/office/worker";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const db = new PrismaClient();
  const stop = new AbortController();
  process.on("SIGINT", () => stop.abort());
  process.on("SIGTERM", () => stop.abort());
  console.log("AgentOS Worker started; only manual and read-only executors enabled.");
  try {
    while (!stop.signal.aborted) {
      await recoverExpired(db);
      const worked = await runNext(db, { plan: planWithHermes, readOnly: inspectWithCodex }, stop.signal);
      if (!worked) await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error("Worker stopped: configuration or database unavailable; inspect readiness."); process.exitCode = 1; });
