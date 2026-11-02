# Database migrations

The migration chain is applied by `npm run db:migrate` (Drizzle's
`drizzle-orm/postgres-js` migrator) in journal order:

| Index | Migration | Purpose |
| ---: | :--- | :--- |
| 0 | `0000_kind_dust.sql` | Initial schema |
| 1 | `0001_colorful_wild_child.sql` | Schema increment |
| 2 | `0002_flowery_namorita.sql` | Schema increment |
| 3 | `0003_add_username_and_password_resets.sql` | Username and password-reset tables |
| 4 | `0004_product_evidence_basis.sql` | Product evidence/basis metadata; trans fat nullable; cholesterol added |

## Snapshot note

`0003_snapshot.json` is absent because that migration was authored directly
rather than generated. The chain still applies in order, and `0004_snapshot.json`
reflects the current schema used by subsequent Drizzle generation. Do not
regenerate a migration from a state that lacks the 0003 schema changes.

## Safety behaviour in 0004

`0004_product_evidence_basis.sql` adds `nutrition_basis` with a storage default
for existing rows, then marks **all pre-existing products as unverified**. A
legacy row has no record of whether its values were per 100 g or per 100 ml, so
the storage default is not treated as evidence of the true basis. Such rows must
be reviewed and given explicit field-level evidence before they can be graded or
recommended as swaps.

## Validation

The full chain has been applied to a disposable PostgreSQL 17 database. The
result had five journal entries, `products.trans_fat_100g` nullable,
`products.cholesterol_mg_100g` present, and `products.nutrition_basis` present
with `NOT NULL` plus the documented storage default. Re-applying 0004 to a row
with `is_verified = true` set that row to `false` as intended.

Runtime migration state is recorded by Drizzle in
`drizzle.__drizzle_migrations`; snapshots are schema-generation aids, not
runtime state.
