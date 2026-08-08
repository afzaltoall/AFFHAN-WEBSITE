// Thin wrapper over Brevo's transactional email REST API.
//   POST https://api.brevo.com/v3/smtp/email
//   header: api-key: <BREVO_API_KEY>
// We use the REST endpoint directly (no SDK dependency). The sender email
// MUST be a verified sender in the Brevo account or the send is rejected.

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

// Verified sender in Brevo (confirmed by the account owner).
const SENDER = { name: "Affhan International", email: "jabubackersiddiq@gmail.com" };

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

// Returns { ok } and never throws — callers decide how to react to a failed
// send without the request crashing.
export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.error("BREVO_API_KEY is not set");
    return { ok: false, error: "Email service not configured." };
  }

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: SENDER,
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Brevo send failed", res.status, body);
      return { ok: false, error: `Email send failed (${res.status}).` };
    }
    return { ok: true };
  } catch (err) {
    console.error("Brevo send error", err);
    return { ok: false, error: "Email send error." };
  }
}

// Branded OTP email used by the forgot-password flow.
export function otpEmailHtml(otp: string): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#0f172a">
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#0f172a">Affhan International</h2>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px">Password reset request</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6">
      Use the verification code below to reset your password. This code expires in
      <strong>10 minutes</strong>.
    </p>
    <div style="margin:8px 0 24px;padding:18px 0;text-align:center;background:#f1f5f9;border-radius:12px">
      <span style="font-size:34px;font-weight:800;letter-spacing:10px;color:#0f172a">${otp}</span>
    </div>
    <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6">
      If you didn't request a password reset, you can safely ignore this email — your
      password will not be changed.
    </p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
    <p style="margin:0;color:#94a3b8;font-size:12px">© ${new Date().getFullYear()} Affhan International Pvt Ltd</p>
  </div>`;
}
