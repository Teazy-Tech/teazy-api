import { pino, type Logger } from "pino";

export type { Logger };

export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

export interface LoggerOptions {
  level?: LogLevel;
  pretty?: boolean;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const { level = "info", pretty = false } = options;

  if (!pretty) {
    return pino({ level });
  }

  return pino({
    level,
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "SYS:standard", ignore: "pid,hostname" },
    },
  });
}
