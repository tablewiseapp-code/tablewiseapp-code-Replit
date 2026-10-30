# Automatic validation

Run the same checks used before task completion and merge:

```sh
npm run validate
```

The registered Replit validation command is named `validate` and runs
`npm run validate`. Keep this as a single registered gate rather than
registering its individual checks again.

The command runs, in order, and stops with a nonzero exit code on any failure:

1. `npm run check` — full-project TypeScript checking of the client, shared
   code and server, including optional integration code.
2. `npm run check:pilot`
3. `npm run check:mvp`
4. `npm run check:analytics`
5. `npm run check:development-fixtures`
6. `npm run test:integration-utils`
7. `npm run test:curated-development`

The scoped checks remain necessary: their configurations include test and
maintenance scripts outside the full-project configuration's source roots.
They supplement, rather than replace, the full-project check. All checks use
the existing strict TypeScript configurations; no source exclusions or
diagnostic suppressions were added.

Both runtime tests above run offline with in-memory fixtures. This gate does
not start the app, access a database, import recipes, invoke paid APIs, or run
API/browser tests that require a running service.

The post-merge setup script remains install/build only. Validation belongs
before changes land, not in a second, duplicate post-merge gate. Deployment and
database operations are not part of this command.
