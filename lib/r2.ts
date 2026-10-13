import "server-only";
import { createHash, createHmac } from "node:crypto";

// Short-lived download links for videos in a private Cloudflare R2 bucket (S3 API, AWS Signature V4 query
// signing, written out here so the app needs no AWS SDK). The browser plays the file straight from R2 with
// normal range requests, so video bytes never pass through Vercel. Keys live only in Vercel's environment
// variables: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.

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
