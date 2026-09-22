import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { correlationIdMiddleware } from './common/correlation-id.middleware/correlation-id.middleware';
import {
  HttpExceptionFilter,
  validationFailed,
} from './common/http-exception.filter/http-exception.filter';
import { buildLogger, LoggingInterceptor } from './common/logging.interceptor/logging.interceptor';

export function configureApp(app: INestApplication): INestApplication {
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { 'default-src': ["'none'"], 'frame-ancestors': ["'none'"] },
      },
      hsts: process.env.NODE_ENV === 'production',
    }),
  );
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:8080')
      .split(',')
      .map((origin) => origin.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: false,
    exposedHeaders: ['X-Correlation-Id'],
    maxAge: 3600,
  });
  app.use(correlationIdMiddleware);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationFailed,
    }),
  );
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  return app;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: buildLogger() });
  configureApp(app);
  await app.listen(3000);
}

if (require.main === module) {
  void bootstrap();
}
