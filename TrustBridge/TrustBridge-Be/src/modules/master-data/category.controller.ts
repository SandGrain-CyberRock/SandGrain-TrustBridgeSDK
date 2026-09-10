import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import { CategoryService } from "./category.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";
import { Permissions } from "../../common/decorators";
import { JwtAuthGuard, PermissionsGuard } from "../../common/guards";

@ApiTags("Master Data - Categories")
@ApiBearerAuth("JWT-auth")
@Controller("master-data/categories")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @Permissions("master-data:create")
  @ApiOperation({ summary: "Create a category" })
  @ApiResponse({ status: 201, description: "Category created successfully" })
  async create(@Req() req: any, @Body() dto: CreateCategoryDto) {
    const data = await this.categoryService.create(dto, req.user.ou_id);
    return { data, message: "Category created successfully" };
  }

  @Get()
  @Permissions("master-data:retrieve")
  @ApiOperation({ summary: "Get all categories" })
  @ApiResponse({ status: 200, description: "List of categories" })
  async findAll(@Req() req: any) {
    const data = await this.categoryService.findAll(req.user.ou_id);
    return { data, message: "Categories retrieved successfully" };
  }

  @Get(":id")
  @Permissions("master-data:retrieve")
  @ApiOperation({ summary: "Get category by ID" })
  @ApiResponse({ status: 200, description: "Category details" })
  async findOne(@Param("id", ParseIntPipe) id: number) {
    const data = await this.categoryService.findOne(id);
    return { data, message: "Category retrieved successfully" };
  }

  @Patch(":id")
  @Permissions("master-data:update")
  @ApiOperation({ summary: "Update a category" })
  @ApiResponse({ status: 200, description: "Category updated successfully" })
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ) {
    const data = await this.categoryService.update(id, dto);
    return { data, message: "Category updated successfully" };
  }

  @Delete(":id")
  @Permissions("master-data:delete")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete a category" })
  @ApiResponse({ status: 200, description: "Category deleted successfully" })
  async remove(@Param("id", ParseIntPipe) id: number) {
    await this.categoryService.remove(id);
    return { data: null, message: "Category deleted successfully" };
  }
}
