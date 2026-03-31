import pino from "pino";
import { env } from "./config/env";

export const log = pino({
  level: env.LOG_LEVEL,
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty" },
});
