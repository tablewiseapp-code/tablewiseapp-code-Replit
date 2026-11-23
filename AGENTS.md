# Instructions for every agent working in this repository

Before you plan, write or review anything, read these two files in full:

1. [docs/PRODUCT.md](docs/PRODUCT.md) — what TableWise is, who it is for, its vocabulary, principles, scope and known gaps.
2. [ARCHITECTURE.md](ARCHITECTURE.md) — the stack, layout, data model, access model, environment flags and the rules for changes.

If you start another agent, tell it to read both files first.

Then follow these rules:

- Use the vocabulary in docs/PRODUCT.md. Do not invent synonyms in copy, code or docs.
- Follow "Rules for changes" in ARCHITECTURE.md.
- If your change makes either file wrong, update that file in the same change.
- If a request conflicts with either file, say so before you build.
- Tests run in two stages (inside the app container, `docker compose exec app …`):
  1. **During development:** keep it fast. Run `npm run check` and only the unit `test:*` script for the area you changed. Add or update a test if none covers the change. Do not run `validate`, browser (`-browser`) or database (`-db`) tests at this stage.
  2. **After merging to local `main`:** run the full suite once: `npm run validate`, then every `-browser` and `-db` script in `package.json` (`validate` runs none of them).
  Report every command you ran and its result. If a test fails, or you could not run one, say which and why. Do not call `main` ready while a test you could run fails.
- `README.md` and `replit.md` are older and less accurate. Where they disagree with the two files above, the two files win.

## Repository access

- Do not clone or download repositories automatically.
- Use only source code already available in the current workspace.
- If the code is unavailable, explain what is missing and ask how to proceed.
- Read-only GitHub inspection is allowed, but do not download a local copy.
- Clone or download a repository only when the user explicitly asks you to do so.
