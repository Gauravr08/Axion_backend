import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
} from "class-validator";

export class AnalyzeDto {
  @ApiProperty({
    description: "Natural language geospatial query",
    example: "Show me NDVI vegetation health for Iowa farmland",
    type: String,
    required: true,
    minLength: 10,
    maxLength: 500,
  })
  @IsString({ message: "Query must be a string" })
  @IsNotEmpty({ message: "Query cannot be empty" })
  @MinLength(10, {
    message:
      "Query must be at least 10 characters long for meaningful analysis",
  })
  @MaxLength(500, {
    message: "Query cannot exceed 500 characters",
  })
  @Matches(/^[a-zA-Z0-9\s,.\-?!()]+$/, {
    message:
      "Query contains invalid characters. Only letters, numbers, spaces, and basic punctuation are allowed.",
  })
  query: string;
}
