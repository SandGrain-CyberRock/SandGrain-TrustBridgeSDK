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

import { CreateTagDto } from "./dto/create-tag.dto";
import { UpdateTagDto } from "./dto/update-tag.dto";
import { TagService } from "./tag.service";
import { Permissions } from "../../common/decorators";
import { JwtAuthGuard, PermissionsGuard } from "../../common/guards";

@ApiTags("Master Data - Tags")
@ApiBearerAuth("JWT-auth")
@Controller("master-data/tags")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Post()
  @Permissions("master-data:create")
  @ApiOperation({ summary: "Create a tag" })
  @ApiResponse({ status: 201, description: "Tag created successfully" })
  async create(@Req() req: any, @Body() dto: CreateTagDto) {
    const data = await this.tagService.create(dto, req.user.ou_id);
    return { data, message: "Tag created successfully" };
  }

  @Get()
  @Permissions("master-data:retrieve")
  @ApiOperation({ summary: "Get all tags" })
  @ApiResponse({ status: 200, description: "List of tags" })
  async findAll(@Req() req: any) {
    const data = await this.tagService.findAll(req.user.ou_id);
    return { data, message: "Tags retrieved successfully" };
  }

  @Get(":id")
  @Permissions("master-data:retrieve")
  @ApiOperation({ summary: "Get tag by ID" })
  @ApiResponse({ status: 200, description: "Tag details" })
  async findOne(@Param("id", ParseIntPipe) id: number) {
    const data = await this.tagService.findOne(id);
    return { data, message: "Tag retrieved successfully" };
  }

  @Patch(":id")
  @Permissions("master-data:update")
  @ApiOperation({ summary: "Update a tag" })
  @ApiResponse({ status: 200, description: "Tag updated successfully" })
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateTagDto,
  ) {
    const data = await this.tagService.update(id, dto);
    return { data, message: "Tag updated successfully" };
  }

  @Delete(":id")
  @Permissions("master-data:delete")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete a tag" })
  @ApiResponse({ status: 200, description: "Tag deleted successfully" })
  async remove(@Param("id", ParseIntPipe) id: number) {
    await this.tagService.remove(id);
    return { data: null, message: "Tag deleted successfully" };
  }
}
