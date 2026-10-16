import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

type Item = {
  id: string;
  name: string;
};

const createItemSchema = z.object({
  name: z.string("name is required").min(1, "name is required"),
});

const items = new Map<string, Item>();

export const itemsRoute = new Hono();

itemsRoute.get("/", (c) => c.json(Array.from(items.values())));

itemsRoute.get("/:id", (c) => {
  const item = items.get(c.req.param("id"));
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
  (c) => {
    const { name } = c.req.valid("json");
    const id = crypto.randomUUID();
    const item: Item = { id, name };
    items.set(id, item);
    return c.json(item, 201);
  },
);
