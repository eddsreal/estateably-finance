export class NarrativeResponseDto {
  narrative!: string;

  static from(narrative: string): NarrativeResponseDto {
    return { narrative };
  }
}
