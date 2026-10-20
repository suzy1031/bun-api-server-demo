import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "./app";

const { send } = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("./db", () => ({
  doc: { send },
  itemsTable: "items",
}));

const itemId = "11111111-1111-4111-8111-111111111111";

describe("API", () => {
  beforeEach(() => {
    send.mockReset();
  });

  it("GET /health returns ok", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok!" });
  });

  it("GET /items returns items from DynamoDB", async () => {
    const items = [{ id: itemId, name: "demo" }];
    send.mockResolvedValue({ Items: items });

    const response = await app.request("/items");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(items);
    expect(send.mock.calls[0]?.[0].input).toEqual({ TableName: "items" });
  });

  it("GET /items/:id returns 404 for a non-uuid", async () => {
    const response = await app.request("/items/not-a-uuid");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not found" });
    expect(send).not.toHaveBeenCalled();
  });

  it("GET /items/:id returns 404 when the item is missing", async () => {
    send.mockResolvedValue({});

    const response = await app.request(`/items/${itemId}`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not found" });
  });

  it("GET /items/:id returns the item", async () => {
    const item = { id: itemId, name: "demo" };
    send.mockResolvedValue({ Item: item });

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
    expect(send).not.toHaveBeenCalled();
  });

  it("POST /items returns 400 when name is empty", async () => {
    const response = await app.request("/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "name is required" });
    expect(send).not.toHaveBeenCalled();
  });

  it("POST /items creates an item", async () => {
    send.mockResolvedValue({});

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
    expect(send.mock.calls[0]?.[0].input).toEqual({
      TableName: "items",
      Item: { id: body.id, name: "demo" },
    });
  });
});
