"use server";

import { revalidatePath } from "next/cache";

export type CreateItemState = { error: string | null };

function apiUrl() {
  return process.env.API_URL ?? "http://localhost:3000";
}

export async function createItem(
  _prev: CreateItemState,
  formData: FormData,
): Promise<CreateItemState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "name is required" };
  }

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
