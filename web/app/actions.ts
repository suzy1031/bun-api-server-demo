"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

export type CreateItemState = { error: string | null };

function apiUrl() {
  return process.env.API_URL ?? "http://localhost:3000";
}

export async function createItem(
  _prev: CreateItemState,
  formData: FormData,
): Promise<CreateItemState> {
  const parsed = z
    .object({
      name: z.string().trim().min(1, "name is required"),
    })
    .safeParse({ name: String(formData.get("name") ?? "") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "name is required" };
  }
  const { name } = parsed.data;

  let response: Response;
  try {
    response = await fetch(`${apiUrl()}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  } catch {
    return { error: "api request failed" };
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    return { error: body?.error ?? "api request failed" };
  }

  revalidatePath("/");
  return { error: null };
}
