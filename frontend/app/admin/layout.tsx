import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { isAdmin } from "@/lib/admin/session";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const signedIn = await isAdmin();
  return (
    <>
      {signedIn ? (
        <nav className="border-b">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-1 px-4">
            <Link href="/admin/jobs" className="min-h-11 content-center px-2 text-sm font-medium">
              Jobs
            </Link>
            <Link href="/admin/jobs/new" className="min-h-11 content-center px-2 text-sm font-medium">
              New job
            </Link>
            <Link href="/admin/api-keys" className="min-h-11 content-center px-2 text-sm font-medium">
              API keys
            </Link>
            <form action={logoutAction} className="ml-auto">
              <Button type="submit" variant="ghost" className="min-h-11">
                Sign out
              </Button>
            </form>
          </div>
        </nav>
      ) : null}
      {children}
    </>
  );
}
