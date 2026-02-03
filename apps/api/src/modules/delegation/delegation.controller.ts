import { DelegationType, Role } from '@apcd/database';
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { DelegationService } from './delegation.service';

interface CreateDelegationBody {
  toUserId: string;
  type: DelegationType;
  reason: string;
  startDate: string;
  endDate?: string;
}

@ApiTags('Delegations')
@ApiBearerAuth()
@Controller('delegations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DelegationController {
  constructor(private service: DelegationService) {}

  @Post()
  @Roles(Role.ADMIN, Role.OFFICER)
  @ApiOperation({ summary: 'Create a new delegation' })
  async createDelegation(@Body() body: CreateDelegationBody, @CurrentUser() user: JwtPayload) {
    return this.service.createDelegation(
      {
        fromUserId: user.sub,
        toUserId: body.toUserId,
        type: body.type,
        reason: body.reason,
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : undefined,
      },
      user.sub,
    );
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Revoke a delegation' })
  async revokeDelegation(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.service.revokeDelegation(id, user.sub);
  }

  @Get('my')
  @ApiOperation({ summary: "Get current user's active delegations" })
  async getMyDelegations(@CurrentUser() user: JwtPayload) {
    return this.service.getActiveDelegations(user.sub);
  }

  @Get('admin/all')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get all active delegations (admin)' })
  async getAllDelegations() {
    return this.service.getAllActiveDelegations();
  }
}
