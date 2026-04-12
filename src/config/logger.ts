import pino from "pino";
import pinoHttp from "pino-http";

import { env } from "./env";

export const logger = pino({
  name: "ebay-canada-amazon-ca-analyzer",
  level: env.NODE_ENV === "development" ? "debug" : "info",
  transport:
    env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard"
          }
        }
      : undefined
});

export const httpLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === "/health"
  }
});
