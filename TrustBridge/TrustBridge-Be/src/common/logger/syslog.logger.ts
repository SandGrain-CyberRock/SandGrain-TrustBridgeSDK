import { LoggerService } from '@nestjs/common';
import * as winston from 'winston';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const FACILITY_LOCAL0 = 16;

const SEVERITY: Record<string, number> = {
  error: 3,
  warn: 4,
  log: 6,
  debug: 7,
  verbose: 7,
};

function escapeSDValue(v: string): string {
  return String(v)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/]/g, '\\]');
}

function buildRFC5424(
  level: string,
  message: string,
  context = '-',
  meta?: Record<string, string>,
): string {
  const pri = FACILITY_LOCAL0 * 8 + (SEVERITY[level] ?? 6);
  const ts = new Date().toISOString();
  const host = os.hostname();
  const sd = meta && Object.keys(meta).length
    ? `[trustbridge@32473 ${Object.entries(meta)
        .map(([k, v]) => `${k}="${escapeSDValue(v)}"`)
        .join(' ')}]`
    : '-';
  return `<${pri}>1 ${ts} ${host} trustbridge-be ${process.pid} ${context} ${sd} ${message}`;
}

class SyslogLoggerService implements LoggerService {
  readonly winston: winston.Logger;

  constructor() {
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

    this.winston = winston.createLogger({
      transports: [
        new winston.transports.Console({
          format: winston.format.printf((info) => info.message as string),
        }),
        new winston.transports.File({
          filename: path.join(logsDir, 'system.log'),
          format: winston.format.printf((info) => info.message as string),
        }),
      ],
    });
  }

  log(message: any, context?: string) {
    this.emit('log', message, context);
  }

  error(message: any, trace?: string, context?: string) {
    const meta = trace ? { trace: String(trace).slice(0, 500) } : undefined;
    this.emit('error', message, context, meta);
  }

  warn(message: any, context?: string) {
    this.emit('warn', message, context);
  }

  debug(message: any, context?: string) {
    this.emit('debug', message, context);
  }

  verbose(message: any, context?: string) {
    this.emit('verbose', message, context);
  }

  http(message: string, level: 'log' | 'warn' | 'error', meta?: Record<string, string>) {
    this.emit(level, message, 'HTTP', meta);
  }

  private emit(level: string, message: any, context?: string, meta?: Record<string, string>) {
    const line = buildRFC5424(level, String(message), context ?? '-', meta);
    const winstonLevel = level === 'log' ? 'info' : level;
    (this.winston as any)[winstonLevel]?.(line) ?? this.winston.info(line);
  }
}

export const syslogLogger = new SyslogLoggerService();
