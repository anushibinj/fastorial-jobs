"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  adminCreateApiKey,
  adminCreateJob,
  adminDetectTags,
  adminExtend,
  adminRevokeApiKey,
  adminSavePostintimeSettings,
  adminSetStatus,
  adminUpdateJob,
} from "@/lib/admin/api";
import { checkToken, requireAdmin, SESSION_COOKIE, sessionValue } from "@/lib/admin/session";
import type { DetectedTag, JobRequest } from "@/lib/types";
import { ApiException } from "@/server/shared/api-exception";

export type FormState = { error?: string; fieldErrors?: Record<string, string> };

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  if (!checkToken(token)) return { error: "Wrong token" };
  (await cookies()).set(SESSION_COOKIE, sessionValue(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect("/admin/jobs");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete({ name: SESSION_COOKIE, path: "/admin" });
  redirect("/admin/login");
}

/** Turns a validation or business error into form state; anything unexpected becomes a generic message. */
function toFormState(e: unknown): FormState {
  if (ApiException.is(e)) {
    return { error: e.message, fieldErrors: e.fieldErrors };
  }
  console.error("[jobs] Unhandled error in an admin action", e);
  return { error: "Something went wrong" };
}

/** Creates a job, or updates it when `id` is given. Returns an error state, or redirects on success. */
export async function saveJobAction(id: string | null, payload: JobRequest): Promise<FormState> {
  await requireAdmin();
  try {
    if (id) await adminUpdateJob(id, payload);
    else await adminCreateJob(payload);
  } catch (e) {
    return toFormState(e);
  }
  revalidatePath("/admin/jobs");
  redirect("/admin/jobs");
}

export async function setStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await adminSetStatus(String(formData.get("id")), String(formData.get("status")));
  revalidatePath("/admin/jobs");
}

/** Extends a published job, or reopens a closed one. */
export async function extendAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const days = Number(formData.get("days"));
  await adminExtend(String(formData.get("id")), Number.isFinite(days) && days > 0 ? days : undefined);
  revalidatePath("/admin/jobs");
}

export async function detectTagsAction(title: string, description: string): Promise<DetectedTag[]> {
  await requireAdmin();
  return adminDetectTags(title, description);
}

export type ApiKeyState = FormState & { key?: string; name?: string };

/** Returns the plaintext key once; it cannot be retrieved again. */
export async function createApiKeyAction(_prev: ApiKeyState, formData: FormData): Promise<ApiKeyState> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required" };
  try {
    const created = await adminCreateApiKey(name);
    revalidatePath("/admin/api-keys");
    return { key: created.key ?? undefined, name: created.name };
  } catch (e) {
    return toFormState(e);
  }
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await adminRevokeApiKey(String(formData.get("id")));
  revalidatePath("/admin/api-keys");
}

export type PostintimeFormState = FormState & { saved?: boolean };

/** Saves the PostInTime connection. The token is only ever sent from the browser to here, never back. */
export async function savePostintimeSettingsAction(payload: unknown): Promise<PostintimeFormState> {
  await requireAdmin();
  try {
    await adminSavePostintimeSettings(payload);
  } catch (e) {
    return toFormState(e);
  }
  revalidatePath("/admin/postintime");
  return { saved: true };
}
