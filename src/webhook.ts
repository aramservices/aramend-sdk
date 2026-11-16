// Verifies aramend revalidate webhooks. Web Crypto only, so it runs on Node, edge and workers.

export type WebhookEvent =
  | "publish"
  | "unpublish"
  | "delete"
  | "manual"
  | "test"

export type WebhookPayload = {
  site: string
  event: WebhookEvent
  model: string | null
  entryId: string | null
  /** ISO timestamp */
  triggeredAt: string
}

export type WebhookFailure =
  | "missing_headers"
  | "malformed_signature"
  | "invalid_signature"
  | "expired"
  | "invalid_body"

export type VerifyWebhookResult =
  | { ok: true; payload: WebhookPayload }
  | { ok: false; reason: WebhookFailure }

export type VerifyWebhookOptions = {
  /** ARAMEND_WEBHOOK_SECRET, shown once when the deploy target is created. */
  secret: string
  /** Max age (and clock skew) in seconds. Default 300. */
  toleranceSeconds?: number
  /** Unix seconds; override for tests. */
  now?: number
}

export const SIGNATURE_HEADER = "x-aramend-signature"
export const TIMESTAMP_HEADER = "x-aramend-timestamp"

const SIG_RE = /^sha256=([0-9a-f]{64})$/
const encoder = new TextEncoder()

/**
 * Verifies a raw webhook body against its headers. Pass the body exactly as received;
 * re-serialised JSON will not match the signature.
 */
export async function verifyWebhook(
  input: {
    body: string
    signature: string | null | undefined
    timestamp: string | null | undefined
  },
  options: VerifyWebhookOptions,
): Promise<VerifyWebhookResult> {
  if (!options.secret)
    throw new Error("[aramend/webhook] verifyWebhook: secret is empty")
  const { body, signature, timestamp } = input
  if (!signature || !timestamp) return { ok: false, reason: "missing_headers" }

  const hex = SIG_RE.exec(signature)?.[1]
  if (!hex || !/^\d+$/.test(timestamp))
    return { ok: false, reason: "malformed_signature" }

  const tolerance = options.toleranceSeconds ?? 300
  const now = options.now ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - Number(timestamp)) > tolerance)
    return { ok: false, reason: "expired" }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(options.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  )
  // subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    hexToBytes(hex),
    encoder.encode(`${timestamp}.${body}`),
  )
  if (!valid) return { ok: false, reason: "invalid_signature" }

  try {
    return { ok: true, payload: JSON.parse(body) as WebhookPayload }
  } catch {
    return { ok: false, reason: "invalid_body" }
  }
}

/** Reads and verifies a webhook `Request` (Next.js route handlers, Hono, workers). Consumes the body. */
export async function verifyWebhookRequest(
  request: Request,
  options: VerifyWebhookOptions,
): Promise<VerifyWebhookResult> {
  return verifyWebhook(
    {
      body: await request.text(),
      signature: request.headers.get(SIGNATURE_HEADER),
      timestamp: request.headers.get(TIMESTAMP_HEADER),
    },
    options,
  )
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}
