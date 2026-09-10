import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CyberRockModule } from 'src/common/cyberRock/cyberRock.module';

import { TenantApiController } from './tenant-api.controller';
import { TenantApiService } from './tenant-api.service';
import { TenantUserCredential } from '../../entities/tenant-user-credential.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantUserCredential]),
    HttpModule,
    CyberRockModule,
  ],
  controllers: [TenantApiController],
  providers: [TenantApiService],
  exports: [TenantApiService],
})
export class TenantApiModule { }
