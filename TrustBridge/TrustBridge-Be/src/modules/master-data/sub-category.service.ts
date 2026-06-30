import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SubCategory } from "../../entities/sub-category.entity";
import { Category } from "../../entities/category.entity";
import { CreateSubCategoryDto } from "./dto/create-sub-category.dto";
import { UpdateSubCategoryDto } from "./dto/update-sub-category.dto";
import { SystemActivityService } from "../system-activity/system-activity.service";

@Injectable()
export class SubCategoryService {
  constructor(
    @InjectRepository(SubCategory)
    private subCategoryRepo: Repository<SubCategory>,
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    private systemActivityService: SystemActivityService,
  ) {}

  async create(dto: CreateSubCategoryDto, ouId: number): Promise<SubCategory> {
    const category = await this.categoryRepo.findOneBy({
      category_id: dto.category_id,
    });
    if (!category) {
      throw new NotFoundException(`Category #${dto.category_id} not found`);
    }
    const existing = await this.subCategoryRepo
      .createQueryBuilder("subCategory")
      .where("subCategory.sub_category_name = :name", {
        name: dto.sub_category_name,
      })
      .andWhere("subCategory.category_id = :categoryId", {
        categoryId: dto.category_id,
      })
      .andWhere("subCategory.ou_id = :ouId", { ouId })
      .andWhere("subCategory.deleted_at IS NULL")
      .getOne();
    if (existing) {
      throw new ConflictException(
        `Sub-category '${dto.sub_category_name}' already exists in this category`,
      );
    }
    const subCategory = this.subCategoryRepo.create({ ...dto, ou_id: ouId });
    try {
      const saved = await this.subCategoryRepo.save(subCategory);
      this.systemActivityService.logCreated("sub_category", saved.sub_category_id, saved.sub_category_name).catch(() => {});
      return saved;
    } catch (error: any) {
      if (
        error.code === "ER_DUP_ENTRY" ||
        error.message?.includes("Duplicate entry")
      ) {
        throw new ConflictException(
          `Sub-category '${dto.sub_category_name}' already exists in this category`,
        );
      }
      throw error;
    }
  }

  async findAll(ouId?: number, categoryId?: number): Promise<SubCategory[]> {
    const where: Record<string, any> = {};
    if (ouId) where.ou_id = ouId;
    if (categoryId) where.category_id = categoryId;
    return this.subCategoryRepo.find({
      where,
      relations: ["category"],
      order: { sub_category_name: "ASC" },
    });
  }

  async findOne(id: number): Promise<SubCategory> {
    const subCategory = await this.subCategoryRepo.findOne({
      where: { sub_category_id: id },
      relations: ["category"],
    });
    if (!subCategory) {
      throw new NotFoundException(`Sub-category #${id} not found`);
    }
    return subCategory;
  }

  async update(id: number, dto: UpdateSubCategoryDto): Promise<SubCategory> {
    const subCategory = await this.findOne(id);
    if (dto.category_id) {
      const category = await this.categoryRepo.findOneBy({
        category_id: dto.category_id,
      });
      if (!category) {
        throw new NotFoundException(`Category #${dto.category_id} not found`);
      }
    }
    if (
      dto.sub_category_name &&
      dto.sub_category_name !== subCategory.sub_category_name
    ) {
      const existing = await this.subCategoryRepo
        .createQueryBuilder("subCategory")
        .where("subCategory.sub_category_name = :name", {
          name: dto.sub_category_name,
        })
        .andWhere("subCategory.category_id = :categoryId", {
          categoryId: dto.category_id || subCategory.category_id,
        })
        .andWhere("subCategory.deleted_at IS NULL")
        .getOne();
      if (existing) {
        throw new ConflictException(
          `Sub-category '${dto.sub_category_name}' already exists in this category`,
        );
      }
    }
    Object.assign(subCategory, dto);
    try {
      const saved = await this.subCategoryRepo.save(subCategory);
      this.systemActivityService.logUpdated("sub_category", saved.sub_category_id, saved.sub_category_name).catch(() => {});
      return saved;
    } catch (error: any) {
      if (
        error.code === "ER_DUP_ENTRY" ||
        error.message?.includes("Duplicate entry")
      ) {
        throw new ConflictException(
          `Sub-category '${dto.sub_category_name || subCategory.sub_category_name}' already exists in this category`,
        );
      }
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    const subCategory = await this.findOne(id);
    await this.subCategoryRepo.softRemove(subCategory);
    this.systemActivityService.logDeleted("sub_category", id, subCategory.sub_category_name).catch(() => {});
  }
}
