import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Tag } from "../../entities/tag.entity";
import { CreateTagDto } from "./dto/create-tag.dto";
import { UpdateTagDto } from "./dto/update-tag.dto";
import { SystemActivityService } from "../system-activity/system-activity.service";

@Injectable()
export class TagService {
  constructor(
    @InjectRepository(Tag)
    private tagRepo: Repository<Tag>,
    private systemActivityService: SystemActivityService,
  ) {}

  async create(dto: CreateTagDto, ouId: number): Promise<Tag> {
    const existing = await this.tagRepo
      .createQueryBuilder("tag")
      .where("tag.tag_name = :name", { name: dto.tag_name })
      .andWhere("tag.ou_id = :ouId", { ouId })
      .andWhere("tag.deleted_at IS NULL")
      .getOne();
    if (existing) {
      throw new ConflictException(`Tag '${dto.tag_name}' already exists`);
    }
    const tag = this.tagRepo.create({ ...dto, ou_id: ouId });
    try {
      const saved = await this.tagRepo.save(tag);
      this.systemActivityService.logCreated("tag", saved.tag_id, saved.tag_name).catch(() => {});
      return saved;
    } catch (error: any) {
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
    const where = ouId ? { ou_id: ouId } : {};
    return this.tagRepo.find({ where, order: { tag_name: "ASC" } });
  }

  async findOne(id: number): Promise<Tag> {
    const tag = await this.tagRepo.findOneBy({ tag_id: id });
    if (!tag) {
      throw new NotFoundException(`Tag #${id} not found`);
    }
    return tag;
  }

  async update(id: number, dto: UpdateTagDto): Promise<Tag> {
    const tag = await this.findOne(id);
    if (dto.tag_name && dto.tag_name !== tag.tag_name) {
      const existing = await this.tagRepo
        .createQueryBuilder("tag")
        .where("tag.tag_name = :name", { name: dto.tag_name })
        .andWhere("tag.deleted_at IS NULL")
        .getOne();
      if (existing) {
        throw new ConflictException(`Tag '${dto.tag_name}' already exists`);
      }
    }
    Object.assign(tag, dto);
    try {
      const saved = await this.tagRepo.save(tag);
      this.systemActivityService.logUpdated("tag", saved.tag_id, saved.tag_name).catch(() => {});
      return saved;
    } catch (error: any) {
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
    const tag = await this.findOne(id);
    await this.tagRepo.softRemove(tag);
    this.systemActivityService.logDeleted("tag", id, tag.tag_name).catch(() => {});
  }
}
