// 화면 모드 선택의 기기 저장 (계정이 아닌 이 기기에만)
// Per-device storage of the appearance preference (this device only, not the account)
import AsyncStorage from '@react-native-async-storage/async-storage';

import { isThemePreference, type ThemePreference } from '@/lib/theme-preference';

const STORAGE_KEY = 'living-routine.theme-preference';

export async function loadThemePreference(): Promise<ThemePreference> {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  return isThemePreference(value) ? value : 'system';
}

export async function saveThemePreference(preference: ThemePreference): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, preference);
}
