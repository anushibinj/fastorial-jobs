import type { Metadata } from "next";
import { PostintimeForm } from "@/components/admin/postintime-form";
import { adminGetPostintimeSettings } from "@/lib/admin/api";
import { formatDateTime } from "@/lib/admin/dates";
import { requireAdmin } from "@/lib/admin/session";

export const metadata: Metadata = { title: "PostInTime" };

export default async function PostintimePage() {
  await requireAdmin();
  const settings = await adminGetPostintimeSettings().catch(() => null);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-4">
      <div>
        <h1 className="text-xl font-semibold">PostInTime</h1>
        <p className="text-muted-foreground text-sm">
          When a job is created and published, it is pushed to your PostInTime server as a post: the share text as the caption and the
          job preview picture, cropped to 1:1, as the image.
        </p>
      </div>
      {settings === null ? (
        <p className="text-destructive text-sm">Could not load the settings.</p>
      ) : (
        <>
          <PostintimeForm settings={settings} />
          <section className="flex flex-col gap-1 rounded-lg border p-3" aria-labelledby="last-push">
            <h2 id="last-push" className="text-sm font-medium">
              Last push
            </h2>
            {settings.lastResult ? (
              <p className="text-sm">
                {settings.lastResult}
                {settings.lastAttemptAt ? <span className="text-muted-foreground"> · {formatDateTime(settings.lastAttemptAt)}</span> : null}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">Nothing has been pushed yet.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
