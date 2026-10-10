import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { PrismaClient } from "@prisma/client";
import { bootstrapLocalAdmin } from "../src/lib/school-auth/store";
async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY || process.argv.length !== 2) throw new Error("INTERACTIVE_SETUP_REQUIRED");
  let hidden = false;
  const output = new Writable({ write(chunk, _, done) { if (!hidden) process.stdout.write(chunk); done(); } });
  const prompt = createInterface({ input: process.stdin, output, terminal: true });
  const db = new PrismaClient();
  try {
    const username = await prompt.question("AgentOS username: "), name = await prompt.question("Display name: "), email = await prompt.question("Contact email: ");
    process.stdout.write("Password (12–128 characters; hidden): "); hidden = true;
    const password = await prompt.question(""); hidden = false; process.stdout.write("\nConfirm password (hidden): "); hidden = true;
    const confirmation = await prompt.question(""); hidden = false; process.stdout.write("\n");
    if (password !== confirmation) throw new Error("PASSWORD_MISMATCH");
    await bootstrapLocalAdmin(db, { username, name, email, password });
    console.log("Local administrator created. Enable AGENTOS_LOCAL_AUTH_ENABLED=true and sign in.");
  } finally { prompt.close(); await db.$disconnect(); }
}
void main().catch(() => { console.error("Local administrator setup refused or failed. Use an interactive terminal, valid input and a database without an existing administrator."); process.exitCode = 1; });
