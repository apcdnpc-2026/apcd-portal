import { Module } from '@nestjs/common';

import { DomainEventController } from './domain-event.controller';
import { DomainEventService } from './domain-event.service';

@Module({
  controllers: [DomainEventController],
  providers: [DomainEventService],
  exports: [DomainEventService],
})
export class DomainEventModule {}
