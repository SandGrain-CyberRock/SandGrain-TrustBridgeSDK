import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationUnit } from '../../entities/organization-unit.entity';
import { Tenant } from '../../entities/tenant.entity';
import { TenantUserCredential } from '../../entities/tenant-user-credential.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { SystemActivityService } from '../system-activity/system-activity.service';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(OrganizationUnit)
    private orgRepo: Repository<OrganizationUnit>,
    @InjectRepository(Tenant)
    private tenantRepo: Repository<Tenant>,
    @InjectRepository(TenantUserCredential)
    private credentialRepo: Repository<TenantUserCredential>,
    private systemActivityService: SystemActivityService,
  ) {}

  async create(createDto: CreateOrganizationDto): Promise<OrganizationUnit> {
    const org = this.orgRepo.create(createDto);
    const saved = await this.orgRepo.save(org);
    this.systemActivityService.logCreated('organization', saved.ou_id, saved.ou_name).catch(() => {});
    return saved;
  }

  async findAll(): Promise<OrganizationUnit[]> {
    return this.orgRepo.find({
      relations: ['tenants'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number): Promise<OrganizationUnit> {
    const org = await this.orgRepo.findOne({
      where: { ou_id: id },
      relations: ['tenants'],
    });
    if (!org) {
      throw new NotFoundException(`Organization with ID ${id} not found`);
    }
    return org;
  }

  async update(
    id: number,
    updateDto: UpdateOrganizationDto,
  ): Promise<OrganizationUnit> {
    const org = await this.findOne(id);
    Object.assign(org, updateDto);
    const saved = await this.orgRepo.save(org);
    this.systemActivityService.logUpdated('organization', saved.ou_id, saved.ou_name).catch(() => {});
    return saved;
  }

  async remove(id: number): Promise<void> {
    const org = await this.findOne(id);
    await this.orgRepo.remove(org);
    this.systemActivityService.logDeleted('organization', id, org.ou_name).catch(() => {});
  }

  async addTenant(orgId: number, dto: CreateTenantDto): Promise<Tenant> {
    await this.findOne(orgId); // ensure org exists

    const existing = await this.tenantRepo.findOneBy({
      tenant_id: dto.tenant_id,
    });
    if (existing) {
      throw new ConflictException(
        `Tenant with ID ${dto.tenant_id} already exists`,
      );
    }

    const tenant = this.tenantRepo.create({
      tenant_id: dto.tenant_id,
      ou_id: orgId,
      tenant_status: dto.tenant_status || 'ACTIVE',
      credentials_configured: true,
    });
    await this.tenantRepo.save(tenant);

    const credential = this.credentialRepo.create({
      tenant_id: dto.tenant_id,
      tenant_user_id: dto.tenant_user_id,
      email: dto.email,
      password: dto.password,
      cf_access_client_id: dto.cf_access_client_id,
      cf_access_client_secret: dto.cf_access_client_secret,
    });
    await this.credentialRepo.save(credential);

    return tenant;
  }

  async findTenants(orgId: number): Promise<Tenant[]> {
    await this.findOne(orgId);
    return this.tenantRepo.find({
      where: { ou_id: orgId },
      order: { created_at: 'DESC' },
    });
  }

  async removeTenant(orgId: number, tenantId: string): Promise<void> {
    await this.findOne(orgId);
    const tenant = await this.tenantRepo.findOneBy({
      tenant_id: tenantId,
      ou_id: orgId,
    });
    if (!tenant) {
      throw new NotFoundException(
        `Tenant ${tenantId} not found in organization ${orgId}`,
      );
    }

    // Remove credentials first
    await this.credentialRepo.delete({ tenant_id: tenantId });
    await this.tenantRepo.remove(tenant);
  }
}
