import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { DomainEventService } from './domain-event.service';

@ApiTags('Domain Events')
@ApiBearerAuth()
@Controller('domain-events')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class DomainEventController {
  constructor(private readonly domainEventService: DomainEventService) {}

  @Get(':aggregateType/:aggregateId')
  @ApiOperation({ summary: 'Get all events for an aggregate' })
  @ApiParam({ name: 'aggregateType', description: 'Type of aggregate (e.g., Application)' })
  @ApiParam({ name: 'aggregateId', description: 'ID of the aggregate' })
  async getEvents(
    @Param('aggregateType') aggregateType: string,
    @Param('aggregateId') aggregateId: string,
  ) {
    const events = await this.domainEventService.getEvents(aggregateType, aggregateId);
    return {
      aggregateType,
      aggregateId,
      eventCount: events.length,
      events,
    };
  }

  @Get('correlation/:correlationId')
  @ApiOperation({ summary: 'Get all events in a correlation chain' })
  @ApiParam({ name: 'correlationId', description: 'Correlation ID linking related events' })
  async getEventsByCorrelation(@Param('correlationId') correlationId: string) {
    const events = await this.domainEventService.getEventsByCorrelation(correlationId);
    return {
      correlationId,
      eventCount: events.length,
      events,
    };
  }

  @Get(':aggregateType/:aggregateId/state')
  @ApiOperation({ summary: 'Reconstruct current state of an aggregate from events' })
  @ApiParam({ name: 'aggregateType', description: 'Type of aggregate (e.g., Application)' })
  @ApiParam({ name: 'aggregateId', description: 'ID of the aggregate' })
  async reconstructState(
    @Param('aggregateType') aggregateType: string,
    @Param('aggregateId') aggregateId: string,
  ) {
    return this.domainEventService.reconstructState(aggregateType, aggregateId);
  }
}
