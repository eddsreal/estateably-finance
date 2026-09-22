import 'reflect-metadata';
import { Injectable } from '@nestjs/common';
import { IsString } from 'class-validator';

export class SampleDto {
  @IsString()
  name!: string;
}

@Injectable()
export class SampleService {
  constructor(private readonly dto: SampleDto) {}

  greet(): string {
    return this.dto.name;
  }
}
