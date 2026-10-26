import { describe, it, expect, vi } from 'vitest';
import { pagination } from '../src/utils/pagination.js';
import { dateQuery } from '../src/utils/queries.js';
import { resourceId } from '../src/utils/validation.js';
import { errorHandler } from '../src/middleware/error-handler.js';

describe('validation without a database', () => {
  it('caps even very large integer limits before conversion', () => {
    expect(pagination({ limit: '9999999999999999999999' })).toEqual({ page: 1, limit: 50, skip: 0 });
  });
  it.each(['0', '-1', '1.2', 'abc', '', '1e2', 'Infinity', ' 2', ['2'], {}, '9007199254740992'])(
    'rejects invalid page %j', (page) => expect(() => pagination({ page })).toThrow('page and limit must be positive integers'),
  );
  it.each(['yesterday', '2026-02-30', '2026-13-01', '2025-02-29', '2026-01-01T24:00:00Z',
    '2026-01-01T10:61:00Z', '2026-01-01T10:00:00', '', ['2026-01-01']])(
    'rejects invalid date %j', (date) => expect(() => dateQuery(date)).toThrow('from and to must be valid dates'),
  );
  it('accepts leap days and ISO timestamps with explicit offsets', () => {
    expect(dateQuery('2024-02-29').toISOString()).toBe('2024-02-29T00:00:00.000Z');
    expect(dateQuery('2026-01-01T05:30:00+05:30').toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
  it.each(['1.1', '0', '-1', '2147483648', '1abc', {}, null, true])(
    'rejects unsupported resource ID %j', (id) => expect(() => resourceId(id)).toThrow('id must be a positive integer'),
  );
});

describe('safe error responses', () => {
  it.each(['P1000', 'P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'ECONNREFUSED', 'ETIMEDOUT'])(
    'maps database availability error %s', (code) => {
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      errorHandler({ code, message: 'secret connection string' }, {}, res, vi.fn());
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: 'Database unavailable' });
    },
  );
  it('does not misclassify unexpected database errors as missing resources', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    errorHandler({ name: 'Error', code: 'P9999', message: 'secret' }, {}, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    log.mockRestore();
  });
});
