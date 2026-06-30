import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Category } from "../../entities/category.entity";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";
import { SystemActivityService } from "../system-activity/system-activity.service";

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    private systemActivityService: SystemActivityService,
  ) {}

  async create(dto: CreateCategoryDto, ouId: number): Promise<Category> {
    const existing = await this.categoryRepo
      .createQueryBuilder("category")
      .where("category.category_name = :name", { name: dto.category_name })
      .andWhere("category.ou_id = :ouId", { ouId })
      .andWhere("category.deleted_at IS NULL")
      .getOne();
    if (existing) {
      throw new ConflictException(
        `Category '${dto.category_name}' already exists`,
      );
    }
    const category = this.categoryRepo.create({ ...dto, ou_id: ouId });
    try {
      const saved = await this.categoryRepo.save(category);
      this.systemActivityService.logCreated("category", saved.category_id, saved.category_name).catch(() => {});
      return saved;
    } catch (error: any) {
      if (
        error.code === "ER_DUP_ENTRY" ||
        error.message?.includes("Duplicate entry")
      ) {
        throw new ConflictException(
          `Category '${dto.category_name}' already exists`,
        );
      }
      throw error;
    }
  }

  async findAll(ouId?: number): Promise<Category[]> {
    const where = ouId ? { ou_id: ouId } : {};
    return this.categoryRepo.find({ where, order: { category_name: "ASC" } });
  }

  async findOne(id: number): Promise<Category> {
    const category = await this.categoryRepo.findOne({
      where: { category_id: id },
      relations: ["subCategories"],
    });
    if (!category) {
      throw new NotFoundException(`Category #${id} not found`);
    }
    return category;
  }

  async update(id: number, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id);
    if (dto.category_name && dto.category_name !== category.category_name) {
      const existing = await this.categoryRepo
        .createQueryBuilder("category")
        .where("category.category_name = :name", { name: dto.category_name })
        .andWhere("category.deleted_at IS NULL")
        .getOne();
      if (existing) {
        throw new ConflictException(
          `Category '${dto.category_name}' already exists`,
        );
      }
    }
    Object.assign(category, dto);
    try {
      const saved = await this.categoryRepo.save(category);
      this.systemActivityService.logUpdated("category", saved.category_id, saved.category_name).catch(() => {});
      return saved;
    } catch (error: any) {
      if (
        error.code === "ER_DUP_ENTRY" ||
        error.message?.includes("Duplicate entry")
      ) {
        throw new ConflictException(
          `Category '${dto.category_name || category.category_name}' already exists`,
        );
      }
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    const category = await this.findOne(id);
    await this.categoryRepo.softRemove(category);
    this.systemActivityService.logDeleted("category", id, category.category_name).catch(() => {});
  }
}
