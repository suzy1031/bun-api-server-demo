import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { sql } from "./db";

type Item = {
  id: string;
  name: string;
};

const createItemSchema = z.object({
  name: z.string("name is required").min(1, "name is required"),
});

export const itemsRoute = new Hono();

itemsRoute.get("/", async (c) => {
  const items = await sql<Item[]>`SELECT id, name FROM items`;
  return c.json(items);
});

itemsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!z.uuid().safeParse(id).success) {
    return c.json({ error: "not found" }, 404);
  }

  const [item] = await sql<Item[]>`
    SELECT id, name FROM items WHERE id = ${id}
  `;
  if (!item) {
    return c.json({ error: "not found" }, 404);
  }
  return c.json(item);
});

itemsRoute.post(
  "/",
  zValidator("json", createItemSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { error: result.error.issues[0]?.message ?? "invalid request" },
        400,
      );
    }
  }),
  async (c) => {
    const { name } = c.req.valid("json");
    const id = crypto.randomUUID();
    const [item] = await sql<Item[]>`
      INSERT INTO items (id, name)
      VALUES (${id}, ${name})
      RETURNING id, name
    `;
    return c.json(item, 201);
  },
);
