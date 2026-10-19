// 초대 링크 생성·공유와, 로그인 전에 받은 초대 코드 임시 보관 (U01-2, U02)
// Invite link build/share, and temporary storage of an invite code received before sign-in (U01-2, U02)
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

const PENDING_INVITE_KEY = 'living-routine.pending-invite';
const INVITE_CODE_PATTERN = /^[0-9A-F]{12}$/;
// 보관 코드 유효 시간(ms): 하루 (초대 자체 만료와 별개로 기기에 오래 남지 않게)
// Stored code lifetime in ms: one day (so it does not linger on the device, independent of invite expiry)
const PENDING_TTL_MS = 86_400_000;

export function normalizeInviteCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return INVITE_CODE_PATTERN.test(code) ? code : null;
}

// 앱 스킴(네이티브) 또는 현재 웹 주소 기준 링크
// Link based on the app scheme (native) or the current web origin
export function buildInviteLink(code: string): string {
  return Linking.createURL(`/invite/${code}`);
}

export type ShareResult = 'shared' | 'copied' | 'dismissed' | 'unavailable';

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && (error as { name: unknown }).name === 'AbortError';
}

export async function shareInvite(spaceName: string, code: string): Promise<ShareResult> {
  const link = buildInviteLink(code);
  const message = `“${spaceName}”에 초대해요. 링크를 열거나 앱에서 코드 ${code} 를 입력해 주세요.\n${link}`;
  if (Platform.OS !== 'web') {
    const result = await Share.share({ message });
    return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
  }
  // 웹: 공유 시트 → 클립보드 → 불가 순서. 공유 취소는 실패가 아니다.
  // Web: share sheet → clipboard → unavailable. Cancelling the share sheet is not a failure.
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text: message });
      return 'shared';
    } catch (error: unknown) {
      if (isAbortError(error)) return 'dismissed';
      throw error;
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(message);
    return 'copied';
  }
  return 'unavailable';
}

type PendingInvite = { code: string; savedAt: number };

export async function savePendingInvite(code: string): Promise<void> {
  const value: PendingInvite = { code, savedAt: Date.now() };
  await AsyncStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(value));
}

// 보관된 코드 조회 (만료·형식 오류면 지우고 null)
// Read the stored code (clears and returns null when expired or malformed)
export async function peekPendingInvite(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(PENDING_INVITE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingInvite>;
    const code = typeof parsed.code === 'string' ? normalizeInviteCode(parsed.code) : null;
    if (code && typeof parsed.savedAt === 'number' && Date.now() - parsed.savedAt < PENDING_TTL_MS) {
      return code;
    }
  } catch (error: unknown) {
    console.warn('[invite] malformed pending invite', error);
  }
  await clearPendingInvite();
  return null;
}

export async function clearPendingInvite(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_INVITE_KEY);
}
