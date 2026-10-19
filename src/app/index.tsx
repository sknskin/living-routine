// 진입 경로: 로그인 여부에 따라 홈 또는 로그인으로 이동
// Entry route: go to home or sign-in depending on auth
import { Redirect } from 'expo-router';

import { useAuth } from '@/providers/auth-provider';

export default function Index() {
  const { session } = useAuth();
  return <Redirect href={session ? '/home' : '/sign-in'} />;
}
