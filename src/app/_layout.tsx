// 루트 레이아웃: 전역 Provider 와 로그인 여부에 따른 보호 라우팅
// Root layout: global providers and auth-guarded routing
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LoadingView } from '@/components/ui/states';
import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { QueryProvider } from '@/providers/query-provider';
import { AppThemeProvider, useAppTheme } from '@/providers/theme-provider';

function RootNavigator() {
  const { session, loading } = useAuth();
  if (loading) {
    return <LoadingView />;
  }
  const signedIn = !!session;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="invite/[code]" />
      <Stack.Screen name="auth/callback" />
      <Stack.Screen name="reset-password" />
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <ThemedRoot />
    </AppThemeProvider>
  );
}

// 화면 모드 선택을 내비게이션 테마·상태 표시줄에 반영
// Apply the appearance preference to the navigation theme and status bar
function ThemedRoot() {
  const { scheme } = useAppTheme();
  const isDark = scheme === 'dark';
  const base = isDark ? DarkTheme : DefaultTheme;
  const palette = isDark ? Colors.dark : Colors.light;
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      background: palette.background,
      card: palette.surface,
      text: palette.textPrimary,
      border: palette.divider,
      primary: palette.accent,
    },
  };

  return (
    <SafeAreaProvider>
      <QueryProvider>
        <AuthProvider>
          <ThemeProvider value={theme}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <RootNavigator />
          </ThemeProvider>
        </AuthProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
