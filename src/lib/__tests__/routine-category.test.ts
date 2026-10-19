// 루틴 카테고리 매핑 단위 테스트
// Unit tests for routine category mapping
import { describe, expect, it } from '@jest/globals';

import { categoryOf } from '@/lib/routine-category';

describe('categoryOf', () => {
  it('maps template titles to categories', () => {
    expect(categoryOf('쓰레기 버리기').key).toBe('trash');
    expect(categoryOf('분리수거').key).toBe('trash');
    expect(categoryOf('화장실 청소').key).toBe('cleaning');
    expect(categoryOf('침구 세탁').key).toBe('laundry');
    expect(categoryOf('냉장고 정리').key).toBe('kitchen');
    expect(categoryOf('화분 물주기').key).toBe('plant');
    expect(categoryOf('정수기 필터 확인').key).toBe('maintenance');
    expect(categoryOf('공과금 납부').key).toBe('bills');
  });

  it('falls back to a generic home icon', () => {
    expect(categoryOf('책 읽기').key).toBe('other');
  });
});
