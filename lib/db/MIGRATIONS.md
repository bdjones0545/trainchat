# TrainChat database migrations

## Production authority

Ordered, versioned migrations in `lib/db/drizzle/` are the only production
migration authority. Apply them with:

```bash
pnpm --filter @workspace/db migrate
```

`drizzle-kit migrate` records each applied migration in
`drizzle.__drizzle_migrations` and runs unapplied files in journal order. A
migration failure aborts the command and must prevent application rollout.

`0000_current_schema.sql` is the complete baseline generated from
`lib/db/src/schema/index.ts`. It creates all tables before adding foreign keys,
so referenced relations always exist first. New schema changes require a new
generated migration; never edit an already-deployed migration.

## Local development

Use the production migration path by default:

```bash
pnpm --filter @workspace/db migrate
```

For a disposable local database only, `dev:push` may be used to rapidly
reconcile a schema during exploration:

```bash
pnpm --filter @workspace/db dev:push
```

`dev:push` and `dev:push-force` are not production commands and must never be
used by deployment automation.

## Existing untracked databases

Do not run the new baseline against a non-empty database that lacks
`drizzle.__drizzle_migrations`: its existing objects will make the baseline
fail safely. Before switching such an environment to the migration runner, an
owner must compare it with the migration-built schema, resolve drift, back it
up, and explicitly baseline its migration history. This is a one-time
production cutover action and is intentionally not automated by this repo.

## Verification

Every migration change must be proven by creating an empty PostgreSQL database,
running only `migrate`, and comparing the resulting public schema with a
separate database created from the current Drizzle schema. Verify tables,
columns, types, nullability, defaults, keys, foreign keys, unique constraints,
and indexes before deployment.
