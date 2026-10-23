import { GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { doc, itemsTable } from "./db";

const createItemSchema = z.object({
  name: z.string("name is required").min(1, "name is required"),
});

type Item = {
  id: string;
  name: string;
};

export const itemsRoute = new Hono();

itemsRoute.get("/", async (c) => {
  const result = await doc.send(new ScanCommand({ TableName: itemsTable }));
  const items = (result.Items ?? []) as Item[];
  return c.json(items);
});

itemsRoute.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!z.uuid().safeParse(id).success) {
    return c.json({ error: "not found" }, 404);
  }

  const result = await doc.send(
    new GetCommand({ TableName: itemsTable, Key: { id } }),
  );
  if (!result.Item) {
    return c.json({ error: "not found" }, 404);
  }
  return c.json(result.Item as Item);
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
    const item: Item = { id, name };
    await doc.send(new PutCommand({ TableName: itemsTable, Item: item }));
    return c.json(item, 201);
  },
);
