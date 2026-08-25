import { describe, expect, it } from 'vitest';
import type { UrlResponse } from '@/types';
import { applyMockUrlUpdate } from '../mockUrlUpdate';

const buildUrl = (overrides: Partial<UrlResponse> = {}): UrlResponse => ({
  id: 'mock-url-1',
  short_code: 'demo1',
  original_url: 'https://example.com/original',
  short_url: 'https://aka.money/demo1',
  title: 'Original title',
  description: 'Original description',
  image_url: 'https://storage.example.com/existing.jpg',
  created_at: 1700000000000,
  updated_at: 1700000000000,
  expires_at: 1800000000000,
  is_active: true,
  click_count: 10,
  ...overrides
});

describe('applyMockUrlUpdate', () => {
  it('leaves omitted fields untouched', () => {
    const result = applyMockUrlUpdate(buildUrl(), { is_active: false }, 1700000009999);

    expect(result.title).toBe('Original title');
    expect(result.description).toBe('Original description');
    expect(result.image_url).toBe('https://storage.example.com/existing.jpg');
    expect(result.expires_at).toBe(1800000000000);
    expect(result.is_active).toBe(false);
    expect(result.updated_at).toBe(1700000009999);
  });

  it('treats an explicitly undefined field as an omission, not a clear', () => {
    const result = applyMockUrlUpdate(buildUrl(), { title: undefined, description: undefined }, 1);

    expect(result.title).toBe('Original title');
    expect(result.description).toBe('Original description');
  });

  it('clears a field when it is sent as an explicit null', () => {
    const result = applyMockUrlUpdate(buildUrl(), { title: null, description: null, image_url: null }, 1);

    expect(result.title).toBeUndefined();
    expect(result.description).toBeUndefined();
    expect(result.image_url).toBeUndefined();
  });

  it('clears the expiry when it is sent as an explicit null', () => {
    const result = applyMockUrlUpdate(buildUrl(), { expires_at: null }, 1);

    expect(result.expires_at).toBeUndefined();
  });

  it('writes new values for provided fields', () => {
    const result = applyMockUrlUpdate(
      buildUrl(),
      {
        original_url: 'https://example.com/updated',
        title: 'New title',
        description: 'New description',
        image_url: 'https://storage.example.com/new.jpg',
        expires_at: 1900000000000
      },
      1
    );

    expect(result.original_url).toBe('https://example.com/updated');
    expect(result.title).toBe('New title');
    expect(result.description).toBe('New description');
    expect(result.image_url).toBe('https://storage.example.com/new.jpg');
    expect(result.expires_at).toBe(1900000000000);
  });

  it('never mutates the source record', () => {
    const source = buildUrl();
    applyMockUrlUpdate(source, { title: null, is_active: false }, 1);

    expect(source.title).toBe('Original title');
    expect(source.is_active).toBe(true);
  });

  it('preserves identity fields the API never lets you change', () => {
    const result = applyMockUrlUpdate(buildUrl(), { title: 'New title' }, 1);

    expect(result.id).toBe('mock-url-1');
    expect(result.short_code).toBe('demo1');
    expect(result.click_count).toBe(10);
    expect(result.created_at).toBe(1700000000000);
  });
});
