import { createHash } from "node:crypto";
import { z } from "zod";

export const AGENTS = ["hermes", "archie", "reviewer", "bob", "tesla", "clerk", "andy", "donna", "iris", "wendy", "quinn", "flora", "carla", "ada", "ethan"] as const;
export const planSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  acceptance: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
  steps: z.array(z.object({
    id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/),
    title: z.string().trim().min(1).max(200),
    agent: z.enum(AGENTS),
    // First release deliberately has no write/shell/deploy executor.
    executor: z.enum(["manual", "codex.readonly"]),
    dependsOn: z.array(z.string()).max(30),
    instructions: z.string().trim().min(1).max(4000),
  }).strict()).min(1).max(30),
}).strict().superRefine((plan, ctx) => {
  const seen = new Set<string>();
  plan.steps.forEach((step, index) => {
    if (seen.has(step.id) || step.dependsOn.some((id) => !seen.has(id))) {
      ctx.addIssue({ code: "custom", path: ["steps", index], message: "Steps must have unique IDs and depend only on earlier steps" });
    }
    seen.add(step.id);
  });
});
export type OfficePlan = z.infer<typeof planSchema>;
export const createJobSchema = z.object({ goal: z.string().trim().min(3).max(4000), team: z.enum(["school", "development"]) }).strict();
export function hashPlan(plan: OfficePlan): string {
  return createHash("sha256").update(JSON.stringify(planSchema.parse(plan))).digest("hex");
}

export class OfficeError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
