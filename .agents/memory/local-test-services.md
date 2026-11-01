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

Recheck recent source edits after a workspace restart, too.

**Why:** After one restart, an earlier successful multi-file patch was absent
while later frontend changes remained, leaving the feature only partly wired.

**How to apply:** Verify the intended changes with targeted searches before
continuing. Reapply only missing changes, rather than assuming all edits either
survived or disappeared.

Installed skill instructions do not guarantee that every documented testing
service is available in this workspace.

**Why:** The testing-specific subagent configuration was rejected as an unknown
kind by the runtime despite an installed testing skill. No browser test ran
through that attempted call.

**How to apply:** Treat a rejected configuration as no test coverage. Recheck
capabilities if needed, or use the available local Chromium with the existing
WebSocket dependency for direct browser checks. Keep its temporary profile
separate from user browser state.

CDP condition checks must return simple values and wait for the new document
after navigation or reload.

**Why:** Returning a React DOM node by value caused an “Object reference chain
is too long” serialization error. Checking an existing DOM marker immediately
after reload could also inspect the old document rather than the new one.

**How to apply:** Return booleans or specific text/attributes, await a page-load
signal before checking the new page, and bound browser-tab cleanup requests so
failed interaction tests cannot hang indefinitely while closing.

Bring a CDP tab to the foreground before native keyboard tests; Enter activation
may require its carriage-return text as well as key/code data.

**Why:** Programmatic focus alone did not activate a native button during a
headless keyboard test, despite the control working when clicked.
Rapid Space/Arrow sortable sequences also failed until platform key codes and
explicit sensor-state waits were included; actual native keyboard dragging works.

**How to apply:** Verify actual focus and native activation rather than
substituting a synthetic click and claiming keyboard coverage. For sortable
Space/Arrow tests, provide virtual key codes and wait for active/live-announcement
updates before dropping; a couple of animation frames is not always sufficient.
For React Query
refetch tests, use a deterministic route remount or explicit retry; synthetic
focus/visibility events did not trigger refetch reliably in this environment.

Removing a workflow can leave a separately spawned server descendant holding
its port even after removal reports success.

**Why:** Replacing a preview workflow failed with EADDRINUSE because the old
wrapper's server child survived removal.

**How to apply:** Prefer starting the verified preview server in the wrapper's
own process. If a replacement fails on a busy port, identify and stop only the
removed workflow's verified descendants before restarting; do not kill unrelated
services or create a second server on another port.

Uncaught browser errors can terminate the managed development preview, not just
the browser test tab.

**Why:** The runtime-error relay stopped the shared preview when a disposable
test supplied an incomplete saved planner state and navigated back to the planner.

**How to apply:** Use the complete real saved-state shape in cross-route browser
fixtures, even when the screen under test only reads assignments. Restore the
managed preview after a relayed runtime error; do not mistake it for a port issue.
