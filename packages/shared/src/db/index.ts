import { drizzle } from "drizzle-orm/node-postgres";
import { sql, SQLWrapper } from "drizzle-orm";
import * as schema from "./schema";

export function createDb(databaseUrl: string) {
  return drizzle(databaseUrl, { schema });
}

export type DB = ReturnType<typeof createDb>;

/**
 * Helper to explain a drizzle query.
 */
export async function explainQuery<T extends SQLWrapper>(db: DB, query: T) {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  try {
    // @ts-expect-error - toSQL is not a method on SQLWrapper
    console.log(query.toSQL());
  } catch {}
  const debugResult = await db.execute(sql`EXPLAIN ${query.getSQL()}`);
  console.debug(debugResult?.rows.map((row) => row["QUERY PLAN"]).join("\n"));
}
