import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

import { IsNull, Repository } from "typeorm";

import { CreateTagDto } from "./dto/create-tag.dto";
import { UpdateTagDto } from "./dto/update-tag.dto";
import { Tag } from "../../entities/tag.entity";
import { SystemActivityService } from "../system-activity/system-activity.service";

@Injectable()
export class TagService {
  private readonly logger = new Logger(TagService.name);
  constructor(
    @InjectRepository(Tag)
    private tagRepo: Repository<Tag>,
    private systemActivityService: SystemActivityService,
  ) { }

  async create(dto: CreateTagDto, ouId: number): Promise<Tag> {
    this.logger.log("START::TagService::create", dto, ouId);
    // step 1: check if tag name already exists
    const existingTag = await this.tagRepo.findOne({
      where: { tag_name: dto.tag_name, ou_id: ouId, deleted_at: IsNull() },
    });
    if (existingTag) {
      throw new ConflictException(`Tag '${dto.tag_name}' already exists`);
    }
    try {
      // step 2: create tag
      const tag = this.tagRepo.create({ ...dto, ou_id: ouId });
      const saved = await this.tagRepo.save(tag);
      // step 3: log activity
      this.systemActivityService.logCreated("tag", saved.tag_id, saved.tag_name).catch(() => { });
      this.logger.log("SUCCESS::TagService::create", dto, ouId);
      return saved;
    } catch (error: any) {
      this.logger.error("ERROR::TagService::create", error, dto, ouId);
      if (
        error.code === "ER_DUP_ENTRY" ||
        error.message?.includes("Duplicate entry")
      ) {
        throw new ConflictException(`Tag '${dto.tag_name}' already exists`);
      }
      throw error;
    }
  }

  async findAll(ouId?: number): Promise<Tag[]> {
    try {
      this.logger.log("START::TagService::findAll", ouId);
      const where = ouId ? { ou_id: ouId } : {};
      return this.tagRepo.find({ where, order: { tag_name: "ASC" } });
    } catch (error) {
      this.logger.error("ERROR::TagService::findAll", error, ouId);
      throw error;
    }
  }

  async findOne(id: number): Promise<Tag> {
    try {
      const tag = await this.tagRepo.findOneBy({ tag_id: id });
      if (!tag) {
        throw new NotFoundException(`Tag #${id} not found`);
      }
      return tag;
    } catch (error) {
      this.logger.error("ERROR::TagService::findOne", error, id);
      throw error;
    }
  }

  async update(id: number, dto: UpdateTagDto): Promise<Tag> {
    this.logger.log("START::TagService::update", id, dto);
    // step 1: get tag
    const tag = await this.findOne(id);
    if (dto.tag_name && dto.tag_name !== tag.tag_name) {
      const existingTag = await this.tagRepo.findOne({
        where: { tag_name: dto.tag_name, ou_id: tag.ou_id, deleted_at: IsNull() },
      });
      if (existingTag) {
        throw new ConflictException(`Tag '${dto.tag_name}' already exists`);
      }
    }
    try {
      // step 2: update tag
      Object.assign(tag, dto);
      const saved = await this.tagRepo.save(tag);
      // step 3: log activity
      this.systemActivityService.logUpdated("tag", saved.tag_id, saved.tag_name).catch(() => { });
      this.logger.log("SUCCESS::TagService::update", id, dto);
      return saved;
    } catch (error: any) {
      this.logger.error("ERROR::TagService::update", error, id, dto);
      if (
        error.code === "ER_DUP_ENTRY" ||
        error.message?.includes("Duplicate entry")
      ) {
        throw new ConflictException(
          `Tag '${dto.tag_name || tag.tag_name}' already exists`,
        );
      }
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    try {
      this.logger.log("START::TagService::remove", id);
      const tag = await this.findOne(id);
      await this.tagRepo.softRemove(tag);
      this.systemActivityService.logDeleted("tag", id, tag.tag_name).catch(() => { });
      this.logger.log("SUCCESS::TagService::remove", id);
    } catch (error) {
      this.logger.error("ERROR::TagService::remove", error, id);
      throw error;
    }
  }
}