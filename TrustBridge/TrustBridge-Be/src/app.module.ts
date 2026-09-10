import { BullModule } from '@nestjs/bullmq';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RedisModule } from '@nestjs-modules/ioredis';

import { JwtAuthGuard } from './common/guards';
import { HealthModule } from './common/health/health.module';
import { HttpLoggerMiddleware } from './common/middleware/http-logger.middleware';
import { QueuesModule } from './common/queue/auth/queues.module';
import { TraceLogModule } from './common/trace-logs/trace-log.module';
import { dbConfig } from './config/database.config';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DeviceModule } from './modules/device/device.module';
import { DeviceGroupModule } from './modules/device-group/device-group.module';
import { DeviceProfileModule } from './modules/device-profile/device-profile.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { PermissionModule } from './modules/permission/permission.module';
import { ProfileDefaultParamModule } from './modules/profile-default-param/profile-default-param.module';
import { RoleModule } from './modules/role/role.module';
import { SystemActivityModule } from './modules/system-activity/system-activity.module';
import { TenantApiModule } from './modules/tenant-api/tenant-api.module';
import { UserModule } from './modules/user/user.module';



@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 350,
      },
    ]),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    RedisModule.forRoot({
      type: "single",
      options: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    TypeOrmModule.forRoot(dbConfig),
    QueuesModule,
    AuthModule,
    OrganizationModule,
    UserModule,
    RoleModule,
    PermissionModule,
    TenantApiModule,
    DeviceModule,
    DeviceGroupModule,
    SystemActivityModule,
    DashboardModule,
    MasterDataModule,
    ProfileDefaultParamModule,
    DeviceProfileModule,
    TraceLogModule,
    HealthModule
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Global JWT Auth Guard - all routes protected by default
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpLoggerMiddleware).forRoutes('*');
  }
}
