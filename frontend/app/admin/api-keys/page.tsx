import type { Metadata } from "next";
import { revokeApiKeyAction } from "@/app/admin/actions";
import { ApiKeyForm } from "@/components/admin/api-key-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminListApiKeys } from "@/lib/admin/api";
import { formatDate } from "@/lib/admin/dates";
import { requireAdmin } from "@/lib/admin/session";

export const metadata: Metadata = { title: "API keys" };

export default async function ApiKeysPage() {
  await requireAdmin();
  const keys = await adminListApiKeys().catch(() => null);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-4">
      <div>
        <h1 className="text-xl font-semibold">API keys</h1>
        <p className="text-muted-foreground text-sm">
          Send a key as the <code>X-API-Key</code> header to create and manage jobs from your automations. See the README for a request template.
        </p>
      </div>
      <ApiKeyForm />
      {keys === null ? (
        <p className="text-destructive text-sm">Could not load API keys.</p>
      ) : keys.length === 0 ? (
        <p className="text-muted-foreground text-sm">No API keys yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell>
                  <code>{k.keyPrefix}…</code>
                </TableCell>
                <TableCell>{formatDate(k.createdAt)}</TableCell>
                <TableCell>{k.lastUsedAt ? formatDate(k.lastUsedAt) : "Never"}</TableCell>
                <TableCell>
                  {k.revokedAt ? (
                    <Badge variant="secondary">Revoked</Badge>
                  ) : (
                    <form action={revokeApiKeyAction}>
                      <input type="hidden" name="id" value={k.id} />
                      <Button data-track="admin_api_key_revoke_button" type="submit" variant="outline" size="sm" className="min-h-9">
                        Revoke
                      </Button>
                    </form>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
