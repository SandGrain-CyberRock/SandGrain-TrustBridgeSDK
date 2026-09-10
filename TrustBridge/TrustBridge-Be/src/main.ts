import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";

import compression = require('compression');
import helmet from 'helmet';
import hpp = require('hpp');

import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";
import { syslogLogger } from "./common/logger/syslog.logger";
import { setupSwagger } from "./common/swagger";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: syslogLogger });
  app.useGlobalFilters(new AllExceptionsFilter());

  const corsOrigins = [
    ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim()) : []),
    "http://localhost:5173"
  ];
  // Enable CORS
  app.enableCors({
    origin: [...new Set(corsOrigins)],
    credentials: true,
    methods: "*",
    allowedHeaders: "*",
  });
  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global response interceptor
  app.useGlobalInterceptors(new ResponseInterceptor());

  // API prefix
  app.setGlobalPrefix("api");
  app.set('trust proxy', 1);

  // Security middleware
  app.use(hpp());
  app.use(helmet());
  app.use(compression());

  // swagger setup
  setupSwagger(app);


  const port = process.env.PORT || 3000;
  await app.listen(port);
  syslogLogger.log(`Application running on http://localhost:${port}/api`, 'Bootstrap');
  syslogLogger.log(`Swagger docs at http://localhost:${port}/docs`, 'Bootstrap');
}

bootstrap();
