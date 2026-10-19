// 화면 모드 선택(시스템/라이트/다크): 순수 계산 (저장은 theme-storage.ts)
// Appearance preference (system/light/dark): pure resolution (storage lives in theme-storage.ts)

export type ThemePreference = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

const PREFERENCES: ThemePreference[] = ['system', 'light', 'dark'];

export const THEME_PREFERENCE_LABEL: Record<ThemePreference, string> = {
  system: '시스템 설정 따르기',
  light: '라이트',
  dark: '다크',
};

export const THEME_PREFERENCE_ORDER = PREFERENCES;

// 선택값과 OS 값으로 실제 적용 모드 계산 (OS 값을 모르면 라이트)
// Resolve the effective scheme from the preference and the OS value (light when the OS value is unknown)
export function resolveScheme(preference: ThemePreference, system: string | null | undefined): ColorScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

export function isThemePreference(value: string | null): value is ThemePreference {
  return value !== null && (PREFERENCES as string[]).includes(value);
}
