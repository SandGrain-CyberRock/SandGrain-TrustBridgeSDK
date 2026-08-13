import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

import { IsNull, Repository } from "typeorm";

import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";
import { Category } from "../../entities/category.entity";
import { SystemActivityService } from "../system-activity/system-activity.service";

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);
  constructor(
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    private systemActivityService: SystemActivityService,
  ) { }

  async create(dto: CreateCategoryDto, ouId: number): Promise<Category> {
    try {
      this.logger.log("START::CategoryService::create", dto, ouId);
      // Step 1: Check if category name already exists
      const existingCategory = await this.categoryRepo.findOne({
        where: { category_name: dto.category_name, ou_id: ouId, deleted_at: IsNull() },
      });
      if (existingCategory) {
        throw new ConflictException(`Category '${dto.category_name}' already exists`);
      }
      // Step 2: Create category
      const category = this.categoryRepo.create({ ...dto, ou_id: ouId });
      const saved = await this.categoryRepo.save(category);

      //  step 3: log activity
      this.systemActivityService.logCreated("category", saved.category_id, saved.category_name).catch(() => { });
      this.logger.log("SUCCESS::CategoryService::create", dto, ouId);
      return saved;
    } catch (error: any) {
      this.logger.error("ERROR::CategoryService::create", error, dto, ouId);
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
    try {
      this.logger.log("START::CategoryService::findAll", ouId);
      const where = ouId ? { ou_id: ouId } : {};
      const categories = await this.categoryRepo.find({ where, order: { category_name: "ASC" } });
      this.logger.log("SUCCESS::CategoryService::findAll", ouId);
      return categories;
    } catch (error) {
      this.logger.error("ERROR::CategoryService::findAll", error, ouId);
      throw error;
    }
  }

  async findOne(id: number): Promise<Category> {
    try {
      this.logger.log("START::CategoryService::findOne", id);
      const category = await this.categoryRepo.findOne({
        where: { category_id: id },
        relations: ["subCategories"],
      });
      if (!category) {
        throw new NotFoundException(`Category #${id} not found`);
      }
      this.logger.log("SUCCESS::CategoryService::findOne", id);
      return category;
    } catch (error) {
      this.logger.error("ERROR::CategoryService::findOne", error, id);
      throw error;
    }
  }

  async update(id: number, dto: UpdateCategoryDto): Promise<Category> {
    this.logger.log("START::CategoryService::update", id, dto);
    // step 1: get category
    const category = await this.findOne(id);
    try {
      // step 2: check if category name already exists
      if (dto.category_name && dto.category_name !== category.category_name) {
        const existingCategory = await this.categoryRepo.findOne({
          where: { category_name: dto.category_name, ou_id: category.ou_id, deleted_at: IsNull() },
        });
        if (existingCategory) {
          throw new ConflictException(`Category '${dto.category_name}' already exists`);
        }
      }
      // step 3: update category
      Object.assign(category, dto);
      const saved = await this.categoryRepo.save(category);
      this.systemActivityService.logUpdated("category", saved.category_id, saved.category_name).catch(() => { });
      this.logger.log("SUCCESS::CategoryService::update", id, dto);
      return saved;
    } catch (error: any) {
      this.logger.error("ERROR::CategoryService::update", error, id, dto);
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
    try {
      this.logger.log("START::CategoryService::remove", id);
      const category = await this.findOne(id);
      await this.categoryRepo.softRemove(category);
      this.systemActivityService.logDeleted("category", id, category.category_name).catch(() => { });
      this.logger.log("SUCCESS::CategoryService::remove", id);
    } catch (error) {
      this.logger.error("ERROR::CategoryService::remove", error, id);
      throw error;
    }
  }
}