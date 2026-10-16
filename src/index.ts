import { Hono } from "hono";

type Item = {
  id: string;
  name: string;
};

const items = new Map<string, Item>();

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok!" }));

app.get("/items", (c) => c.json(Array.from(items.values())));

app.get("/items/:id", (c) => {
  const item = items.get(c.req.param("id"));
  if (!item) {
    return c.json({ error: "not found" }, 404);
  }
  return c.json(item);
});

app.post("/items", async (c) => {
  const body = await c.req.json<{ name?: string }>();
  if (!body.name || typeof body.name !== "string") {
    return c.json({ error: "name is required" }, 400);
  }
  const id = crypto.randomUUID();
  const item: Item = { id, name: body.name };
  items.set(id, item);
  return c.json(item, 201);
});

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`Listening on http://localhost:${server.port}`);
