import fs from 'fs';
const p = 'prisma/schema.prisma';
const raw = fs.readFileSync(p, 'utf8');
const hadCRLF = raw.includes('\r\n');
let s = raw.replace(/\r\n/g, '\n');

if (s.includes('supplierSource')) { console.log('already present — nothing to do'); process.exit(0); }

const oldHead = `model Product {
  id        Int     @id @default(autoincrement())
  cjPid     String  @unique
  name      String
  sku       String?
  imageUrl  String?
  allImages Json?
`;
const newHead = `model Product {
  id Int @id @default(autoincrement())

  /// The supplier's own id for this product. Named for CJ because CJ was the
  /// only source when the column was created; it now holds EPROLO's catalogue
  /// product id on EPROLO rows too. Read it together with \`supplierSource\` —
  /// the id space is per-supplier, not global. It stays unique in practice
  /// because CJ pids are UUIDs and EPROLO's are short numeric strings.
  cjPid String @unique

  /// Which supplier this row came from: CJ | EPROLO.
  ///
  /// Defaults to CJ so the rows that predate EPROLO are labelled correctly
  /// without a backfill pass over a million products.
  supplierSource String @default("CJ")

  name      String
  sku       String?
  imageUrl  String?
  allImages Json?

  /// Shipping weight in grams, when the supplier gives one. CJ's feed does
  /// not, so this is null on every CJ row and populated only from EPROLO.
  weightGrams Int?
`;
if (!s.includes(oldHead)) throw new Error('Product head not found');
s = s.replace(oldHead, newHead);

const oldRel = `  inquiries       Inquiry[]
  mobileInquiries MobileInquiry[]
  views           ProductView[]
  favourites      ProductFavourite[]

  @@index([categoryId])`;
const newRel = `  inquiries       Inquiry[]
  mobileInquiries MobileInquiry[]
  views           ProductView[]
  favourites      ProductFavourite[]
  variants        ProductVariant[]

  @@index([supplierSource])
  @@index([categoryId])`;
if (!s.includes(oldRel)) throw new Error('Product relations not found');
s = s.replace(oldRel, newRel);

const variantModel = `
/// One purchasable variation of a Product — a size, a colour, or the single
/// "default" row a product with no options still gets.
///
/// Added for EPROLO, which returns a \`variantlist\` per product. CJ's feed has
/// no variant data at all (see the "no structured attributes" note in
/// CLAUDE.md), so CJ products simply have none of these rows, and anything
/// reading variants must cope with an empty list rather than assume one.
///
/// \`cost\` is the supplier's wholesale cost. It is stored because the sourcing
/// team quotes against it and — like every other price in this project — it
/// must never be rendered in the customer-facing UI. It is not our price.
model ProductVariant {
  id Int @id @default(autoincrement())

  productId Int
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  /// The supplier's variant id. Per-supplier like Product.cjPid, and read
  /// alongside the parent's supplierSource.
  supplierVariantId String @unique

  sku     String?
  title   String?
  option1 String?
  option2 String?
  option3 String?

  /// Supplier cost. Decimal, not Float: this is money and it gets compared.
  cost Decimal? @db.Decimal(10, 2)

  /// Grams, as EPROLO reports it.
  weightGrams Int?

  inventoryQuantity Int?

  /// The variant's own image, already migrated to our CDN like every other
  /// image here — never a supplier hotlink.
  imageUrl String?

  position Int @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([productId])
}
`;
const marker = '\nmodel Category {';
if (!s.includes(marker)) throw new Error('Category marker not found');
s = s.replace(marker, variantModel + marker);

fs.writeFileSync(p, hadCRLF ? s.replace(/\n/g, '\r\n') : s);
console.log(`restored (${hadCRLF ? 'CRLF' : 'LF'} preserved)`);
