import { Role } from '@apcd/database';
import { Controller, Get, Post, Put, Delete, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

import { InstallationExperienceService } from './installation-experience.service';

@ApiTags('Installation Experience')
@ApiBearerAuth()
@Controller('installation-experience')
export class InstallationExperienceController {
  constructor(private service: InstallationExperienceService) {}

  @Get('application/:applicationId')
  @ApiOperation({ summary: 'Get installation experiences for an application (Annexure 6a)' })
  async findByApplication(@Param('applicationId', ParseUUIDPipe) applicationId: string) {
    return this.service.findByApplication(applicationId);
  }

  @Post(':applicationId/bulk')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Bulk create/replace installation experiences' })
  async bulkCreate(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: { entries: any[] },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.bulkCreate(applicationId, user.sub, dto.entries);
  }

  @Post(':applicationId')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Add installation experience' })
  async create(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(applicationId, user.sub, dto);
  }

  @Put(':id')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Update installation experience' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, user.sub, dto);
  }

  @Delete(':id')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Delete installation experience' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.service.delete(id, user.sub);
  }
}
