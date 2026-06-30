import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { TenantApiService } from './tenant-api.service';
import { TenantApiController } from './tenant-api.controller';
import { TenantUserCredential } from '../../entities/tenant-user-credential.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantUserCredential]),
    HttpModule,
  ],
  controllers: [TenantApiController],
  providers: [TenantApiService],
  exports: [TenantApiService],
})
export class TenantApiModule {}
