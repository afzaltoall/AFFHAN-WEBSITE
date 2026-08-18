# Product image migration: CJ Dropshipping -> AWS S3

Moves every product image from its CJ Dropshipping URL to your own S3 bucket,
and updates the `imageUrl` column in your Postgres (Neon) `Product` table to
point to the new S3 link.

Your categories are 3 levels deep (root -> sub-category -> leaf category), and
`Product.category` only stores the leaf category name. The script looks up
the `Category` table twice (via `parentName`) to reconstruct the full
hierarchy, so images are saved as:

```
products/<root-category>/<sub-category>/<leaf-category>/<sku>.<ext>
```

Example: `products/automobiles-motorcycles/interior-accessories/steering-covers/CJFX2947188.jpg`

## 1. Install dependencies

```bash
npm install
```

## 2. Configure environment

Copy `.env.example` to `.env` and fill in your real values:

```bash
cp .env.example .env
```

- `DATABASE_URL` — your Neon connection string (found in Neon console -> Connect)
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` — from your AWS setup
- `BATCH_SIZE` — how many rows to pull from the DB at a time (100 is safe to start)
- `CONCURRENCY` — how many images to download/upload in parallel (10 is safe; raise slowly, CJ's servers may rate-limit or block you if too high)

## 3. Run it

```bash
npm run migrate
```

It will:
- Pull rows whose `imageUrl` does NOT already point to your S3 bucket
- Download each image, upload it to S3, update the row
- Print progress after every batch
- Automatically skip already-migrated rows if you stop and restart it
- Log any failed rows (bad URL, timeout, 404, etc.) to `failed-log.csv` instead of crashing

## 4. If it stops partway (network issue, laptop sleep, etc.)

Just run `npm run migrate` again. Since it always queries for rows whose
`imageUrl` is still a CJ link, it automatically continues from where it left
off — no manual tracking needed.

## 5. After it finishes

- Check `failed-log.csv` for any rows that failed (usually broken/expired CJ
  links). You can decide whether to retry those, use a placeholder image, or
  leave them as-is.
- Spot check a few rows in Neon's table view to confirm `imageUrl` values now
  point to your S3 bucket.

## Notes

- This script only migrates the main `imageUrl` column. If you also want to
  migrate the `allImages` JSON array (multiple images per product), that
  needs a small addition — ask if you want that version.
- Cost: S3 storage is cheap (~$0.023/GB/month), but 5 lakh+ images will add
  up in size — check your total image size after migration to estimate
  monthly cost.
- Never commit your `.env` file to GitHub — it contains your AWS secret key.
