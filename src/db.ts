import { SQL } from "bun";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

export const sql = new SQL(databaseUrl);

export async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS items (
      id uuid PRIMARY KEY,
      name text NOT NULL
    )
  `;
}
