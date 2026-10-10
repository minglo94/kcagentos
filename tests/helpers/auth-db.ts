import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaClient } from "@prisma/client";
export const migrations = ["20261009000000_baseline", "20261009000100_office", "20261009000200_school_auth", "20261009000300_auth_review", "20261010000000_task_audit"];
export async function authDb() {
  const pg = await PGlite.create();
  for (const migration of migrations) await pg.exec(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"));
  const server = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: 0 });
  await server.start();
  const url = `postgresql://postgres:postgres@${server.getServerConn()}/postgres?connection_limit=1&pgbouncer=true&statement_cache_size=0`;
  const db = new PrismaClient({ datasources: { db: { url } } });
  return { db, url, close: async () => { await db.$disconnect(); await server.stop(); await pg.close(); } };
}
