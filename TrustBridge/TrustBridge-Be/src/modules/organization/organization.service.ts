import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
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
  private readonly logger = new Logger(OrganizationService.name);
  constructor(
    @InjectRepository(OrganizationUnit)
    private orgRepo: Repository<OrganizationUnit>,
    @InjectRepository(Tenant)
    private tenantRepo: Repository<Tenant>,
    @InjectRepository(TenantUserCredential)
    private credentialRepo: Repository<TenantUserCredential>,
    private systemActivityService: SystemActivityService,
  ) { }

  async create(createDto: CreateOrganizationDto): Promise<OrganizationUnit> {
    try {
      this.logger.log("START::OrganizationService::create", createDto);
      const org = this.orgRepo.create(createDto);
      const saved = await this.orgRepo.save(org);
      this.systemActivityService.logCreated('organization', saved.ou_id, saved.ou_name).catch(() => { });
      this.logger.log("SUCCESS::OrganizationService::create", createDto);
      return saved;
    } catch (error) {
      this.logger.error("ERROR::OrganizationService::create", error, createDto);
      throw error;
    }
  }


  async findAll(): Promise<OrganizationUnit[]> {
    try {
      this.logger.log("START::OrganizationService::findAll");
      const data = await this.orgRepo.find({
        relations: ['tenants'],
        order: { created_at: 'DESC' },
      });
      this.logger.log("SUCCESS::OrganizationService::findAll");
      return data;
    } catch (error) {
      this.logger.error("ERROR::OrganizationService::findAll", error);
      throw error;
    }
  }


  async findOne(id: number): Promise<OrganizationUnit> {
    try {
      this.logger.log("START::OrganizationService::findOne", id);
      const org = await this.orgRepo.findOne({
        where: { ou_id: id },
        relations: ['tenants'],
      });
      if (!org) {
        this.logger.error("ERROR::OrganizationService::findOne", "Organization not found", id);
        throw new NotFoundException(`Organization with ID ${id} not found`);
      }
      this.logger.log("SUCCESS::OrganizationService::findOne", id);
      return org;
    } catch (error) {
      this.logger.error("ERROR::OrganizationService::findOne", error, id);
      throw error;
    }
  }

  async update(
    id: number,
    updateDto: UpdateOrganizationDto,
  ): Promise<OrganizationUnit> {
    try {
      this.logger.log("START::OrganizationService::update", id, updateDto);
      const org = await this.findOne(id);
      Object.assign(org, updateDto);
      const saved = await this.orgRepo.save(org);
      this.systemActivityService.logUpdated('organization', saved.ou_id, saved.ou_name).catch(() => { });
      this.logger.log("SUCCESS::OrganizationService::update", id, updateDto);
      return saved;
    } catch (error) {
      this.logger.error("ERROR::OrganizationService::update", error, id, updateDto);
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    try {
      this.logger.log("START::OrganizationService::remove", id);
      const org = await this.findOne(id);
      await this.orgRepo.remove(org);
      this.systemActivityService.logDeleted('organization', id, org.ou_name).catch(() => { });
      this.logger.log("SUCCESS::OrganizationService::remove", id);
    } catch (error) {
      this.logger.error("ERROR::OrganizationService::remove", error, id);
      throw error;
    }
  }

  async addTenant(orgId: number, dto: CreateTenantDto): Promise<Tenant> {
    try {

      this.logger.log("START::OrganizationService::addTenant", orgId, dto);

      await this.findOne(orgId); // ensure org exists

      const existing = await this.tenantRepo.findOneBy({
        tenant_id: dto.tenant_id,
      });
      if (existing) {
        this.logger.error("ERROR::OrganizationService::addTenant", "Tenant already exists", orgId, dto);
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

      this.logger.log("SUCCESS::OrganizationService::addTenant", orgId, dto);

      return tenant;
    } catch (error) {
      this.logger.error("ERROR::OrganizationService::addTenant", error, orgId, dto);
      throw error;
    }
  }

  async findTenants(orgId: number): Promise<Tenant[]> {
    try {
      this.logger.log("START::OrganizationService::findTenants", orgId);
      await this.findOne(orgId);
      return this.tenantRepo.find({
        where: { ou_id: orgId },
        order: { created_at: 'DESC' },
      });
    } catch (error) {
      this.logger.error("ERROR::OrganizationService::findTenants", error, orgId);
      throw error;
    }
  }

  async removeTenant(orgId: number, tenantId: string): Promise<void> {

    try {
      this.logger.log("START::OrganizationService::removeTenant", orgId, tenantId);

      await this.findOne(orgId);
      const tenant = await this.tenantRepo.findOneBy({
        tenant_id: tenantId,
        ou_id: orgId,
      });
      if (!tenant) {
        this.logger.error("ERROR::OrganizationService::removeTenant", "Tenant not found", orgId, tenantId);
        throw new NotFoundException(
          `Tenant ${tenantId} not found in organization ${orgId}`,
        );
      }

      // Remove credentials first
      await this.credentialRepo.delete({ tenant_id: tenantId });
      await this.tenantRepo.remove(tenant);
      this.logger.log("SUCCESS::OrganizationService::removeTenant", orgId, tenantId);
    } catch (error) {
      this.logger.error("ERROR::OrganizationService::removeTenant", error, orgId, tenantId);
      throw error;
    }
  }
}
