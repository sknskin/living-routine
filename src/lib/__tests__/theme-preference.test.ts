// 화면 모드 계산 단위 테스트
// Unit tests for appearance resolution
import { describe, expect, it } from '@jest/globals';

import { resolveScheme } from '@/lib/theme-preference';

describe('resolveScheme', () => {
  it('follows the OS when set to system', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', null)).toBe('light');
  });

  it('forces the chosen scheme regardless of the OS', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });
});
