---
name: Phase approval gates
description: User-imposed scope and data-safety boundaries for the Tablewise MVP rollout.
---

Implement one approved MVP phase at a time, report its results, then stop for
separate approval. Approval to implement a phase is not permission to deploy,
modify production data, or invite external test customers.

**Why:** The user explicitly approved only the recipe catalog phase and required
separate later-phase, deployment, and customer-testing gates.

**How to apply:** Before any seed or database-writing test, establish and report
isolation using non-secret provisioning/configuration evidence, not database
names, NODE_ENV, or the existence of a connection string. If uncertain, stop and
ask. The user authorized a dedicated isolated test database after existing
connection isolation could not be established; do not treat that as permission
to write to the existing application database.

Post-merge setup must not automatically run Drizzle schema pushes. Review schema
changes separately because pushes may require confirmation for destructive changes.

**Why:** Automatic merge setup runs without an interactive reviewer, and an
unattended schema push could alter or remove existing data.

**How to apply:** Keep post-merge setup to deterministic install/build steps;
perform database schema changes only through a separately reviewed operation.

Minimum server restrictions on mutations and paid AI, input bounds/rate limits,
safe logging, non-crashing sanitized errors, and protected analytics access must
be implemented and tested before any public pilot. Hiding controls is not a
server safeguard.

**Why:** Existing globally shared recipe access and paid endpoints were identified
as pilot blockers, but unrelated hardening is outside the catalog phase.

**How to apply:** Carry these requirements into later-phase approval discussions;
do not call the catalog work a pilot-ready or complete MVP.
