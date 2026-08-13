import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

import { IsNull, Repository } from "typeorm";

import { CreateSubCategoryDto } from "./dto/create-sub-category.dto";
import { UpdateSubCategoryDto } from "./dto/update-sub-category.dto";
import { Category } from "../../entities/category.entity";
import { SubCategory } from "../../entities/sub-category.entity";
import { SystemActivityService } from "../system-activity/system-activity.service";

@Injectable()
export class SubCategoryService {
  private readonly logger = new Logger(SubCategoryService.name);
  constructor(
    @InjectRepository(SubCategory)
    private subCategoryRepo: Repository<SubCategory>,
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    private systemActivityService: SystemActivityService,
  ) { }

  async create(dto: CreateSubCategoryDto, ouId: number): Promise<SubCategory> {
    this.logger.log("START::SubCategoryService::create", dto, ouId);
    // step 1: check if category exists
    const category = await this.categoryRepo.findOneBy({
      category_id: dto.category_id,
    });
    if (!category) {
      throw new NotFoundException(`Category #${dto.category_id} not found`);
    }
    // step 2: check if sub-category name already exists
    const existingSubCategory = await this.subCategoryRepo.findOne({
      where: { sub_category_name: dto.sub_category_name, category_id: dto.category_id, ou_id: ouId, deleted_at: IsNull() },
    });
    if (existingSubCategory) {
      throw new ConflictException(
        `Sub-category '${dto.sub_category_name}' already exists in this category`,
      );
    }
    try {
      // step 3: create sub-category
      const subCategory = this.subCategoryRepo.create({ ...dto, ou_id: ouId });
      const saved = await this.subCategoryRepo.save(subCategory);
      // step 4: log activity
      this.systemActivityService.logCreated("sub_category", saved.sub_category_id, saved.sub_category_name).catch(() => { });
      this.logger.log("SUCCESS::SubCategoryService::create", dto, ouId);
      return saved;
    } catch (error: any) {
      this.logger.error("ERROR::SubCategoryService::create", error, dto, ouId);
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
    try {
      this.logger.log("START::SubCategoryService::findAll", ouId, categoryId);
      const where: Record<string, any> = {};
      if (ouId) where.ou_id = ouId;
      if (categoryId) where.category_id = categoryId;
      const subCategories = await this.subCategoryRepo.find({
        where,
        relations: ["category"],
        order: { sub_category_name: "ASC" },
      });
      this.logger.log("SUCCESS::SubCategoryService::findAll", ouId, categoryId);
      return subCategories;
    } catch (error) {
      this.logger.error("ERROR::SubCategoryService::findAll", error, ouId, categoryId);
      throw error;
    }
  }

  async findOne(id: number): Promise<SubCategory> {
    try {
      this.logger.log("START::SubCategoryService::findOne", id);
      const subCategory = await this.subCategoryRepo.findOne({
        where: { sub_category_id: id },
        relations: ["category"],
      });
      if (!subCategory) {
        throw new NotFoundException(`Sub-category #${id} not found`);
      }
      this.logger.log("SUCCESS::SubCategoryService::findOne", id);
      return subCategory;
    } catch (error) {
      this.logger.error("ERROR::SubCategoryService::findOne", error, id);
      throw error;
    }
  }

  async update(id: number, dto: UpdateSubCategoryDto): Promise<SubCategory> {
    this.logger.log("START::SubCategoryService::update", id, dto);
    // step 1: get sub-category
    const subCategory = await this.findOne(id);

    // Step 2: check if category exists
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
      // step 3: check if sub-category name already exists
      const existingSubCategory = await this.subCategoryRepo.findOne({
        where: { sub_category_name: dto.sub_category_name, category_id: dto.category_id || subCategory.category_id, ou_id: subCategory.ou_id, deleted_at: IsNull() },
      });
      if (existingSubCategory) {
        throw new ConflictException(
          `Sub-category '${dto.sub_category_name}' already exists in this category`,
        );
      }
    }
    try {
      // step 4: update sub-category
      Object.assign(subCategory, dto);
      const saved = await this.subCategoryRepo.save(subCategory);
      // step 5: log activity
      this.systemActivityService.logUpdated("sub_category", saved.sub_category_id, saved.sub_category_name).catch(() => { });
      this.logger.log("SUCCESS::SubCategoryService::update", id, dto);
      return saved;
    } catch (error: any) {
      this.logger.error("ERROR::SubCategoryService::update", error, id, dto);
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
    try {
      this.logger.log("START::SubCategoryService::remove", id);
      const subCategory = await this.findOne(id);
      await this.subCategoryRepo.softRemove(subCategory);
      this.systemActivityService.logDeleted("sub_category", id, subCategory.sub_category_name).catch(() => { });
      this.logger.log("SUCCESS::SubCategoryService::remove", id);
    } catch (error) {
      this.logger.error("ERROR::SubCategoryService::remove", error, id);
      throw error;
    }
  }
}