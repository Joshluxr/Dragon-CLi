import { envsafe, str } from "envsafe";
import {
  devDefaultDatabaseUrl,
  devDefaultInternalSharedSecret,
} from "./common";

export const env = envsafe({
  DATABASE_URL: str({
    devDefault: devDefaultDatabaseUrl,
  }),
  INTERNAL_SHARED_SECRET: str({
    devDefault: devDefaultInternalSharedSecret,
  }),
});
