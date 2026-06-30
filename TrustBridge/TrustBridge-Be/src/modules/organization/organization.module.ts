import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationService } from './organization.service';
import { OrganizationController } from './organization.controller';
import { OrganizationUnit } from '../../entities/organization-unit.entity';
import { Tenant } from '../../entities/tenant.entity';
import { TenantUserCredential } from '../../entities/tenant-user-credential.entity';
import { SystemActivityModule } from '../system-activity/system-activity.module';

@Module({
  imports: [TypeOrmModule.forFeature([OrganizationUnit, Tenant, TenantUserCredential]), SystemActivityModule],
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrganizationModule {}
