import { PrismaClient } from "@prisma/client";
import { auditedCompletion } from "../src/lib/task-audit/llm";
import { planSchema } from "../src/lib/office/plan";
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
      const worked = await runNext(db, { plan: async (goal, team, signal, policy, parentId) => {
        if (!policy) throw new Error("POLICY_DENIED");
        const text = await auditedCompletion(db, "ollama", [{role:"user", content:JSON.stringify({goal,team})}], {policy,signal,parentId,system:'Return only JSON: {"summary":string,"acceptance":[string],"steps":[{"id":string,"title":string,"agent":"clerk","executor":"manual","dependsOn":[],"instructions":string}]}. Create a manual, reviewable plan. Do not retrieve data or execute tools.'});
        return planSchema.parse(JSON.parse(text));
      }, readOnly: inspectWithCodex }, stop.signal);
      if (!worked) await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error("Worker stopped: configuration or database unavailable; inspect readiness."); process.exitCode = 1; });
