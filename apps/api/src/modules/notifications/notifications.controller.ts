import { Controller, Get, Put, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { NotificationsService } from './notifications.service';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get notifications for current user' })
  async getNotifications(
    @CurrentUser() user: JwtPayload,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.service.getNotificationsForUser(user.sub, unreadOnly === 'true');
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@CurrentUser() user: JwtPayload) {
    const count = await this.service.getUnreadCount(user.sub);
    return { count };
  }

  @Put(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  async markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.markAsRead(id, user.sub);
  }

  @Put('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@CurrentUser() user: JwtPayload) {
    return this.service.markAllAsRead(user.sub);
  }
}
