import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { syslogLogger } from '../logger/syslog.logger';

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip } = req;
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      const level: 'error' | 'warn' | 'log' =
        status >= 500 ? 'error' : status >= 400 ? 'warn' : 'log';

      syslogLogger.http(
        `${method} ${originalUrl} ${status} ${duration}ms`,
        level,
        {
          method,
          url: originalUrl,
          status: String(status),
          duration: `${duration}ms`,
          ip: ip ?? '-',
        },
      );
    });

    next();
  }
}
