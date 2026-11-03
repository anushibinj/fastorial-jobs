"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiRequestError } from "@/lib/api/client";
import {
  adminCreateJob,
  adminDetectTags,
  adminExtend,
  adminSetStatus,
  adminUpdateJob,
} from "@/lib/admin/api";
import { jobRequestFromForm } from "@/lib/admin/form";
import { checkToken, requireAdmin, SESSION_COOKIE, sessionValue } from "@/lib/admin/session";
import type { DetectedTag, JobStatus } from "@/lib/types";

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
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete({ name: SESSION_COOKIE, path: "/admin" });
  redirect("/admin/login");
}

function toFormState(e: unknown): FormState {
  if (e instanceof ApiRequestError) {
    return { error: e.body?.message ?? e.message, fieldErrors: e.body?.fieldErrors };
  }
  return { error: "Something went wrong" };
}

/** Creates a job, or updates it when the form carries an `id`. */
export async function saveJobAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const payload = jobRequestFromForm(formData);
  try {
    if (id) await adminUpdateJob(id, payload);
    else await adminCreateJob(payload);
  } catch (e) {
    return toFormState(e);
  }
  revalidatePath("/admin");
  redirect("/admin");
}

export async function setStatusAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await adminSetStatus(String(formData.get("id")), String(formData.get("status")) as JobStatus);
  revalidatePath("/admin");
}

/** Extends a published job, or reopens a closed one. */
export async function extendAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const days = Number(formData.get("days"));
  await adminExtend(String(formData.get("id")), Number.isFinite(days) && days > 0 ? days : undefined);
  revalidatePath("/admin");
}

export async function detectTagsAction(title: string, description: string): Promise<DetectedTag[]> {
  await requireAdmin();
  return adminDetectTags(title, description);
}
