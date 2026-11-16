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
- `README.md` and `replit.md` are older and less accurate. Where they disagree with the two files above, the two files win.

## Repository access

- Do not clone or download repositories automatically.
- Use only source code already available in the current workspace.
- If the code is unavailable, explain what is missing and ask how to proceed.
- Read-only GitHub inspection is allowed, but do not download a local copy.
- Clone or download a repository only when the user explicitly asks you to do so.
