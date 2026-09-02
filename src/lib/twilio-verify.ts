// ---------------------------------------------------------------------------
// Twilio Verify.
//
// Verify owns the code: it generates it, sends it, holds it, expires it and
// checks it. We never see the digits. That is the point of the product, and it
// is why there is no code generation, hashing or expiry logic here — an earlier
// revision of this project had all three, and keeping them alongside Verify
// would mean two sources of truth for whether a code is valid.
//
// Called over REST rather than through the `twilio` npm package. The SDK pulls
// in the whole API surface — every product, every version — to reach two
// endpoints, and it lands in a serverless bundle that pays for its size on
// every cold start.
// ---------------------------------------------------------------------------

const API_ROOT = "https://verify.twilio.com/v2/Services";

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  serviceSid: string;
}

/** Credentials, or null when the deployment has not been given them yet. */
export function twilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!accountSid || !authToken || !serviceSid) return null;
  return { accountSid, authToken, serviceSid };
}

export type VerifyOutcome =
  | { ok: true }
  | { ok: false; reason: "invalid_code" | "expired" | "too_many_attempts" | "unconfigured" | "provider_error"; message: string };

export type SendOutcome =
  | { ok: true }
  | { ok: false; reason: "unconfigured" | "rate_limited" | "invalid_number" | "provider_error"; message: string };

function authHeader({ accountSid, authToken }: TwilioConfig) {
  return "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
}

async function post(config: TwilioConfig, path: string, params: Record<string, string>) {
  const res = await fetch(`${API_ROOT}/${config.serviceSid}/${path}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(config),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
    // A hung request must not hold a serverless invocation open to its ceiling.
    signal: AbortSignal.timeout(12_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

/**
 * Ask Twilio to send a code.
 *
 * Twilio's own error codes are mapped to reasons the caller can act on rather
 * than passed through — 60203 in a JSON body means nothing to anyone reading
 * it on a phone.
 */
export async function sendVerification(phone: string): Promise<SendOutcome> {
  const config = twilioConfig();
  if (!config) {
    return {
      ok: false,
      reason: "unconfigured",
      message: "Phone sign-in is not available yet.",
    };
  }

  try {
    const { status, json } = await post(config, "Verifications", { To: phone, Channel: "sms" });

    if (status >= 200 && status < 300) return { ok: true };

    const code = Number(json.code);
    // 60203: too many sends to this number in the current window.
    if (code === 60203 || status === 429) {
      return {
        ok: false,
        reason: "rate_limited",
        message: "Too many codes requested for this number. Please wait and try again.",
      };
    }
    // 60200 invalid parameter, 21211 invalid To.
    if (code === 60200 || code === 21211) {
      return { ok: false, reason: "invalid_number", message: "That phone number is not valid." };
    }

    console.error("[twilio] send failed", { status, code, message: json.message });
    return {
      ok: false,
      reason: "provider_error",
      message: "Could not send the code. Please try again.",
    };
  } catch (err) {
    console.error("[twilio] send threw", err);
    return {
      ok: false,
      reason: "provider_error",
      message: "Could not reach the SMS service. Please try again.",
    };
  }
}

/** Check a code the customer typed. */
export async function checkVerification(phone: string, code: string): Promise<VerifyOutcome> {
  const config = twilioConfig();
  if (!config) {
    return { ok: false, reason: "unconfigured", message: "Phone sign-in is not available yet." };
  }

  try {
    const { status, json } = await post(config, "VerificationCheck", { To: phone, Code: code });

    // Twilio answers 200 with status "approved" or "pending"; "pending" here
    // means the code did not match.
    if (status >= 200 && status < 300) {
      if (json.status === "approved" && json.valid === true) return { ok: true };
      return { ok: false, reason: "invalid_code", message: "That code is not correct." };
    }

    const twilioCode = Number(json.code);
    // 20404: no verification pending for this number — it expired, or was
    // already used. Twilio deletes it on success, so a second check of a good
    // code lands here too.
    if (status === 404 || twilioCode === 20404) {
      return {
        ok: false,
        reason: "expired",
        message: "That code has expired. Please request a new one.",
      };
    }
    // 60202: too many wrong guesses against this verification.
    if (twilioCode === 60202 || status === 429) {
      return {
        ok: false,
        reason: "too_many_attempts",
        message: "Too many incorrect attempts. Please request a new code.",
      };
    }

    console.error("[twilio] check failed", { status, code: twilioCode, message: json.message });
    return { ok: false, reason: "provider_error", message: "Could not check the code. Please try again." };
  } catch (err) {
    console.error("[twilio] check threw", err);
    return {
      ok: false,
      reason: "provider_error",
      message: "Could not reach the SMS service. Please try again.",
    };
  }
}
