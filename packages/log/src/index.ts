/**
 * Structured JSON logging to stdout (plan §9).
 *
 * Writes to the stream directly rather than through `console`, which is also why
 * `no-console` can stay on as a lint error everywhere else: a bare
 * `console.log(url)` is the single easiest way to leak a calendar URL, and
 * calendar URLs are credentials (CLAUDE.md).
 *
 * There is no `redact` helper here on purpose. A redactor implies it is safe to
 * pass secrets to the logger and let it strip them, and that is the wrong habit.
 * Secrets do not reach this module. Log an id and an outcome.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, string | number | boolean | null | undefined>;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function configuredLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function write(level: LogLevel, service: string, msg: string, fields?: LogFields): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[configuredLevel()]) return;

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    service,
    msg,
    ...fields,
  });

  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(line + "\n");
}

export type Logger = {
  [K in LogLevel]: (msg: string, fields?: LogFields) => void;
} & {
  child: (service: string) => Logger;
};

export function createLogger(service: string): Logger {
  return {
    debug: (msg, fields) => write("debug", service, msg, fields),
    info: (msg, fields) => write("info", service, msg, fields),
    warn: (msg, fields) => write("warn", service, msg, fields),
    error: (msg, fields) => write("error", service, msg, fields),
    child: (sub: string) => createLogger(`${service}.${sub}`),
  };
}
