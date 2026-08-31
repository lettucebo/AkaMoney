import { describe, expect, it, vi } from 'vitest';
import { app } from '../index';
import type { Env, Url } from '../types';

function createUrl(overrides: Partial<Url> = {}): Url {
  return {
    id: 'url-1',
    short_code: 'abc123',
    original_url: 'https://example.com/page',
    user_id: null,
    title: null,
    description: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    expires_at: null,
    is_active: 1,
    click_count: 0,
    ...overrides,
  };
}

function createStatement(firstResult: unknown, runResult: Promise<unknown> = Promise.resolve({ success: true })) {
  const statement = {
    bind: vi.fn(),
    first: vi.fn<() => Promise<unknown>>().mockResolvedValue(firstResult),
    run: vi.fn<() => Promise<unknown>>().mockReturnValue(runResult),
  };
  statement.bind.mockReturnValue(statement);
  return statement;
}

function createEnv(url: Url | null, clickRunResult?: Promise<unknown>) {
  const lookupStatement = createStatement(url);
  const insertStatement = createStatement(null, clickRunResult);
  const updateStatement = createStatement(null);
  const statements = [lookupStatement, insertStatement, updateStatement];
  const db = {
    prepare: vi.fn(() => {
      const statement = statements.shift();
      if (!statement) {
        throw new Error('Unexpected D1 prepare call');
      }
      return statement;
    }),
  } as unknown as D1Database;
  const executionCtx = {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;

  return {
    env: { DB: db, ENVIRONMENT: 'test' } satisfies Env,
    executionCtx,
    lookupStatement,
    insertStatement,
    updateStatement,
  };
}

describe('redirect routes', () => {
  it('returns 204 and expected CORS headers for OPTIONS requests', async () => {
    const { env, executionCtx } = createEnv(null);

    const response = await app.fetch(
      new Request('https://aka.money/abc123', { method: 'OPTIONS' }),
      env,
      executionCtx
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    expect(await response.text()).toBe('');
    expect(executionCtx.waitUntil).not.toHaveBeenCalled();
  });

  it('returns a 302 immediately and schedules click recording without awaiting analytics', async () => {
    const pendingClickWrite = new Promise(() => {});
    const { env, executionCtx, insertStatement } = createEnv(createUrl(), pendingClickWrite);

    const responsePromise = Promise.resolve(
      app.fetch(
        new Request('https://aka.money/abc123'),
        env,
        executionCtx
      )
    );

    await expect(
      Promise.race([
        responsePromise.then((response) => response.status),
        new Promise((resolve) => setTimeout(() => resolve('timed-out'), 20)),
      ])
    ).resolves.toBe(302);

    const response = await responsePromise;
    expect(response.headers.get('Location')).toBe('https://example.com/page');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(insertStatement.run).toHaveBeenCalledTimes(1);
    expect(executionCtx.waitUntil).toHaveBeenCalledTimes(1);
  });

  it('preserves 404 behavior for unknown short codes', async () => {
    const { env, executionCtx } = createEnv(null);

    const response = await app.fetch(
      new Request('https://aka.money/missing'),
      env,
      executionCtx
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Not Found',
      message: 'Short URL not found',
    });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(executionCtx.waitUntil).not.toHaveBeenCalled();
  });

  it('preserves 410 behavior for expired short codes', async () => {
    const { env, executionCtx } = createEnv(createUrl({ expires_at: Date.now() - 1 }));

    const response = await app.fetch(
      new Request('https://aka.money/expired'),
      env,
      executionCtx
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: 'Gone',
      message: 'This short URL has expired',
    });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(executionCtx.waitUntil).not.toHaveBeenCalled();
  });
});
