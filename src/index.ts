import { Hono } from "hono";
import { ensureSchema } from "./db";
import { itemsRoute } from "./items";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok!" }));
app.route("/items", itemsRoute);

const port = Number(process.env.PORT ?? 3000);

await ensureSchema();

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`Listening on http://localhost:${server.port}`);
