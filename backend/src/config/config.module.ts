/**
 * Global configuration module.
 *
 * Loads `.env`, validates it (see env.validation.ts) and exposes the grouped
 * `AppConfig` object under the `APP_CONFIG` token. Imported once by AppModule;
 * because it is `@Global()`, every other module can inject the config without
 * importing anything.
 */
import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { APP_CONFIG, AppConfig, buildAppConfig } from './app-config';
import { EnvironmentVariables, validateEnv } from './env.validation';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // `.env.<NODE_ENV>` wins over `.env`, which is handy for `NODE_ENV=test`.
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
      validate: validateEnv,
    }),
  ],
  providers: [
    {
      provide: APP_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvironmentVariables, true>): AppConfig => {
        // ConfigService now holds the *validated* instance returned by validateEnv,
        // so every lookup below is guaranteed to exist and be the right type.
        const env = new EnvironmentVariables();
        for (const key of Object.keys(env) as (keyof EnvironmentVariables)[]) {
          const value = configService.get(key, { infer: true });
          if (value !== undefined) (env[key] as unknown) = value;
        }
        return buildAppConfig(env);
      },
    },
  ],
  exports: [APP_CONFIG, NestConfigModule],
})
export class ConfigModule {}
