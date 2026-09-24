export class AiStatusResponseDto {
  configured!: boolean;

  static from(configured: boolean): AiStatusResponseDto {
    return { configured };
  }
}
