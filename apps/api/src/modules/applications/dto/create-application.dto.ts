import {
  IsString, IsOptional, IsBoolean, IsNumber, IsArray, ValidateNested, IsEnum, IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ContactPersonDto {
  @ApiProperty({ enum: ['COMMERCIAL', 'TECHNICAL'] })
  @IsString()
  type: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  designation?: string;

  @ApiProperty()
  @IsString()
  mobileNo: string;

  @ApiProperty()
  @IsString()
  email: string;
}

export class ApcdSelectionDto {
  @ApiProperty()
  @IsUUID()
  apcdTypeId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isManufactured?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  seekingEmpanelment?: boolean;

  @ApiPropertyOptional({ enum: ['BOILER_FURNACE_TFH', 'NON_BOILER_NON_FURNACE', 'BOTH'] })
  @IsOptional()
  @IsString()
  installationCategory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  designCapacityRange?: string;
}

export class CreateApplicationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  currentStep?: number;

  // Step 2: Contact persons
  @ApiPropertyOptional({ type: [ContactPersonDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactPersonDto)
  contactPersons?: ContactPersonDto[];

  // Step 3: Financials
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  turnoverYear1?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  turnoverYear2?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  turnoverYear3?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasISO9001?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasISO14001?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasISO45001?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  otherStandards?: string;

  // Step 4: Compliance
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isBlacklisted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  blacklistDetails?: string;

  // Step 5: APCD selection
  @ApiPropertyOptional({ type: [ApcdSelectionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApcdSelectionDto)
  apcdSelections?: ApcdSelectionDto[];

  // Step 6: Quality
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasGrievanceSystem?: boolean;

  // Step 9: Declaration
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  declarationAccepted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declarationSignatory?: string;
}

export class UpdateApplicationDto extends CreateApplicationDto {}
