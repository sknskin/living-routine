// T01 동시 완료 실측: 두 사용자가 같은 회차를 병렬로 완료 시도 → 정확히 1건만 확정되어야 한다.
// T01 live concurrency check: two users complete the same occurrence in parallel → exactly one must win.
// 로컬 Supabase 전용. 실행: node --env-file=.env.local scripts/concurrency-check.mjs
// Local Supabase only. Run: node --env-file=.env.local scripts/concurrency-check.mjs
import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const LOCAL_HOST_PATTERN = /^http:\/\/(127\.0\.0\.1|localhost)/;
// 사용자별 병렬 시도 수
// Parallel attempts per user
const ATTEMPTS_PER_USER = 10;
const PASSWORD = 'concurrency-check';

if (!URL || !KEY || !LOCAL_HOST_PATTERN.test(URL)) {
  console.error('local Supabase URL/key required (refusing to run against non-local targets)');
  process.exit(1);
}

function newClient() {
  return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signUp(client, label) {
  const email = `${label}-${Date.now()}@concurrency.local`;
  const { error } = await client.auth.signUp({ email, password: PASSWORD, options: { data: { nickname: label } } });
  if (error) throw new Error(`sign-up ${label}: ${error.message}`);
}

async function rpc(client, fn, args) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

async function main() {
  const a = newClient();
  const b = newClient();
  await signUp(a, 'racer-a');
  await signUp(b, 'racer-b');

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const { space_id: spaceId } = await rpc(a, 'create_space', { p_name: '동시성', p_timezone: 'Asia/Seoul' });
  const { code } = await rpc(a, 'create_invitation', { p_space_id: spaceId });
  await rpc(b, 'accept_invite', { p_code: code });
  const { routine_id: routineId } = await rpc(a, 'upsert_routine', {
    p_space_id: spaceId,
    p_routine_id: null,
    p_title: '동시 완료',
    p_mode: 'after_resolution',
    p_rule: { interval_days: 1, start_date: today },
    p_assignment_mode: 'free',
    p_assignees: [],
    p_notify_enabled: false,
  });

  const { data: open, error } = await a
    .from('routine_occurrences')
    .select('id')
    .eq('routine_id', routineId)
    .eq('status', 'scheduled')
    .single();
  if (error) throw new Error(`load occurrence: ${error.message}`);

  const attempts = [];
  for (let i = 0; i < ATTEMPTS_PER_USER; i += 1) {
    for (const client of [a, b]) {
      attempts.push(client.rpc('complete_occurrence', { p_occurrence_id: open.id, p_request_id: crypto.randomUUID() }));
    }
  }
  const results = await Promise.all(attempts);
  const successes = results.filter((result) => !result.error).length;
  const alreadyResolved = results.filter((result) => result.error?.message.startsWith('ALREADY_RESOLVED')).length;
  const otherErrors = results.filter((result) => result.error && !result.error.message.startsWith('ALREADY_RESOLVED'));

  const { count: completionEvents } = await a
    .from('routine_events')
    .select('id', { count: 'exact', head: true })
    .eq('occurrence_id', open.id)
    .eq('event_type', 'completed');
  const { count: openAfter } = await a
    .from('routine_occurrences')
    .select('id', { count: 'exact', head: true })
    .eq('routine_id', routineId)
    .eq('status', 'scheduled');

  console.log(JSON.stringify({ attempts: results.length, successes, alreadyResolved, otherErrors: otherErrors.length, completionEvents, openAfter }));
  const passed = successes === 1 && alreadyResolved === results.length - 1 && completionEvents === 1 && openAfter === 1;
  if (!passed) {
    for (const failure of otherErrors) console.error(failure.error.message);
    console.error('T01 FAILED');
    process.exit(1);
  }
  console.log('T01 PASSED: exactly one completion confirmed, one follow-up occurrence');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
