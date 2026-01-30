export type LogLevel = "info" | "error" | "warn" | "debug";
export type OutputFormat = "text" | "json";

export type LogData = Record<string, unknown>;

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: LogData;
}

export class Logger {
  private outputFormat: OutputFormat;

  constructor(outputFormat: OutputFormat = "text") {
    this.outputFormat = outputFormat;
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    data?: LogData,
  ): string {
    if (this.outputFormat === "text") {
      const parts = [message];
      for (const [k, v] of Object.entries(data || {})) {
        parts.push(`${k}: ${v}`);
      }
      return parts.join(" ");
    }
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(data && { data }),
    };
    return JSON.stringify(logEntry);
  }

  info(message: string, data?: LogData): void {
    console.log(this.formatMessage("info", message, data));
  }

  error(message: string, data?: LogData): void {
    console.error(this.formatMessage("error", message, data));
  }

  warn(message: string, data?: LogData): void {
    console.warn(this.formatMessage("warn", message, data));
  }

  debug(message: string, data?: LogData): void {
    console.log(this.formatMessage("debug", message, data));
  }

  log(level: LogLevel, message: string, data?: LogData): void {
    switch (level) {
      case "info":
        this.info(message, data);
        break;
      case "error":
        this.error(message, data);
        break;
      case "warn":
        this.warn(message, data);
        break;
      case "debug":
        this.debug(message, data);
        break;
    }
  }
}
