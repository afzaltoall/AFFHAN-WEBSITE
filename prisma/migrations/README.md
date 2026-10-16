# SQL migrations, for a project that uses `db push`

This project changes its database with `npx prisma db push`. It has never used Prisma Migrate, so the database has no `_prisma_migrations` table and no migration history.

Each folder here holds the SQL for one schema change, generated with `prisma migrate diff` from the schema before the change to the schema after it. None drops or rewrites data. Applying one is a decision for each, not a sequence, because some are already on production:

| Folder | What it does | Production |
|---|---|---|
| `20261009094736_drop_duplicate_indexes` | drops three indexes that duplicate unique keys (security audit L2) | **not applied**: optional, write speed only |
| `20261009110827_email_suppression` | the `EmailSuppression` table | applied |
| `20261014104914_db_load` | `Product.isBlockedName`, `Category.productCount`, the `Snapshot` table; `product-index.sql` beside it | applied 2026-10-14, index included |
| `20261016095341_mobile_user_profile` | seven optional columns on `MobileUser`: `companyName` and the address (the app's "Complete your profile") | **not applied**: needed before feat/app-routes is deployed, since every sign-in reads the whole account row |

`20261008181537_otp_send_caps` (`MobilePhoneOtp.ipHash` and two indexes, for text-message caps) was deleted on 2026-10-15, never applied, together with phone sign-in and its codes; `schema.prisma` no longer has those columns either.

## Applying one

On a Neon branch first, and on production only after that has been checked, over the direct (non-pooled) endpoint:

```sh
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/<folder>/migration.sql
```

`DIRECT_URL` decides which database that is. `npx prisma db push` would make the same change from `schema.prisma`.

The code that needs a migration expects its columns and indexes to exist, so apply the migration **before** deploying that code. Update the table above when one is applied.

## Do not

Run `prisma migrate dev` or `prisma migrate deploy` against this database. With no history to compare against, `migrate dev` sees drift and offers to reset the database, which deletes everything in it.
