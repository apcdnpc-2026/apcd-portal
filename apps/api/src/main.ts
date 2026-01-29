import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // CORS — must be before helmet so preflight OPTIONS requests get proper headers
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

  // Security — after CORS to avoid interfering with preflight
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
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

  const port = configService.get<number>('PORT', 4000);
  await app.listen(port);
  console.warn(`APCD Portal API running on http://localhost:${port}`);
  console.warn(`CORS allowed origins: ${allowedOrigins.join(', ')}`);
  console.warn(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
