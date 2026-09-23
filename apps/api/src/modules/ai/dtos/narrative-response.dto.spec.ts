import { describe, expect, it } from 'vitest';
import { NarrativeResponseDto } from './narrative-response.dto';

describe('NarrativeResponseDto.from', () => {
  it('wraps the narrative text in the contract shape', () => {
    expect(NarrativeResponseDto.from('Uber led your spending.')).toEqual({
      narrative: 'Uber led your spending.',
    });
  });
});
