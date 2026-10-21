# Hermes learning and task harness — clarification 13 October 2026

User asked whether the supervisor behaves like Hermes Agent, learns from experience and retains progress. This is the next-stage target; it does not replace the Portal-only teacher workflow currently being implemented.

## Verified current behavior

The planning adapter launches the installed Hermes Agent runtime through `scripts/hermes_planner.py` in a dedicated credential-free profile. It is constrained to proposing a structured plan: tools, Skills, persistent memory/session recall, hooks and fallback providers are disabled. Local inference is not configured or verified. Current class-summary work uses a declared fixed workflow, not a model-generated plan.

AgentOS persists parent jobs, plan versions, Portal decision references, events, leases and child-operation references. Portal retains teacher requests, confirmations, school scope, source/artifact evidence and delivery records. These records preserve task progress across sessions; they are separate from a model remembering a conversation. The current persistent Worker still requires qualified local/Spark hosting.

## Target improvement loop

1. Use actual Hermes Agent as the planning/supervisor runtime with an explicitly configured local model. A model choice and an agent runtime are distinct: Hermes Agent does not require every role to use a model named Hermes.
2. After a verified workflow, assemble a redacted lesson from allowed evidence: task type, versions, checks, failure category, correction and outcome. Student records, case content, credentials and private prompts stay in Portal and do not enter a shared learning store.
3. Hermes may propose a memory or reusable Skill with provenance, scope, version and an evaluation case. A proposal is not active runtime policy. Authorized reviewers approve changes; school-facing review occurs in Portal and technical runtime review is an operator function.
4. Test the proposal against prior examples and explicit failure/permission cases. Activate the approved version only after those checks; retain rollback and deletion. Do not use successful-looking model text as completion evidence.
5. At planning time retrieve only approved knowledge for the current actor/workflow. Supply it as untrusted context. The execution harness still enforces exact versions, required Portal confirmations, capability scope, idempotency, leases and evidence.
6. Resume tasks from durable job/decision/operation state, not from conversational recall. Resolve unknown side effects before retrying. A learned Skill never substitutes for a new task's required approval or grants new tools/permissions.

This is procedural learning through reviewed memory/Skills; no weight training or automatic model improvement is claimed. The existing no-tools profile rejects memory/Skills intentionally, so adding this loop requires a separately designed, tested knowledge interface rather than silently enabling a personal Hermes profile.

## Qualification gates

- Configure and verify genuine local inference with no hidden cloud fallback.
- Review data retention, deletion, scope and evidence provenance for the learning store.
- Reject poisoned notes, cross-teacher retrieval and instruction/permission escalation.
- Show measurable workflow improvement on held-out cases while permission/approval tests remain green.
- Verify restart/resume and continuous Worker operation separately from conversational memory.

Reference checked on 13 October 2026: [Hermes Agent Skills documentation](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) describes procedural memory through reusable Skills. Those full-runtime capabilities are not enabled by the current restricted adapter.
