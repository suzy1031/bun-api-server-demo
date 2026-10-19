import { Hono } from "hono";
import { itemsRoute } from "./items";

export const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok!" }));
app.route("/items", itemsRoute);
