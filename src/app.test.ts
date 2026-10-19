import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "./app";

const { findMany, findUnique, create } = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
}));

vi.mock("./db", () => ({
  prisma: {
    item: {
      findMany,
      findUnique,
      create,
    },
  },
}));

const itemId = "11111111-1111-4111-8111-111111111111";

describe("API", () => {
  beforeEach(() => {
    findMany.mockReset();
    findUnique.mockReset();
    create.mockReset();
  });

  it("GET /health returns ok", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok!" });
  });

  it("GET /items returns items from prisma", async () => {
    const items = [{ id: itemId, name: "demo" }];
    findMany.mockResolvedValue(items);

    const response = await app.request("/items");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(items);
  });

  it("GET /items/:id returns 404 for a non-uuid", async () => {
    const response = await app.request("/items/not-a-uuid");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not found" });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("GET /items/:id returns 404 when the item is missing", async () => {
    findUnique.mockResolvedValue(null);

    const response = await app.request(`/items/${itemId}`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not found" });
  });

  it("GET /items/:id returns the item", async () => {
    const item = { id: itemId, name: "demo" };
    findUnique.mockResolvedValue(item);

    const response = await app.request(`/items/${itemId}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(item);
  });

  it("POST /items returns 400 when name is missing", async () => {
    const response = await app.request("/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "name is required" });
    expect(create).not.toHaveBeenCalled();
  });

  it("POST /items returns 400 when name is empty", async () => {
    const response = await app.request("/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "name is required" });
    expect(create).not.toHaveBeenCalled();
  });

  it("POST /items creates an item", async () => {
    create.mockImplementation(async ({ data }: { data: { id: string; name: string } }) => data);

    const response = await app.request("/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "demo" }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; name: string };
    expect(body).toEqual({ id: expect.any(String), name: "demo" });
    expect(body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(create).toHaveBeenCalledWith({
      data: { id: body.id, name: "demo" },
    });
  });
});
