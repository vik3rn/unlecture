import type { NextRequest } from "next/server";
import { presignGet, verifyStreamToken } from "@/lib/r2";

// GET /api/video/stream?t=<token> : the fallback for networks that block the R2 download endpoint (Spanish ISPs
// block Cloudflare addresses during LaLiga matches). It plays the one video in the signed token (made by
// /api/video after its login / free-preview check) by fetching it from R2 on the server and streaming it from our
// own domain. Every answer is one chunk of at most 4 MB (the browser asks for the next range by itself), which
// stays under Vercel's response size limit. Only used when the direct R2 link fails, so traffic stays small.
const CHUNK = 4 * 1024 * 1024;

const fail = (message: string, status: number) =>
  new Response(message, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });

// The byte range to fetch for the browser's Range header, capped at one chunk.
function rangeFor(header: string | null): string {
  const open = /^bytes=(\d+)-(\d*)$/.exec(header ?? "");
  if (open) {
    const start = Number(open[1]);
    const end = open[2] ? Math.min(Number(open[2]), start + CHUNK - 1) : start + CHUNK - 1;
    return `bytes=${start}-${Math.max(start, end)}`;
  }
  const suffix = /^bytes=-(\d+)$/.exec(header ?? "");
  if (suffix) return `bytes=-${Math.min(Number(suffix[1]), CHUNK)}`;
  return `bytes=0-${CHUNK - 1}`;
}

export async function GET(request: NextRequest) {
  const key = verifyStreamToken(request.nextUrl.searchParams.get("t") ?? "");
  if (!key) return fail("This video link has expired. Reload the page.", 403);
  const url = presignGet(key, 600);
  if (!url) return fail("Video storage is not set up.", 503);

  const upstream = await fetch(url, { headers: { Range: rangeFor(request.headers.get("range")) }, cache: "no-store" });
  if (upstream.status === 416) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": upstream.headers.get("content-range") ?? "", "Cache-Control": "no-store" },
    });
  }
  if (!upstream.ok || !upstream.body) return fail("The video could not be loaded.", 502);

  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") ?? "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  });
  for (const h of ["content-range", "content-length", "etag", "last-modified"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}
