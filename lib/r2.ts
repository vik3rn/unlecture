import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Short-lived download links for videos in a private Cloudflare R2 bucket (S3 API, AWS Signature V4 query
// signing, written out here so the app needs no AWS SDK). The browser plays the file straight from R2 with
// normal range requests, so video bytes normally never pass through Vercel (the blocked-network fallback at the
// bottom is the exception). Keys live only in Vercel's environment variables: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_BUCKET.

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const hmac = (key: string | Buffer, s: string) => createHmac("sha256", key).update(s, "utf8").digest();

export function r2Configured() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
}

// AWS Signature V4 query signing for a GET (exported for the test against AWS's published example).
export function signGet(o: { host: string; path: string; region: string; keyId: string; secret: string; seconds: number; now: Date }) {
  const amzDate = o.now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // YYYYMMDDTHHMMSSZ
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${o.region}/s3/aws4_request`;
  const params: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${o.keyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.max(1, Math.min(604800, Math.floor(o.seconds)))),
    "X-Amz-SignedHeaders": "host",
  };
  const query = Object.keys(params)
    .sort()
    .map((k) => `${enc(k)}=${enc(params[k])}`)
    .join("&");
  const canonical = ["GET", o.path, query, `host:${o.host}`, "", "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${o.secret}`, day), o.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(toSign, "utf8").digest("hex");
  return `https://${o.host}${o.path}?${query}&X-Amz-Signature=${signature}`;
}

// A GET link for one object in the R2 bucket that works for `seconds` (R2 allows 1 s to 7 days).
export function presignGet(key: string, seconds: number, now = new Date()): string | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  return signGet({
    host: `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    path: `/${enc(R2_BUCKET)}/${key.split("/").map(enc).join("/")}`,
    region: "auto",
    keyId: R2_ACCESS_KEY_ID,
    secret: R2_SECRET_ACCESS_KEY,
    seconds,
    now,
  });
}

// Some Spanish ISPs block Cloudflare addresses during LaLiga matches (a court order against piracy), the R2
// download endpoint included. Then the player falls back to /api/video/stream, which fetches the same file from
// R2 on the server and streams it in chunks from our own domain. The fallback link carries a signed token (the
// object key and an expiry, HMAC with a key derived from R2_SECRET_ACCESS_KEY), so it can only serve the one
// video the visitor was allowed to watch, until the token expires.
const tokenKey = () => {
  const s = process.env.R2_SECRET_ACCESS_KEY;
  return s ? hmac(s, "unlecture-video-stream-v1") : null;
};
const b64 = (b: Buffer) => b.toString("base64url");

export function signStreamToken(key: string, seconds: number, now = Date.now()): string | null {
  const k = tokenKey();
  if (!k) return null;
  const body = b64(Buffer.from(JSON.stringify({ k: key, e: Math.floor(now / 1000) + Math.floor(seconds) }), "utf8"));
  return `${body}.${b64(createHmac("sha256", k).update(body).digest())}`;
}

// The object key inside a valid, unexpired token, or null.
export function verifyStreamToken(token: string, now = Date.now()): string | null {
  const k = tokenKey();
  const [body, sig] = token.split(".");
  if (!k || !body || !sig || token.length > 2000) return null;
  const want = createHmac("sha256", k).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const { k: key, e } = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { k?: unknown; e?: unknown };
    if (typeof key !== "string" || typeof e !== "number" || e * 1000 < now) return null;
    return key;
  } catch {
    return null;
  }
}
