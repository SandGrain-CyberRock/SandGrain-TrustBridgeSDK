import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { DeviceProfile } from "../../entities/device-profile.entity";
import { Tag } from "../../entities/tag.entity";
import { CreateDeviceProfileDto } from "./dto/create-device-profile.dto";
import { UpdateDeviceProfileDto } from "./dto/update-device-profile.dto";
import { SystemActivityService } from "../system-activity/system-activity.service";

@Injectable()
export class DeviceProfileService {
  constructor(
    @InjectRepository(DeviceProfile)
    private profileRepo: Repository<DeviceProfile>,
    @InjectRepository(Tag)
    private tagRepo: Repository<Tag>,
    private systemActivityService: SystemActivityService,
  ) {}

  async create(
    dto: CreateDeviceProfileDto,
    ouId: number,
  ): Promise<DeviceProfile> {
    const existing = await this.profileRepo
      .createQueryBuilder("profile")
      .where("profile.profile_name = :name", { name: dto.profile_name })
      .andWhere("profile.ou_id = :ouId", { ouId })
      .andWhere("profile.deleted_at IS NULL")
      .getOne();
    if (existing) {
      throw new ConflictException(
        `Device profile '${dto.profile_name}' already exists`,
      );
    }

    if (dto.is_default) {
      await this.profileRepo
        .createQueryBuilder()
        .update()
        .set({ is_default: false })
        .where("is_default = true")
        .execute();
    }

    const { tag_ids, ...profileData } = dto;
    const profile = this.profileRepo.create({ ...profileData, ou_id: ouId });

    if (tag_ids && tag_ids.length > 0) {
      profile.tags = await this.tagRepo.findBy({ tag_id: In(tag_ids) });
    } else {
      profile.tags = [];
    }

    try {
      const saved = await this.profileRepo.save(profile);
      this.systemActivityService.logCreated("device_profile", saved.profile_id, saved.profile_name).catch(() => {});
      return saved;
    } catch (error: any) {
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
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: number, ouId: number): Promise<DeviceProfile> {
    const profile = await this.profileRepo.findOne({
      where: { profile_id: id, ou_id: ouId },
      relations: ["category", "subCategory", "tags", "profileParam"],
    });
    if (!profile) {
      throw new NotFoundException(`Device profile #${id} not found`);
    }
    return profile;
  }

  async update(
    id: number,
    dto: UpdateDeviceProfileDto,
    ouId: number,
  ): Promise<DeviceProfile> {
    const profile = await this.findOne(id, ouId);

    if (dto.profile_name && dto.profile_name !== profile.profile_name) {
      const existing = await this.profileRepo
        .createQueryBuilder("profile")
        .where("profile.profile_name = :name", { name: dto.profile_name })
        .andWhere("profile.ou_id = :ouId", { ouId })
        .andWhere("profile.profile_id != :id", { id })
        .andWhere("profile.deleted_at IS NULL")
        .getOne();
      if (existing) {
        throw new ConflictException(
          `Device profile '${dto.profile_name}' already exists`,
        );
      }
    }

    if (dto.is_default) {
      await this.profileRepo
        .createQueryBuilder()
        .update()
        .set({ is_default: false })
        .where("profile_id != :id", { id })
        .execute();
    }

    const { tag_ids, ...profileData } = dto;
    Object.assign(profile, profileData);

    if (tag_ids !== undefined) {
      profile.tags =
        tag_ids.length > 0
          ? await this.tagRepo.findBy({ tag_id: In(tag_ids) })
          : [];
    }

    try {
      const saved = await this.profileRepo.save(profile);
      this.systemActivityService.logUpdated("device_profile", saved.profile_id, saved.profile_name).catch(() => {});
      return saved;
    } catch (error: any) {
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
  }

  async remove(id: number, ouId: number): Promise<void> {
    const profile = await this.findOne(id, ouId);
    await this.profileRepo.softRemove(profile);
    this.systemActivityService.logDeleted("device_profile", id, profile.profile_name).catch(() => {});
  }
}
