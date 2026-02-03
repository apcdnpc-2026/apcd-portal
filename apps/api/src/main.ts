import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

// BigInt cannot be serialized to JSON by default — this polyfill converts to Number
// Safe for fileSizeBytes which won't exceed Number.MAX_SAFE_INTEGER
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // CORS
  const appUrl = configService.get<string>('APP_URL', 'http://localhost:3000');
  const allowedOrigins = appUrl
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Security headers
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // HSTS: enforce HTTPS for 1 year in production
      hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
      // Content Security Policy
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              scriptSrc: ["'self'"],
              imgSrc: ["'self'", 'data:', 'https:'],
              connectSrc: ["'self'", 'https:'],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameSrc: ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      // Prevent MIME-type sniffing
      noSniff: true,
      // XSS filter
      xssFilter: true,
      // Prevent clickjacking
      frameguard: { action: 'deny' },
      // Referrer policy
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Global prefix
  app.setGlobalPrefix('api');

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global filters & interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger API docs (dev only)
  if (configService.get<string>('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('APCD Empanelment Portal API')
      .setDescription(
        'API for the OEM Empanelment Portal - National Productivity Council (NPC) / CPCB',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('Auth', 'Authentication & registration')
      .addTag('OEM Profile', 'OEM company profile management')
      .addTag('Applications', 'Application lifecycle management')
      .addTag('APCD Types', 'APCD master data')
      .addTag('Attachments', 'Document upload & management')
      .addTag('Verification', 'Officer document verification & queries')
      .addTag('Committee', 'Committee evaluation & scoring')
      .addTag('Field Verification', 'Field reports & site inspections')
      .addTag('Payments', 'Payment processing (Razorpay + NEFT)')
      .addTag('Certificates', 'Certificate generation & QR verification')
      .addTag('Dashboard', 'Role-specific dashboard data')
      .addTag('Admin', 'System administration')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get<number>('PORT', 3001);
  await app.listen(port);
  console.log(`APCD Portal API running on http://localhost:${port}`);
  console.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`);
  if (configService.get<string>('NODE_ENV') !== 'production') {
    console.log(`Swagger docs: http://localhost:${port}/api/docs`);
  }
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
