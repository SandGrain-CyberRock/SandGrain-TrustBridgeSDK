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
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard, PermissionsGuard } from "../../common/guards";
import { Permissions } from "../../common/decorators";
import { SubCategoryService } from "./sub-category.service";
import { CreateSubCategoryDto } from "./dto/create-sub-category.dto";
import { UpdateSubCategoryDto } from "./dto/update-sub-category.dto";

@ApiTags("Master Data - Sub-Categories")
@ApiBearerAuth("JWT-auth")
@Controller("master-data/sub-categories")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SubCategoryController {
  constructor(private readonly subCategoryService: SubCategoryService) {}

  @Post()
  @Permissions("master-data:create")
  @ApiOperation({ summary: "Create a sub-category" })
  @ApiResponse({ status: 201, description: "Sub-category created successfully" })
  async create(@Req() req: any, @Body() dto: CreateSubCategoryDto) {
    const data = await this.subCategoryService.create(dto, req.user.ou_id);
    return { data, message: "Sub-category created successfully" };
  }

  @Get()
  @Permissions("master-data:retrieve")
  @ApiOperation({ summary: "Get all sub-categories (optionally filter by category_id)" })
  @ApiQuery({ name: "category_id", required: false, type: Number })
  @ApiResponse({ status: 200, description: "List of sub-categories" })
  async findAll(@Req() req: any, @Query("category_id") categoryId?: string) {
    const data = await this.subCategoryService.findAll(
      req.user.ou_id,
      categoryId ? Number(categoryId) : undefined,
    );
    return { data, message: "Sub-categories retrieved successfully" };
  }

  @Get(":id")
  @Permissions("master-data:retrieve")
  @ApiOperation({ summary: "Get sub-category by ID" })
  @ApiResponse({ status: 200, description: "Sub-category details" })
  async findOne(@Param("id", ParseIntPipe) id: number) {
    const data = await this.subCategoryService.findOne(id);
    return { data, message: "Sub-category retrieved successfully" };
  }

  @Patch(":id")
  @Permissions("master-data:update")
  @ApiOperation({ summary: "Update a sub-category" })
  @ApiResponse({ status: 200, description: "Sub-category updated successfully" })
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateSubCategoryDto,
  ) {
    const data = await this.subCategoryService.update(id, dto);
    return { data, message: "Sub-category updated successfully" };
  }

  @Delete(":id")
  @Permissions("master-data:delete")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete a sub-category" })
  @ApiResponse({ status: 200, description: "Sub-category deleted successfully" })
  async remove(@Param("id", ParseIntPipe) id: number) {
    await this.subCategoryService.remove(id);
    return { data: null, message: "Sub-category deleted successfully" };
  }
}
