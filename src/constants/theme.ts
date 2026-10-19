// Soft Native 디자인 토큰 v2: 따뜻한 크림 바탕 + 진한 초록 강조 + 파스텔 보조색.
// 03 문서 토큰은 "초안, 확정 아님" 이므로 사용자 피드백(흐린 톤 개선)과 참고 이미지의 톤(#FFFEF7·#FFF6E6·#E8F2EA·#333333)을 반영해 재설계.
// 대비는 scripts/contrast-check.mjs 로 실측한다. 다크는 독립 시맨틱 토큰.
// Soft Native design tokens v2: warm cream base + deep green accent + pastel supports.
// Doc 03 tokens are drafts, so redesigned per user feedback (too faded) and the reference mood colors.
// Contrast is measured by scripts/contrast-check.mjs. Dark mode uses independent semantic tokens.
import { Platform } from 'react-native';

import { useAppTheme } from '@/providers/theme-provider';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  // 선택된 칩 등 선택 상태 (초록 대신 중립 먹색/아이보리 → 녹색 과다 방지)
  // Selected state for chips etc. (neutral ink/ivory instead of green to avoid overusing green)
  selected: string;
  onSelected: string;
  divider: string;
  border: string;
  warm: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  heart: string;
  shadow: string;
};

export const Colors: { light: ThemeColors; dark: ThemeColors } = {
  light: {
    background: '#FBF7EE',
    surface: '#FFFFFF',
    surfaceMuted: '#F5EFE2',
    textPrimary: '#232825',
    textSecondary: '#535953',
    accent: '#1F5A41',
    accentSoft: '#E6F0E8',
    onAccent: '#FFFFFF',
    selected: '#2B2A27',
    onSelected: '#FFFFFF',
    divider: '#EFE8DA',
    border: '#E2D9C6',
    warm: '#FFF1DA',
    warning: '#8A5300',
    warningSoft: '#FFF0D6',
    danger: '#B42318',
    dangerSoft: '#FDE8E4',
    heart: '#E5604F',
    shadow: 'rgba(91, 72, 37, 0.10)',
  },
  dark: {
    // 녹색 기운 없는 따뜻한 중립 회색
    // Warm neutral grays without a green cast
    background: '#151413',
    surface: '#1F1E1C',
    surfaceMuted: '#2A2826',
    textPrimary: '#F2F0EC',
    textSecondary: '#BEB8AF',
    // 다크에서는 녹색 대신 따뜻한 아이보리 중립 강조 (사용자 피드백: 녹색 톤 과다)
    // Dark uses a warm ivory neutral accent instead of green (user feedback: too green)
    accent: '#E6DFD3',
    accentSoft: '#2E2B27',
    onAccent: '#1F1E1C',
    selected: '#F2F0EC',
    onSelected: '#1F1E1C',
    divider: '#2E2C29',
    border: '#3E3B37',
    warm: '#3A2F1E',
    warning: '#F2C46D',
    warningSoft: '#3A2F1E',
    danger: '#FF8A80',
    dangerSoft: '#3B1F1D',
    heart: '#FF8A7A',
    shadow: 'rgba(0, 0, 0, 0.35)',
  },
};

// 카테고리 아이콘 파스텔 (배경/전경). 다크는 채도를 낮춘 짙은 배경 + 밝은 전경.
// Pastel category palettes (background/foreground). Dark uses deep backgrounds with light foregrounds.
export type CategoryTone = 'green' | 'blue' | 'peach' | 'yellow' | 'purple' | 'pink' | 'teal' | 'gray';

export const CategoryColors: Record<'light' | 'dark', Record<CategoryTone, { bg: string; fg: string }>> = {
  light: {
    green: { bg: '#E3F1E7', fg: '#1F5A41' },
    blue: { bg: '#E3ECFA', fg: '#2B5BA8' },
    peach: { bg: '#FDE9DD', fg: '#B2532A' },
    yellow: { bg: '#FFF1CC', fg: '#8A5A00' },
    purple: { bg: '#EEE6FA', fg: '#6342A8' },
    pink: { bg: '#FCE4EA', fg: '#B23A5E' },
    teal: { bg: '#DDF2F1', fg: '#1C6B66' },
    gray: { bg: '#EEEDE8', fg: '#4D524E' },
  },
  dark: {
    green: { bg: '#2A2D2A', fg: '#C3D1C6' },
    blue: { bg: '#1E2B42', fg: '#A8C4F5' },
    peach: { bg: '#3C2620', fg: '#F7B999' },
    yellow: { bg: '#3A3018', fg: '#F2D27D' },
    purple: { bg: '#2E2442', fg: '#CDB8F5' },
    pink: { bg: '#3E2129', fg: '#F5A9BF' },
    teal: { bg: '#272D2D', fg: '#BCD3D1' },
    gray: { bg: '#2A2E2B', fg: '#C9CFCA' },
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const Radius = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const FontSize = {
  caption: 12,
  small: 14,
  body: 16,
  title: 20,
  headline: 26,
} as const;

// 최소 터치 영역 (접근성)
// Minimum touch target (accessibility)
export const MIN_TOUCH = 44;

// 완료 피드백 모션 길이(ms), 03 문서 권장 150~250ms
// Completion feedback duration in ms (03 recommends 150~250ms)
export const FEEDBACK_MOTION_MS = 200;

// 콘텐츠 최대 폭 (웹·태블릿)
// Max content width (web/tablet)
export const MAX_CONTENT_WIDTH = 640;

// 사용자 화면 모드 선택(시스템/라이트/다크)을 반영한 색
// Colors honoring the user's appearance preference (system/light/dark)
export function useThemeColors(): ThemeColors {
  const { scheme } = useAppTheme();
  return scheme === 'dark' ? Colors.dark : Colors.light;
}

export function useCategoryColors(): Record<CategoryTone, { bg: string; fg: string }> {
  const { scheme } = useAppTheme();
  return CategoryColors[scheme];
}

// 카드 그림자 (웹은 boxShadow, 네이티브는 elevation/shadow*)
// Card shadow (boxShadow on web, elevation/shadow* on native)
export function cardShadow(colors: ThemeColors) {
  return Platform.select({
    web: { boxShadow: `0 2px 12px ${colors.shadow}` },
    default: {
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
  });
}
