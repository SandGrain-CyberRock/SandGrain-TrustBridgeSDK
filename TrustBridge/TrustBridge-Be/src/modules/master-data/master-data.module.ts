import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Category } from "../../entities/category.entity";
import { SubCategory } from "../../entities/sub-category.entity";
import { Tag } from "../../entities/tag.entity";
import { CategoryController } from "./category.controller";
import { SubCategoryController } from "./sub-category.controller";
import { TagController } from "./tag.controller";
import { CategoryService } from "./category.service";
import { SubCategoryService } from "./sub-category.service";
import { TagService } from "./tag.service";
import { SystemActivityModule } from "../system-activity/system-activity.module";

@Module({
  imports: [TypeOrmModule.forFeature([Category, SubCategory, Tag]), SystemActivityModule],
  controllers: [CategoryController, SubCategoryController, TagController],
  providers: [CategoryService, SubCategoryService, TagService],
  exports: [CategoryService, SubCategoryService, TagService],
})
export class MasterDataModule {}
