import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

import { Repository } from "typeorm";

import { CreateProfileParamDto } from "./dto/create-profile-param.dto";
import { UpdateProfileParamDto } from "./dto/update-profile-param.dto";
import { DeviceProfile } from "../../entities/device-profile.entity";
import { ProfileDefaultParam } from "../../entities/profile-default-param.entity";
import { SystemActivityService } from "../system-activity/system-activity.service";

@Injectable()
export class ProfileDefaultParamService {
  constructor(
    @InjectRepository(ProfileDefaultParam)
    private paramRepo: Repository<ProfileDefaultParam>,
    @InjectRepository(DeviceProfile)
    private profileRepo: Repository<DeviceProfile>,
    private systemActivityService: SystemActivityService,
  ) {}

  async create(dto: CreateProfileParamDto): Promise<ProfileDefaultParam> {
    const param = this.paramRepo.create(dto);
    const saved = await this.paramRepo.save(param);
    this.systemActivityService.logCreated("profile_param", saved.profile_param_id, saved.param_name).catch(() => {});
    return saved;
  }

  async findAll(): Promise<ProfileDefaultParam[]> {
    return this.paramRepo.find({ order: { param_name: "ASC" } });
  }

  async findOne(id: number): Promise<ProfileDefaultParam> {
    const param = await this.paramRepo.findOneBy({ profile_param_id: id });
    if (!param) {
      throw new NotFoundException(`Profile param #${id} not found`);
    }
    return param;
  }

  async update(
    id: number,
    dto: UpdateProfileParamDto,
  ): Promise<ProfileDefaultParam> {
    const param = await this.findOne(id);
    Object.assign(param, dto);
    const saved = await this.paramRepo.save(param);
    this.systemActivityService.logUpdated("profile_param", id, saved.param_name).catch(() => {});
    return saved;
  }

  async remove(id: number): Promise<void> {
    const param = await this.findOne(id);
    const paramName = param.param_name;
    // Prevent deletion if assigned to any profile
    const assigned = await this.profileRepo.findOne({
      where: { profile_param_id: id },
      withDeleted: false,
    });
    if (assigned) {
      throw new BadRequestException(
        `Cannot delete: profile param #${id} is assigned to profile '${assigned.profile_name}'`,
      );
    }
    await this.paramRepo.remove(param);
    this.systemActivityService.logDeleted("profile_param", id, paramName).catch(() => {});
  }
}
