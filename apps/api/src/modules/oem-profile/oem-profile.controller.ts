import { Controller, Get, Post, Put, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@apcd/database';

import { OemProfileService } from './oem-profile.service';
import { CreateOemProfileDto, UpdateOemProfileDto } from './dto/create-oem-profile.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('OEM Profile')
@ApiBearerAuth()
@Controller('oem-profile')
export class OemProfileController {
  constructor(private oemProfileService: OemProfileService) {}

  @Get()
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Get current OEM profile (form fields 1-14)' })
  async getProfile(@CurrentUser() user: JwtPayload) {
    return this.oemProfileService.getByUserId(user.sub);
  }

  @Post()
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Create OEM company profile' })
  async createProfile(@CurrentUser() user: JwtPayload, @Body() dto: CreateOemProfileDto) {
    return this.oemProfileService.create(user.sub, dto);
  }

  @Put()
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Update OEM company profile' })
  async updateProfile(@CurrentUser() user: JwtPayload, @Body() dto: UpdateOemProfileDto) {
    return this.oemProfileService.update(user.sub, dto);
  }
}
