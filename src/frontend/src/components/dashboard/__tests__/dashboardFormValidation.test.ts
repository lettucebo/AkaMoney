import { describe, it, expect } from 'vitest';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, validateImageFile, validateShortCode } from '../dashboardFormValidation';

const buildFile = (type: string, size: number): File => {
  const file = new File([new Uint8Array(Math.max(size, 0))], 'photo.png', { type });
  return file;
};

describe('validateShortCode', () => {
  it('requires a non-empty value', () => {
    expect(validateShortCode('')).toBe('請輸入短代碼');
    expect(validateShortCode('   ')).toBe('請輸入短代碼');
  });

  it('rejects codes shorter than 3 characters', () => {
    expect(validateShortCode('ab')).toMatch(/3.{0,2}20/);
  });

  it('rejects codes longer than 20 characters', () => {
    expect(validateShortCode('a'.repeat(21))).toMatch(/3.{0,2}20/);
  });

  it('rejects disallowed characters', () => {
    expect(validateShortCode('bad code!')).toMatch(/3.{0,2}20/);
    expect(validateShortCode('bad/code')).toMatch(/3.{0,2}20/);
  });

  it('accepts letters, numbers, hyphens, and underscores between 3 and 20 chars', () => {
    expect(validateShortCode('my-link_8')).toBeNull();
    expect(validateShortCode('abc')).toBeNull();
    expect(validateShortCode('a'.repeat(20))).toBeNull();
  });

  it('trims surrounding whitespace before validating', () => {
    expect(validateShortCode('  my-link  ')).toBeNull();
  });
});

describe('validateImageFile', () => {
  it('accepts every allowed image type under the size cap', () => {
    for (const type of ALLOWED_IMAGE_TYPES) {
      expect(validateImageFile(buildFile(type, 1024))).toBeNull();
    }
  });

  it('rejects a disallowed mime type', () => {
    expect(validateImageFile(buildFile('application/pdf', 1024))).toMatch(/JPEG|不支援/);
  });

  it('rejects a file over the 10MB cap', () => {
    expect(validateImageFile(buildFile('image/png', MAX_IMAGE_BYTES + 1))).toMatch(/10\s?MB|過大/i);
  });

  it('accepts a file exactly at the size cap', () => {
    expect(validateImageFile(buildFile('image/png', MAX_IMAGE_BYTES))).toBeNull();
  });
});
