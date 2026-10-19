import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "./db";

const createItemSchema = z.object({
  name: z.string("name is required").min(1, "name is required"),
});

export const itemsRoute = new Hono();

itemsRoute.get("/", async (c) => {
  const items = await prisma.item.findMany();
  return c.json(items);
});

itemsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!z.uuid().safeParse(id).success) {
    return c.json({ error: "not found" }, 404);
  }

  const item = await prisma.item.findUnique({ where: { id } });
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
    const item = await prisma.item.create({ data: { id, name } });
    return c.json(item, 201);
  },
);
