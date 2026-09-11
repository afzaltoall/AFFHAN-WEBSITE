// ---------------------------------------------------------------------------
// Turns a supplier description into structured, renderable content.
//
// EPROLO returns the description as a blob of HTML — attribute tables, a size
// chart, and <img> tags pointing at the long-form marketing images. The PDP
// rendered it with `{product.description}`, which escapes markup, so all 12,742
// EPROLO product pages showed their raw tags as literal text on screen.
//
// The comment that made that look safe said the description column was empty
// for all 1,068,225 rows. That was true of CJ and only CJ: every EPROLO row has
// one. So the fix is not to print the string — it is to read it.
//
// Nothing here renders supplier HTML. The markup is parsed into plain values we
// control, which drops <style>, <a>, <script> and the embedded <img> tags along
// the way, so no supplier styling or outbound link can reach the page.
// ---------------------------------------------------------------------------

export interface ParsedDescription {
  /// Two-column "Fabric: Polyester" rows, in source order.
  specs: { label: string; value: string }[];
  /// A real size chart: header row plus body rows, when one is present.
  sizeChart: { headers: string[]; rows: string[][] } | null;
  /// Free prose that was not inside a table.
  paragraphs: string[];
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

/// Tag-strip one cell down to its text.
///
/// Stripped, decoded, then stripped again. The second pass is not belt and
/// braces: some descriptions carry entity-encoded markup
/// (`&lt;p style=&quot;font-size&quot;&gt;`), and decoding turns that back into
/// a real tag *after* the first strip has already run. Without the repeat, one
/// product rendered a literal `<p style="font-size` on the page — the same
/// class of bug this whole file exists to fix.
const cellText = (html: string) =>
  decode(html.replace(/<[^>]+>/g, " "))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/// Rows of a table, each as an array of cell texts.
function tableRows(tableHtml: string): string[][] {
  const rows: string[][] = [];
  for (const tr of tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((c) => cellText(c[2]));
    if (cells.some((c) => c.length)) rows.push(cells);
  }
  return rows;
}

// A cell that is really a picture — EPROLO puts marketing images inside table
// cells, and stripping tags leaves them as empty strings. Rows made only of
// those are dropped rather than rendered as blank lines.
const isEmptyRow = (r: string[]) => r.every((c) => !c);

export function parseDescription(html: string | null | undefined): ParsedDescription {
  const empty: ParsedDescription = { specs: [], sizeChart: null, paragraphs: [] };
  if (!html) return empty;

  const specs: { label: string; value: string }[] = [];
  let sizeChart: ParsedDescription["sizeChart"] = null;
  const seen = new Set<string>();

  for (const t of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = tableRows(t[0]).filter((r) => !isEmptyRow(r));
    if (!rows.length) continue;

    const widest = Math.max(...rows.map((r) => r.length));
    if (widest <= 2) {
      // Attribute table: label / value pairs.
      for (const r of rows) {
        if (r.length < 2) continue;
        const label = r[0].replace(/[:：]\s*$/, "").trim();
        const value = r[1].trim();
        if (!label || !value) continue;
        const key = label.toLowerCase();
        if (seen.has(key)) continue; // suppliers repeat rows; keep the first
        seen.add(key);
        specs.push({ label, value });
      }
    } else if (!sizeChart) {
      // First wide table is the size chart. Pad short rows so the grid stays
      // rectangular — supplier tables are frequently ragged.
      const [head, ...body] = rows;
      const pad = (r: string[]) => Array.from({ length: widest }, (_, i) => r[i] ?? "");
      sizeChart = { headers: pad(head), rows: body.map(pad) };
    }
  }

  // Prose outside any table — and the second spec format hiding inside it.
  //
  // EPROLO ships two layouts. One puts attributes in a two-column table
  // (handled above); the other emits one <p> per attribute, "Fabric:
  // Polyester". Only 85 of 12,746 descriptions use the table form, so reading
  // the tables alone left almost every product with no specs at all.
  const withoutTables = html.replace(/<table\b[\s\S]*?<\/table>/gi, " ");
  const paragraphs: string[] = [];
  for (const p of withoutTables.matchAll(/<(p|li|div|h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = cellText(p[2]);
    if (!text) continue;

    // "Label: Value" — an attribute, not prose. The label is bounded on both
    // sides so ordinary sentences that happen to contain a colon are not
    // shredded into fake attributes: a label carries no sentence punctuation
    // and is short, and the value has to be present and brief.
    const kv = text.match(/^\s*([^:：.!?]{2,40})[:：]\s*(.+)$/);
    if (kv) {
      const label = kv[1].trim();
      const value = kv[2].trim();
      const key = label.toLowerCase();
      if (value && value.length <= 200) {
        if (!seen.has(key)) {
          seen.add(key);
          specs.push({ label, value });
        }
        continue; // an attribute either way — never also prose
      }
    }

    // Short fragments are almost always layout noise, and a repeat of a spec
    // value adds nothing next to the table that already shows it.
    if (text.length < 12) continue;
    if (paragraphs.includes(text)) continue;
    paragraphs.push(text);
  }

  // Some rows carry no markup at all — treat the whole thing as prose.
  if (!specs.length && !sizeChart && !paragraphs.length) {
    const flat = cellText(html);
    if (flat.length >= 12) paragraphs.push(flat);
  }

  return { specs, sizeChart, paragraphs };
}
