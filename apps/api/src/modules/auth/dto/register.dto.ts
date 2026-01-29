import { IsEmail, IsString, MinLength, Matches, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'oem@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Str0ng@Pass!' })
  @IsString()
  @MinLength(8)
  @Matches(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
  @Matches(/[a-z]/, { message: 'Password must contain at least one lowercase letter' })
  @Matches(/[0-9]/, { message: 'Password must contain at least one number' })
  @Matches(/[!@#$%^&*]/, { message: 'Password must contain at least one special character' })
  password: string;

  @ApiProperty({ example: 'Rajesh' })
  @IsString()
  @MinLength(2)
  firstName: string;

  @ApiProperty({ example: 'Kumar' })
  @IsString()
  @MinLength(2)
  lastName: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  phone?: string;
}
