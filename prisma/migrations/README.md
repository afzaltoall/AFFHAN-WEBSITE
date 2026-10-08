# SQL migrations, for a project that uses `db push`

This project changes its database with `npx prisma db push`. It has never used Prisma Migrate, so the database has no `_prisma_migrations` table and no migration history.

The folders here hold the SQL for schema changes made on the `security-audit-fixes` branch (2026-10-08). Each was generated with `prisma migrate diff`, from the schema before the change to the schema after it, and none drops or rewrites data.

## Applying one

Apply them in folder order, on a Neon branch first and on production only after that has been checked:

```sh
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/<folder>/migration.sql
```

`DATABASE_URL` decides which database that is. `npx prisma db push` would make the same change from `schema.prisma`.

The code that needs a migration expects its columns and indexes to exist, so apply the migration **before** deploying that code.

## Do not

Run `prisma migrate dev` or `prisma migrate deploy` against this database. With no history to compare against, `migrate dev` sees drift and offers to reset the database, which deletes everything in it.
