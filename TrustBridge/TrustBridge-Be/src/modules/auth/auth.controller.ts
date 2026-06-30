import { Controller, Post, Body, Get, Patch, UseGuards, Param } from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { SetPasswordDto } from "./dto/set-password.dto";
import { Public, CurrentUser } from "../../common/decorators";
import { JwtAuthGuard, RolesGuard } from "../../common/guards";
import {
  LoginResponseDto,
  ProfileResponseDto,
  CurrentUserDto,
  MessageResponseDto,
  UnauthorizedResponseDto,
  ErrorResponseDto,
  NotFoundResponseDto,
  ConflictResponseDto,
} from "../../common/dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { InitializeSystemDto } from "./dto/initialize-system.dto";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post("login")
  @ApiOperation({
    summary: "User login",
    description:
      "Authenticate user with username and password. Returns JWT token on success.",
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: "Login successful. Returns JWT token and user info.",
    type: LoginResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Invalid credentials",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      "Account is locked due to too many failed attempts or account is inactive",
    type: ErrorResponseDto,
  })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post("forgot-password")
  @ApiOperation({
    summary: "Request password reset",
    description:
      "Send a password reset link to the user's email address. The link expires in 1 hour.",
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: 200,
    description: "Password reset link sent to email",
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "User with this email not found",
    type: NotFoundResponseDto,
  })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Public()
  @Post("reset-password")
  @ApiOperation({
    summary: "Reset password using token",
    description:
      "Reset user password using the token received via email. Token must be valid and not expired.",
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({
    status: 200,
    description: "Password reset successfully",
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: "Invalid or expired reset token",
    type: ConflictResponseDto,
  })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Public()
  @Post("set-password")
  @ApiOperation({
    summary: "Set password for new user",
    description:
      "Set initial password for a newly invited user using the invitation token from email.",
  })
  @ApiBody({ type: SetPasswordDto })
  @ApiResponse({
    status: 200,
    description: "Password set successfully. User can now login.",
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: "Invalid or expired invitation token",
    type: ConflictResponseDto,
  })
  async setPassword(@Body() setPasswordDto: SetPasswordDto) {
    return this.authService.setPassword(setPasswordDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get("profile")
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({
    summary: "Get user profile",
    description: "Retrieve the authenticated user's profile information.",
  })
  @ApiResponse({
    status: 200,
    description: "Profile retrieved successfully",
    type: ProfileResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
    type: UnauthorizedResponseDto,
  })
  async getProfile(@CurrentUser("user_id") userId: number) {
    return this.authService.getProfile(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("profile")
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({ summary: "Update user profile (name, company_title)" })
  @ApiResponse({ status: 200, description: "Profile updated successfully" })
  async updateProfile(
    @CurrentUser("user_id") userId: number,
    @Body() dto: { name?: string; company_title?: string },
  ) {
    return this.authService.updateProfile(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({
    summary: "Get current user with roles and permissions",
    description:
      "Retrieve the authenticated user's complete information including assigned roles and permissions.",
  })
  @ApiResponse({
    status: 200,
    description: "Current user data with roles and permissions",
    type: CurrentUserDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
    type: UnauthorizedResponseDto,
  })
  async getMe(@CurrentUser() user: any) {
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @Post("change-password")
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({
    summary: "Change password for logged-in user",
    description:
      "Allows a logged-in user to change their password using old and new passwords.",
  })
  @ApiBody({
    type: ChangePasswordDto,
    examples: {
      changePassword: {
        summary: "Change password payload",
        value: {
          oldPassword: "OldPassword123!",
          newPassword: "NewPassword456!",
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: "Password changed successfully",
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Old password is incorrect",
    type: ErrorResponseDto,
  })
  async changePassword(
    @CurrentUser("user_id") userId: number,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post("initialize")
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({
    summary: "Initialize system",
    description:
      "Complete system initialization: create organization, configure tenant credentials, and create admin user. Only callable by TrustAdmin.",
  })
  @ApiBody({ type: InitializeSystemDto })
  @ApiResponse({
    status: 200,
    description: "System initialized successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Only TrustAdmin can initialize the system",
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: "System is already initialized",
    type: ConflictResponseDto,
  })
  async initializeSystem(
    @CurrentUser("user_id") userId: number,
    @Body() dto: InitializeSystemDto,
  ) {
    return this.authService.initializeSystem(userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post("admin/reset-password/:userId")
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({
    summary: "Admin reset user password",
    description:
      "Admin resets a user's password and forces them to change at next login.",
  })
  @ApiResponse({
    status: 200,
    description: "Temporary password emailed. User must change it at next login.",
    type: MessageResponseDto,
  })
  async adminResetPassword(@Param("userId") userId: number) {
    const result = await this.authService.adminResetPassword(userId);
    return {
      data: result,
      message: "Temporary password sent to user's email. User must change password at next login.",
    };
  }
}
