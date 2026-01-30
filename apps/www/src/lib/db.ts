import { createDb } from "@terragon/shared/db";
import { env } from "@terragon/env/apps-www";

export const db = createDb(env.DATABASE_URL);
