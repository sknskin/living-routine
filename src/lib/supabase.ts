import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/config';
import type { Database } from '@/types/database';

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  // 설정 누락은 즉시 드러나게 한다
  // Surface missing configuration immediately
  throw new Error('Supabase URL/publishable key missing. Copy .env.example to .env.local.');
}

// 웹 정적 렌더링(SSR) 단계에는 window 가 없으므로 세션 저장소를 쓰지 않는다
// During web static rendering (SSR) there is no window, so skip session storage
const isServer = typeof window === 'undefined';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: isServer ? undefined : AsyncStorage,
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    detectSessionInUrl: false,
    // 메일 링크(가입 인증·비밀번호 재설정)는 PKCE 코드로 받아 /auth/callback 에서 세션으로 교환
    // Email links (sign-up confirmation, password reset) use PKCE codes exchanged at /auth/callback
    flowType: 'pkce',
  },
});
