// 화면 모드 상태: 기본은 시스템 연동(D10), 사용자가 고르면 이 기기에서 라이트/다크 고정
// Appearance state: system-linked by default (D10); when chosen, light/dark is fixed on this device
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';

import { resolveScheme, type ColorScheme, type ThemePreference } from '@/lib/theme-preference';
import { loadThemePreference, saveThemePreference } from '@/lib/theme-storage';

type ThemeState = {
  preference: ThemePreference;
  scheme: ColorScheme;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeState>({ preference: 'system', scheme: 'light', setPreference: () => undefined });

// 네이티브 기본 컴포넌트(스위치·알림창 등)도 같은 모드를 따르게 OS 값 재정의 (웹은 지원하지 않음)
// Override the OS value so native components (switches, alerts) follow too (not supported on web)
function applyNativeOverride(preference: ThemePreference) {
  if (Platform.OS === 'web' || typeof Appearance.setColorScheme !== 'function') return;
  Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    loadThemePreference()
      .then((saved) => {
        setPreferenceState(saved);
        applyNativeOverride(saved);
      })
      .catch((error: unknown) => console.warn('[theme] load failed', error));
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    applyNativeOverride(next);
    saveThemePreference(next).catch((error: unknown) => console.warn('[theme] save failed', error));
  }, []);

  // 네이티브에서 "시스템" 이 아닌 값으로 재정의하면 useColorScheme 도 그 값을 돌려주므로 결과는 같다
  // On native, a non-system override also changes useColorScheme, so the result is consistent
  const scheme = resolveScheme(preference, system);
  const value = useMemo(() => ({ preference, scheme, setPreference }), [preference, scheme, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeState {
  return useContext(ThemeContext);
}
