import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { HttpLoggerMiddleware } from './common/middleware/http-logger.middleware';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dbConfig } from './config/database.config';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { UserModule } from './modules/user/user.module';
import { RoleModule } from './modules/role/role.module';
import { PermissionModule } from './modules/permission/permission.module';
import { TenantApiModule } from './modules/tenant-api/tenant-api.module';
import { DeviceModule } from './modules/device/device.module';
import { DeviceGroupModule } from './modules/device-group/device-group.module';
import { SystemActivityModule } from './modules/system-activity/system-activity.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { ProfileDefaultParamModule } from './modules/profile-default-param/profile-default-param.module';
import { DeviceProfileModule } from './modules/device-profile/device-profile.module';
import { DiscoverModule } from './modules/discover/discover.module';
import { JwtAuthGuard } from './common/guards';

@Module({
  imports: [
    TypeOrmModule.forRoot(dbConfig),
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
    DiscoverModule,
  ],
  controllers: [],
  providers: [
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
