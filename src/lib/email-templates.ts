import { OTP_TTL_MS } from "@/lib/mobile-otp";
import { OFFICES } from "@/lib/brand";
import type { EmailMessage } from "@/lib/email";

// ---------------------------------------------------------------------------
// What our transactional emails say.
//
// Kept away from the sending code and away from the routes: the wording of a
// security email is worth reading on its own, and a route deciding both what
// to do and how to phrase it ends up with neither reviewed properly.
//
// Plain and narrow on purpose. A password-reset email that looks like a
// marketing campaign — big images, buttons, tracking pixels — is the exact
// shape people are told to distrust, and it is the shape spam filters weigh
// against. So: the AFFHAN logo, the message, and a footer with the registered
// company, its Chennai address, one link (to affhan.com) and the reason the
// reader got it. The logo is the one image (LOGO), on our own domain, with
// alt="AFFHAN" styled as the old text header for a reader whose images are
// off; no other images, no pixels, nothing to sell.
//
// Dark mode: the light styles are inline and stay the base; a client that
// honours prefers-color-scheme (Apple Mail, iOS, Outlook for Mac) takes the
// dark ones from <style>. Gmail and Outlook darken a message themselves and
// never an image, so the logo carries its own white tile: invisible on white,
// and a badge that stays legible on any dark ground.
//
// Each message is written once, as blocks, and rendered twice — plain text
// and HTML — so the two versions cannot drift apart. Everything is escaped on
// the way into the HTML, which matters for the parts a customer typed.
// ---------------------------------------------------------------------------

const BRAND = "AFFHAN";
const SITE = "https://affhan.com";
const TTL_MINUTES = Math.round(OTP_TTL_MS / 60000);

/**
 * public/email/affhan-logo.png: the site's logo (public/logo.png, trimmed) on a
 * white rounded tile, 240x186, shown at half that so it is sharp on a 2x
 * screen. The site's master is 177px wide, so the 200px logo inside is a mild
 * 1.13x of it.
 */
const LOGO = { src: `${SITE}/email/affhan-logo.png`, width: 120, height: 93 };

const office = OFFICES.chennai;
// addressCountry is the ISO code "IN"; a reader wants the name.
const ADDRESS = `${office.address.streetAddress}, ${office.address.addressLocality}, ${office.address.addressRegion} ${office.address.postalCode}, India`;

