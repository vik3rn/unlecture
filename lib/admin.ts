import "server-only";

// Owner-only pages. ADMIN_EMAILS is a comma-separated list in Vercel's environment variables, so no address is
// written into this public repository.
export function isAdmin(email: string | null | undefined) {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
