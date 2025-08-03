/**
 * Simple logger utility for the application
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

export class Logger {
  private level: number;
  private prefix: string;

  constructor(options: LoggerOptions = {}) {
    this.level = LOG_LEVELS[options.level || 'info'];
    this.prefix = options.prefix ? `[${options.prefix}] ` : '';
  }

  debug(message: string, meta?: Record<string, any>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, any>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, any>): void {
    this.log('error', message, meta);
  }

  private log(level: LogLevel, message: string, meta?: Record<string, any>): void {
    if (LOG_LEVELS[level] < this.level) {
      return;
    }

    const timestamp = new Date().toISOString();
    const formattedMessage = `${timestamp} ${level.toUpperCase()} ${this.prefix}${message}`;
    
    if (meta) {
      console[level](formattedMessage, JSON.stringify(meta, null, 2));
    } else {
      console[level](formattedMessage);
    }
  }

  child(options: LoggerOptions): Logger {
    return new Logger({
      level: options.level || this.getLevel(),
      prefix: options.prefix ? `${this.prefix}${options.prefix}` : this.prefix
    });
  }

  private getLevel(): LogLevel {
    return Object.entries(LOG_LEVELS).find(
      ([_, value]) => value === this.level
    )?.[0] as LogLevel || 'info';
  }
}

// Export a default instance
export const logger = new Logger();
