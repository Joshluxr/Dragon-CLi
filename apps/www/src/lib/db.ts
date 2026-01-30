import { createDb } from "@dragon/shared/db";
import { env } from "@dragon/env/apps-www";

export const db = createDb(env.DATABASE_URL);
