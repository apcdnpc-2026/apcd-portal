import { Controller, Get, Post, Delete, Body, UseGuards, Headers } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

import { PushService } from './push.service';

interface SubscribeDto {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface UnsubscribeDto {
  endpoint: string;
}

interface SendNotificationDto {
  userId?: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
}

@ApiTags('Push Notifications')
@Controller('push')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PushController {
  constructor(private service: PushService) {}

  @Get('vapid-public-key')
  @Public()
  @ApiOperation({ summary: 'Get VAPID public key for push subscription' })
  getVapidPublicKey() {
    return { publicKey: this.service.getVapidPublicKey() };
  }

  @Post('subscribe')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Subscribe to push notifications' })
  async subscribe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SubscribeDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.service.subscribe(user.sub, dto, userAgent);
  }

  @Delete('unsubscribe')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unsubscribe from push notifications' })
  async unsubscribe(@CurrentUser() user: JwtPayload, @Body() dto: UnsubscribeDto) {
    return this.service.unsubscribe(user.sub, dto.endpoint);
  }

  @Post('send')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Send push notification (admin only)' })
  async sendNotification(@Body() dto: SendNotificationDto) {
    const { userId, title, body, url, tag, icon } = dto;
    const payload = { title, body, url, tag, icon };

    if (userId) {
      return this.service.sendNotification(userId, payload);
    }

    // Broadcast to all if no userId specified
    return this.service.sendToAll(payload);
  }

  @Get('subscriptions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user push subscriptions' })
  async getSubscriptions(@CurrentUser() user: JwtPayload) {
    return this.service.getUserSubscriptions(user.sub);
  }
}
