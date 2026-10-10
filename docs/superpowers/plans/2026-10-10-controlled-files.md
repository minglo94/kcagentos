# Controlled file adapter stage

User authorized starting the next stage on 2026-10-10. This stage qualifies synthetic files only. The approved school-data design remains the source of requirements; no live student-data setting is introduced.

1. Add private, actor-scoped named input and output roots to the server policy. Reject malformed or overlapping roots, invalid grants, and scope changes before an approved job can run.
2. Implement a bounded input reader and private atomic staged output bundles with relative paths only, no symlink traversal, per-attempt actor isolation, hashes and manifest metadata. Keep the actual file invocation behind the existing task audit. Publishing a finished job output requires a later approved, crash-reconciled workflow.
3. Write synthetic tests first for authorized reads/writes, wrong actor, traversal, symlinks, overlap, missing file, size limit and configuration changes. Verify Node suite, PostgreSQL suite, typecheck, lint and build as appropriate; update coverage/handover and push the reviewed commit to draft PR #14.

The adapter is not a live NAS mount qualification. Teacher Portal named queries wait for the authoritative view and teacher-scope contract. The existing chat tool path has no plan approval and cannot activate school file writes. At most one 1 MiB staged bundle is created per audited write attempt; per-job aggregate limits and promotion are later workflow gates.
