// 루틴 이름 키워드 → 카테고리 아이콘·색 (표시 전용, DB 저장 없음)
// Routine title keywords → category icon and tone (display only, not stored)
import type Ionicons from '@expo/vector-icons/Ionicons';

import type { CategoryTone } from '@/constants/theme';

export type RoutineCategory = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: CategoryTone;
};

// 앞쪽 규칙이 우선 (예: "분리수거" 는 "청소"보다 먼저)
// Earlier rules win (e.g. "분리수거" before "청소")
const RULES: { pattern: RegExp; category: RoutineCategory }[] = [
  { pattern: /분리수거|재활용|쓰레기/, category: { key: 'trash', icon: 'trash-outline', tone: 'teal' } },
  { pattern: /빨래|세탁|침구|이불|건조/, category: { key: 'laundry', icon: 'shirt-outline', tone: 'blue' } },
  { pattern: /설거지|요리|주방|냉장고|식사|밥/, category: { key: 'kitchen', icon: 'restaurant-outline', tone: 'peach' } },
  { pattern: /장보기|구매|마트|사기|우유|생필품/, category: { key: 'shopping', icon: 'cart-outline', tone: 'yellow' } },
  { pattern: /강아지|고양이|반려|산책|사료|펫/, category: { key: 'pet', icon: 'paw-outline', tone: 'pink' } },
  { pattern: /차량|자동차|주유|세차/, category: { key: 'car', icon: 'car-outline', tone: 'purple' } },
  { pattern: /공과금|요금|관리비|납부|월세|카드/, category: { key: 'bills', icon: 'receipt-outline', tone: 'purple' } },
  { pattern: /화분|식물|물주기|정원/, category: { key: 'plant', icon: 'leaf-outline', tone: 'green' } },
  { pattern: /필터|정수기|점검|교체/, category: { key: 'maintenance', icon: 'construct-outline', tone: 'gray' } },
  { pattern: /청소|청소기|화장실|욕실|걸레|먼지|정리/, category: { key: 'cleaning', icon: 'sparkles-outline', tone: 'green' } },
];

const FALLBACK: RoutineCategory = { key: 'other', icon: 'home-outline', tone: 'gray' };

export function categoryOf(title: string): RoutineCategory {
  return RULES.find((rule) => rule.pattern.test(title))?.category ?? FALLBACK;
}
