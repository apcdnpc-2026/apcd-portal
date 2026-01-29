import { Controller, Get, Post, Put, Delete, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@apcd/database';

import { StaffDetailsService } from './staff-details.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Staff Details')
@ApiBearerAuth()
@Controller('staff-details')
export class StaffDetailsController {
  constructor(private service: StaffDetailsService) {}

  @Get('application/:applicationId')
  @ApiOperation({ summary: 'Get staff details for an application (Annexure 7)' })
  async findByApplication(@Param('applicationId', ParseUUIDPipe) applicationId: string) {
    return this.service.findByApplication(applicationId);
  }

  @Post(':applicationId')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Add staff detail to application' })
  async create(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.create(applicationId, user.sub, dto);
  }

  @Post(':applicationId/bulk')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Bulk create/replace staff details' })
  async bulkCreate(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: { staffList: any[] },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.bulkCreate(applicationId, user.sub, dto.staffList);
  }

  @Put(':id')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Update staff detail' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, user.sub, dto);
  }

  @Put('application/:applicationId/reorder')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Reorder staff details' })
  async reorder(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: { orderedIds: string[] },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reorder(applicationId, user.sub, dto.orderedIds);
  }

  @Delete(':id')
  @Roles(Role.OEM)
  @ApiOperation({ summary: 'Delete staff detail' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.service.delete(id, user.sub);
  }
}
