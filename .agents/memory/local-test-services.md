---
name: Local test service lifetime
description: Managed PostgreSQL service lifetime and browser-test capability limitations.
---

Keep long-lived isolated test services attached to a managed background shell
or workflow, rather than relying on ordinary daemonization in a one-off command.

**Why:** A detached PostgreSQL server reported successful startup and accepted
the isolation check, but was reclaimed after that shell invocation ended; the
next command received connection refused despite intact cluster files.

**How to apply:** Verify server/socket isolation again after starting the managed
process. If a test database becomes unavailable, repair that isolated service;
never substitute the configured application database.

Workspace restarts can remove the entire temporary cluster, not just stop its
process.

**Why:** A restart removed both the managed PostgreSQL process and its `/tmp`
data/socket directories despite the earlier successful verification.

**How to apply:** Recheck filesystem and server isolation. Recreate only an
authorized isolated test target, verify/report it before restoring reviewed
fixtures, and never use the configured database as a substitute.

Installed skill instructions do not guarantee that every documented testing
service is available in this workspace.

**Why:** The testing-specific subagent configuration was rejected as an unknown
kind by the runtime despite an installed testing skill. No browser test ran
through that attempted call.

**How to apply:** Treat a rejected configuration as no test coverage. Recheck
capabilities if needed, or use the available local Chromium with the existing
WebSocket dependency for direct browser checks. Keep its temporary profile
separate from user browser state.
