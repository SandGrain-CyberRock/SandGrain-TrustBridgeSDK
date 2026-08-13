import {
  ConflictException,
  Injectable,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

import { In, IsNull, Not, Repository } from "typeorm";

import { CreateDeviceProfileDto } from "./dto/create-device-profile.dto";
import { UpdateDeviceProfileDto } from "./dto/update-device-profile.dto";
import { DeviceProfile } from "../../entities/device-profile.entity";
import { Tag } from "../../entities/tag.entity";
import { SystemActivityService } from "../system-activity/system-activity.service";

@Injectable()
export class DeviceProfileService {
  private readonly logger = new Logger(DeviceProfileService.name);
  constructor(
    @InjectRepository(DeviceProfile)
    private profileRepo: Repository<DeviceProfile>,
    @InjectRepository(Tag)
    private tagRepo: Repository<Tag>,
    private systemActivityService: SystemActivityService,
  ) { }

  async create(
    dto: CreateDeviceProfileDto,
    ouId: number,
  ): Promise<DeviceProfile> {
    try {
      this.logger.log("START::DeviceProfileService::create", dto, ouId);
      // Step 1: Check for duplicate device profile name
      const existing = await this.profileRepo.findOne({
        where: { profile_name: dto.profile_name, ou_id: ouId, deleted_at: IsNull() }
      });
      if (existing) throw new ConflictException(`Device profile '${dto.profile_name}' already exists`);

      // Step 2: Check if default profile is already set
      if (dto.is_default) {
        await this.profileRepo.update({ is_default: true, ou_id: ouId }, { is_default: false });
      }


      // Step 3. Extract and map relationships using a clean ternary operator
      const { tag_ids, ...profileData } = dto;
      const profile = this.profileRepo.create({ ...profileData, ou_id: ouId });
      profile.tags = tag_ids?.length ? await this.tagRepo.findBy({ tag_id: In(tag_ids) }) : [];


      // Step 4: Save the profile and log the activity
      try {
        const saved = await this.profileRepo.save(profile);
        this.systemActivityService.logCreated("device_profile", saved.profile_id, saved.profile_name).catch(() => { });
        this.logger.log("SUCCESS::DeviceProfileService::create", dto, ouId);
        return saved;
      } catch (error: any) {
        this.logger.error("ERROR::DeviceProfileService::create", error, dto, ouId);
        if (
          error.code === "ER_DUP_ENTRY" ||
          error.message?.includes("Duplicate entry")
        ) {
          throw new ConflictException(
            `Device profile '${dto.profile_name}' already exists`,
          );
        }
        throw error;
      }
    } catch (error) {
      this.logger.error("ERROR::DeviceProfileService::create", error, dto, ouId);
      throw error;
    }
  }

  async findAll(
    ouId: number,
    page: number = 1,
    limit: number = 10,
    search?: string,
    status?: string,
  ): Promise<{
    data: DeviceProfile[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      this.logger.log("START::DeviceProfileService::findAll", ouId, page, limit, search, status);
      const skip = (page - 1) * limit;

      const qb = this.profileRepo
        .createQueryBuilder("profile")
        .leftJoinAndSelect("profile.category", "category")
        .leftJoinAndSelect("profile.subCategory", "subCategory")
        .leftJoinAndSelect("profile.tags", "tags")
        .leftJoinAndSelect("profile.profileParam", "profileParam")
        .where("profile.ou_id = :ouId", { ouId })
        .orderBy("profile.created_at", "DESC")
        .skip(skip)
        .take(limit);

      if (search) {
        qb.andWhere("profile.profile_name LIKE :search", {
          search: `%${search}%`,
        });
      }

      if (status) {
        qb.andWhere("profile.status = :status", { status });
      }

      const [data, total] = await qb.getManyAndCount();
      this.logger.log("SUCCESS::DeviceProfileService::findAll", ouId, page, limit, search, status);
      return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error("ERROR::DeviceProfileService::findAll", error, ouId, page, limit, search, status);
      throw error;
    }
  }

  async findOne(id: number, ouId: number): Promise<DeviceProfile> {
    try {
      this.logger.log("START::DeviceProfileService::findOne", id, ouId);
      const profile = await this.profileRepo.findOne({
        where: { profile_id: id, ou_id: ouId },
        relations: ["category", "subCategory", "tags", "profileParam"],
      });
      if (!profile) throw new NotFoundException(`Device profile #${id} not found`);
      this.logger.log("SUCCESS::DeviceProfileService::findOne", id, ouId);
      return profile;
    } catch (error) {
      this.logger.error("ERROR::DeviceProfileService::findOne", error, id, ouId);
      throw error;
    }
  }

  async update(
    id: number,
    dto: UpdateDeviceProfileDto,
    ouId: number,
  ): Promise<DeviceProfile> {
    try {
      this.logger.log("START::DeviceProfileService::update", id, dto, ouId);
      const profile = await this.findOne(id, ouId);

      // Step 1: Check for duplicate device profile name
      if (dto.profile_name && dto.profile_name !== profile.profile_name) {
        const existing = await this.profileRepo.findOne({
          where: { profile_name: dto.profile_name, ou_id: ouId, profile_id: Not(id), deleted_at: IsNull() }
        });
        if (existing) throw new ConflictException(`Device profile '${dto.profile_name}' already exists`);
      }



      // Step 2: Check if default profile is already set
      // TODO: looks suspicious, verify this
      if (dto.is_default) {
        await this.profileRepo
          .createQueryBuilder()
          .update(DeviceProfile)
          .set({ is_default: false })
          .where("profile_id != :id AND ou_id = :ouId", { id, ouId })
          .execute();
      }

      // Step 3: Extract and map relationships using a clean ternary operator
      const { tag_ids, ...profileData } = dto;
      Object.assign(profile, profileData);

      if (tag_ids !== undefined) {
        profile.tags = tag_ids.length ? await this.tagRepo.findBy({ tag_id: In(tag_ids) }) : [];
      }


      // Step 4: Save the profile and log the activity
      try {
        const saved = await this.profileRepo.save(profile);
        this.systemActivityService.logUpdated("device_profile", saved.profile_id, saved.profile_name).catch(() => { });
        this.logger.log("SUCCESS::DeviceProfileService::update", id, dto, ouId);
        return saved;
      } catch (error: any) {
        this.logger.error("ERROR::DeviceProfileService::update", error, id, dto, ouId);
        if (
          error.code === "ER_DUP_ENTRY" ||
          error.message?.includes("Duplicate entry")
        ) {
          throw new ConflictException(
            `Device profile '${dto.profile_name || profile.profile_name}' already exists`,
          );
        }
        throw error;
      }
    } catch (error) {
      this.logger.error("ERROR::DeviceProfileService::update", error, id, dto, ouId);
      throw error;
    }
  }

  async remove(id: number, ouId: number): Promise<void> {
    try {
      this.logger.log("START::DeviceProfileService::remove", id, ouId);
      const profile = await this.findOne(id, ouId);
      await this.profileRepo.softRemove(profile);
      this.systemActivityService.logDeleted("device_profile", id, profile.profile_name).catch(() => { });
      this.logger.log("SUCCESS::DeviceProfileService::remove", id, ouId);
    } catch (error) {
      this.logger.error("ERROR::DeviceProfileService::remove", error, id, ouId);
      throw error;
    }
  }
}