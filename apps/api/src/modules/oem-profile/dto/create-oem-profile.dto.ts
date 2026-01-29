import {
  IsString, IsOptional, IsNumber, IsBoolean, IsEnum, Min, Max, MinLength, Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

enum FirmType {
  PROPRIETARY = 'PROPRIETARY',
  PRIVATE_LIMITED = 'PRIVATE_LIMITED',
  LIMITED_COMPANY = 'LIMITED_COMPANY',
  PUBLIC_SECTOR = 'PUBLIC_SECTOR',
  SOCIETY = 'SOCIETY',
}

enum FirmSize {
  COTTAGE = 'COTTAGE',
  MICRO = 'MICRO',
  SMALL = 'SMALL',
  MEDIUM = 'MEDIUM',
  LARGE = 'LARGE',
}

export class CreateOemProfileDto {
  @ApiProperty({ example: 'ABC Pollution Control Pvt. Ltd.' })
  @IsString()
  @MinLength(2)
  companyName: string;

  @ApiProperty({ example: '123, Industrial Area, Phase-II, Gurgaon' })
  @IsString()
  @MinLength(5)
  fullAddress: string;

  @ApiProperty({ example: 'Haryana' })
  @IsString()
  state: string;

  @ApiPropertyOptional({ default: 'India' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ example: '122002' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'PIN code must be 6 digits' })
  pinCode: string;

  @ApiProperty({ example: '9876543210' })
  @IsString()
  contactNo: string;

  @ApiProperty({ example: '06AABCU9603R1ZM' })
  @IsString()
  @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, {
    message: 'Invalid GST registration number',
  })
  gstRegistrationNo: string;

  @ApiProperty({ example: 'AABCU9603R' })
  @IsString()
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, { message: 'Invalid PAN number' })
  panNo: string;

  @ApiProperty({ enum: FirmType })
  @IsEnum(FirmType)
  firmType: FirmType;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  firmAreaSqm?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  employeeCount?: number;

  @ApiPropertyOptional({ example: 28.4595 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  gpsLatitude?: number;

  @ApiPropertyOptional({ example: 77.0266 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  gpsLongitude?: number;

  @ApiPropertyOptional({ enum: FirmSize })
  @IsOptional()
  @IsEnum(FirmSize)
  firmSize?: FirmSize;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  udyamRegistrationNo?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isMSE?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isStartup?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isLocalSupplier?: boolean;

  @ApiPropertyOptional({ example: 65 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  localContentPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dpiitRecognitionNo?: string;
}

export class UpdateOemProfileDto extends CreateOemProfileDto {}
