/**
 * Process entry point.
 *
 * Boots Nest, applies the cross-cutting HTTP concerns (helmet, compression, CORS,
 * URI versioning under /api/v1, Swagger at /docs) and starts listening. Anything
 * that must also apply to unit tests belongs in AppModule, not here — but e2e
 * tests call `configureApp()` so they exercise the same pipeline as production.
 */
import { INestApplication, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { APP_CONFIG, AppConfig } from './config/app-config';

/** Everything that turns a bare Nest app into the EduTrack API. Shared with the e2e tests. */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(compression());

  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    // X-Tenant carries the institute code on unauthenticated requests.
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant', 'X-Request-Id', 'Accept'],
    exposedHeaders: ['X-Request-Id'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86_400,
  });

  // /api/v1/… for the API; /health stays unprefixed for probes (the controller is
  // version-neutral, see health.controller.ts).
  app.setGlobalPrefix('api', { exclude: ['health', 'health/live', 'health/ready'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.enableShutdownHooks();
}

function setupSwagger(app: INestApplication, config: AppConfig): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('EduTrack API')
      .setDescription(
        [
          'Multi-tenant API for tuition centres and coaching institutes.',
          '',
          'Every request carries the tenant twice: the `X-Tenant` institute code header',
          '(used before sign-in) and the tenant claim inside the bearer token (authoritative).',
          'Errors always look like `{ statusCode, message, code, details? }`.',
        ].join('\n'),
      )
      .setVersion('1.0')
      .addServer(`${config.appUrl}/api/v1`, 'This server')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
      .addGlobalParameters({
        name: 'X-Tenant',
        in: 'header',
        required: false,
        description: 'Institute code, e.g. APEX. Required on unauthenticated routes.',
        schema: { type: 'string' },
      })
      .build(),
  );
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'EduTrack API docs',
  });
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get<AppConfig>(APP_CONFIG);
  configureApp(app, config);

  // Behind a load balancer, trust one proxy hop so rate limiting sees real client IPs.
  app.set('trust proxy', config.isProduction ? 1 : false);

  if (config.swaggerEnabled) setupSwagger(app, config);

  await app.listen(config.port, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(`EduTrack API listening on ${config.appUrl} (env: ${config.env})`);
  if (config.swaggerEnabled) logger.log(`API documentation: ${config.appUrl}/docs`);
}

// Only start a server when this file is the process entry point. The e2e tests
// import `configureApp` from here and build their own application instance.
if (require.main === module) void bootstrap();
