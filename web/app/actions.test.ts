import { beforeEach, describe, expect, it, vi } from "vitest";
import { createItem } from "./actions";

const { revalidatePath } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

function formData(name?: string) {
  const data = new FormData();
  if (name !== undefined) data.set("name", name);
  return data;
}

describe("createItem", () => {
  beforeEach(() => {
    delete process.env.API_URL;
    revalidatePath.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns name is required when name is missing", async () => {
    const result = await createItem({ error: null }, formData());

    expect(result).toEqual({ error: "name is required" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns name is required when name is blank", async () => {
    const result = await createItem({ error: null }, formData("  "));

    expect(result).toEqual({ error: "name is required" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns api request failed when fetch throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network"));

    const result = await createItem({ error: null }, formData("demo"));

    expect(result).toEqual({ error: "api request failed" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns the api error when the response is not ok", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "nope" }), { status: 400 }),
    );

    const result = await createItem({ error: null }, formData("demo"));

    expect(result).toEqual({ error: "nope" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns api request failed when the error body is not json", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("nope", { status: 500 }));

    const result = await createItem({ error: null }, formData("demo"));

    expect(result).toEqual({ error: "api request failed" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("posts the trimmed name and revalidates", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 201 }));

    const result = await createItem({ error: null }, formData("  demo  "));

    expect(result).toEqual({ error: null });
    expect(fetch).toHaveBeenCalledWith("http://localhost:3000/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "demo" }),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });
});