/** Text into HTML. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

type Block =
  | { kind: "heading"; text: string }
  | { kind: "para"; text: string }
  | { kind: "code"; text: string }
  | { kind: "details"; rows: [label: string, value: string][] }
  | { kind: "signoff"; text: string };

const INK = "#0f172a";
const BODY = "#334155";
const QUIET = "#64748b";
const ACCENT = "#336888";
const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

function textOf(blocks: Block[], footerNote: string): string {
  const body = blocks
    .map((b) => (b.kind === "details" ? b.rows.map(([label, value]) => `${label}: ${value}`).join("\n") : b.text))
    .join("\n\n");
  return `${body}\n\n--\n${office.legalName}\n${ADDRESS}\n${SITE}\n\n${footerNote}\n`;
}

function htmlOf(subject: string, blocks: Block[], footerNote: string): string {
  const body = blocks
    .map((b) => {
      switch (b.kind) {
        case "heading":
          return `<h1 class="ink" style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${INK}">${escapeHtml(b.text)}</h1>`;
        case "para":
          return `<p class="body" style="margin:0 0 16px;font-size:15px;color:${BODY}">${escapeHtml(b.text)}</p>`;
        case "code":
          return `<p class="ink" style="margin:4px 0 20px;font-size:32px;font-weight:700;letter-spacing:8px;font-family:${MONO};color:${INK}">${escapeHtml(b.text)}</p>`;
        case "details":
          return `<table class="box" role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;border-collapse:separate;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">${b.rows
            .map(
              ([label, value]) =>
                `<tr><td class="quiet" style="padding:10px 14px;font-size:13px;color:${QUIET};vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td class="ink" style="padding:10px 14px 10px 0;font-size:14px;color:${INK};vertical-align:top">${escapeHtml(value).replace(/\r?\n/g, "<br>")}</td></tr>`
            )
            .join("")}</table>`;
        case "signoff":
          return `<p class="ink" style="margin:0 0 16px;font-size:15px;font-weight:600;color:${INK}">${escapeHtml(b.text)}</p>`;
      }
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<style>
@media (prefers-color-scheme: dark) {
  .bg { background:#0b1220 !important; color:#f1f5f9 !important; }
  .ink { color:#f1f5f9 !important; }
  .body { color:#cbd5e1 !important; }
  .quiet { color:#94a3b8 !important; }
  .accent { color:#7dd3fc !important; }
  .rule { border-top-color:#1e293b !important; }
  .box { background:#111827 !important; border-color:#1e293b !important; }
}
</style>
</head>
<body class="bg" style="margin:0;padding:24px 16px;background:#ffffff;color:${INK};font-family:${FONT};line-height:1.55">
<div style="max-width:520px;margin:0 auto">
<img src="${LOGO.src}" width="${LOGO.width}" height="${LOGO.height}" alt="${BRAND}" style="display:block;margin:0 0 24px;border:0;outline:none;text-decoration:none;font-size:14px;font-weight:800;letter-spacing:3px;color:${ACCENT}">
${body}
<hr class="rule" style="border:0;border-top:1px solid #e2e8f0;margin:28px 0 16px">
<p class="quiet" style="margin:0 0 2px;font-size:12px;font-weight:700;color:${QUIET}">${escapeHtml(office.legalName)}</p>
<p class="quiet" style="margin:0 0 2px;font-size:12px;color:${QUIET}">${escapeHtml(ADDRESS)}</p>
<p style="margin:0 0 12px;font-size:12px"><a class="accent" href="${SITE}" style="color:${ACCENT}">affhan.com</a></p>
<p class="quiet" style="margin:0;font-size:12px;color:${QUIET}">${escapeHtml(footerNote)}</p>
</div>
</body>
</html>
`;
}

function render(subject: string, blocks: Block[], footerNote: string): Omit<EmailMessage, "to"> {
  return { subject, text: textOf(blocks, footerNote), html: htmlOf(subject, blocks, footerNote) };
}

/** Replies reach a person (REPLY_TO in lib/email.ts), so a customer can simply answer. */
const ASK = "Questions? Reply to this email.";

/**
 * The code itself, for someone resetting their password — a customer on
 * /forgot-password/ or a member of staff on the staff sign-in.
 *
 * No link. A reset link in an email is a credential that survives in inboxes,
 * forwards and browser history; a six-digit code typed back into the page the
 * reader already has open is not. It also means a leaked email alone is not
 * enough — the reader has to be at the form. The code stays out of the
 * subject, which lock screens and notification previews show to anyone.
 */
export function passwordResetCodeEmail(code: string): Omit<EmailMessage, "to"> {
  return render(
    `Your ${BRAND} password reset code`,
    [
      { kind: "heading", text: "Reset your password" },
      { kind: "para", text: `Use this code to reset your ${BRAND} password:` },
      { kind: "code", text: code },
      { kind: "para", text: `Enter it on the page where you asked for it. It expires in ${TTL_MINUTES} minutes and works only once.` },
      { kind: "para", text: "If you didn't request this, ignore this email. Your password has not been changed." },
      { kind: "para", text: "Don't share this code with anyone." },
    ],
    `You received this email because a password reset was requested for this address on affhan.com. ${ASK}`
  );
}

/**
 * For an account that has no password to reset.
 *
 * Sent instead of a code when the address signs in with Google. The HTTP
 * response is identical either way — the server never tells a stranger which
 * addresses exist — but the person who actually owns the inbox deserves to
 * know why no code arrived, rather than being left pressing the button.
 */
