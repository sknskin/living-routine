// 인증 메일 링크가 돌아올 앱 주소 (웹: 현재 주소, 네이티브: 앱 스킴)
// App URL that auth email links return to (web: current origin, native: app scheme)
import * as Linking from 'expo-linking';

export type AuthNext = 'home' | 'reset';

export function authRedirectUrl(next: AuthNext): string {
  return Linking.createURL('/auth/callback', { queryParams: { next } });
}
