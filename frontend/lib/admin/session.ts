import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const SESSION_COOKIE = "admin_session";

function expectedToken(): string {
  return process.env.ADMIN_TOKEN ?? "";
}

/** The cookie holds an HMAC of a fixed label keyed by the admin token, never the token itself. */
function sign(token: string): string {
  return createHmac("sha256", token).update("fastorial-admin-session").digest("hex");
}

export function checkToken(candidate: string): boolean {
  const expected = expectedToken();
  if (!expected || !candidate) return false;
  const a = Buffer.from(sign(candidate));
  const b = Buffer.from(sign(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sessionValue(): string {
  return sign(expectedToken());
}

export async function isAdmin(): Promise<boolean> {
  const expected = expectedToken();
  if (!expected) return false;
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(sign(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Call at the top of every admin page and server action. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}
