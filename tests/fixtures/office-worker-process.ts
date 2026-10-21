import { PrismaClient } from "@prisma/client";
import { runNext } from "../../src/lib/office/worker";

// Synthetic subprocess for process-crash qualification. Never contacts a model.
async function main() {
  const supplied = process.env.AGENTOS_TEST_DATABASE_URL;
  if (!supplied || !process.send) throw new Error("Qualification subprocess configuration required");
  const url = new URL(supplied);
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.pathname !== "/agentos_qualification" ||
      !/^qualification_[a-f0-9]{32}$/.test(url.searchParams.get("schema") ?? "")) {
    throw new Error("Qualification subprocess requires an isolated local test schema");
  }
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const blocked = async (phase: string): Promise<never> => {
    process.send?.({ phase });
    // Keep the real worker lease/heartbeat active until the parent kills us.
    return new Promise<never>(() => {});
  };
  try {
    const [{ pid }] = await db.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    process.send({ backendPid: pid });
    await runNext(db, {
      plan: () => blocked("planning"),
      readOnly: () => blocked("executing"),
    });
  } finally { await db.$disconnect(); }
}

void main().catch(() => {
  process.send?.({ error: "QUALIFICATION_WORKER_FAILED" });
  process.exitCode = 1;
});