export function noPasswordOnAccountEmail(): Omit<EmailMessage, "to"> {
  return render(
    `Your ${BRAND} account signs in with Google`,
    [
      { kind: "heading", text: "Password reset" },
      { kind: "para", text: `Someone asked to reset the password for your ${BRAND} account.` },
      { kind: "para", text: `That account doesn't have a password. It signs in with Google, so use "Continue with Google" on the sign-in page and you'll be straight in.` },
      { kind: "para", text: "If you didn't request this, ignore this email. Nothing has changed on your account." },
    ],
    `You received this email because a password reset was requested for this address on affhan.com. ${ASK}`
  );
}

/**
 * The acknowledgement of a quote request, in the words of the confirmation the
 * customer sees on screen (components/ui/InquiryReceipt.tsx): what they asked
 * for, the quantity and their note, then a word from the sourcing team by
 * their first name. Like the screen, it does not read back their email or
 * phone, and gives no reference number, because nobody could look one up.
 *
 * NOT SENT. No route calls this: an inquiry is acknowledged on screen only.
 * Sending it from /api/inquiries is a change of its own.
 */
export function inquiryReceivedEmail(details: {
  /** The name typed on the form. */
  name: string;
  productName: string;
  /** The MOQ as the form showed it ("20 - 50 pcs"). */
  quantity?: string;
  /** What they wrote with it, if anything. */
  note?: string;
}): Omit<EmailMessage, "to"> {
  const firstName = details.name.trim().split(/\s+/)[0] ?? "";
  const quantity = details.quantity?.trim() ?? "";
  const note = details.note?.trim() ?? "";
  const rows: [string, string][] = [["Product", details.productName.trim()]];
  if (quantity) rows.push(["Quantity", quantity]);
  if (note) rows.push(["Your note", note]);

  return render(
    `Your ${BRAND} inquiry has been received`,
    [
      { kind: "heading", text: "Inquiry received" },
      { kind: "para", text: `Hi ${firstName || "there"}, thanks for your inquiry! We'll contact you with a quote, usually within 24 hours.` },
      { kind: "details", rows },
      { kind: "signoff", text: `${BRAND} Sourcing Team` },
    ],
    `You received this email because you sent an inquiry on affhan.com. ${ASK}`
  );
}

/**
 * The customers the open pool gave up on in one sweep: a week in the pool, and nobody took them on or recorded
 * an outcome.
 *
 * The only message here that goes to the office rather than to a customer, and the only one anybody is expected
 * to act on. It exists because INVALID is otherwise a state with no witness: the customer stops being anybody's
 * work and waits on somebody filtering the console's lists for Invalid to notice.
 *
 * One email per sweep however many there are, not one per customer: a week after a busy day, or after the switch
 * to self-claim put the whole backlog into the pool at once, one per customer would be a flood that buries the
 * point. Says who, what they asked for, and where to go. No link, as in the reset email: the console is behind a
 * login, so a URL in an inbox saves nobody anything. Names are whatever customers typed, and are escaped like
 * everything else.
 */
export function poolGivenUpEmail(customers: { code: string | null; name: string; items: string; since: string }[]): Omit<EmailMessage, "to"> {
  const n = customers.length;
  const shown = customers.slice(0, 50);
  return render(
    n === 1 ? `Open pool: nobody took on ${customers[0].name}` : `Open pool: nobody took on ${n} customers`,
    [
      {
        kind: "para",
        text: `${n === 1 ? "This customer was" : `These ${n} customers were`} in the open pool for a week without anybody taking them on or recording an outcome, and ${n === 1 ? "has" : "have"} been given up on.`,
      },
      { kind: "details", rows: shown.map((c) => [c.code ?? "No number yet", `${c.name} · ${c.items} · in the pool since ${c.since}`]) },
      ...(n > shown.length ? [{ kind: "para" as const, text: `And ${n - shown.length} more.` }] : []),
      { kind: "para", text: "Nobody holds them now. In the admin console, the Inquiries, Contact Us and Shipping lists show them under the Invalid filter, and a new request from any of them puts them back in the pool for a new week." },
    ],
    `Sent to every administrator of the ${BRAND} console.`
  );
}
