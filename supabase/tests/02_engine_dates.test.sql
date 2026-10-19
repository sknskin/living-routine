-- 날짜 규칙 테스트: 월말·윤년·주간·간격 (T08)
-- Date rule tests: month end, leap year, weekly, intervals (T08)
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- 매월 31일은 없는 달에 말일로 보정
-- Monthly day 31 clamps to the last day in shorter months
select ok(public.rule_matches('{"freq":"monthly","day":31,"interval":1,"start_date":"2027-01-01"}', '2027-02-28'), 'T08: Feb 28 in non-leap year');
select ok(public.rule_matches('{"freq":"monthly","day":31,"interval":1,"start_date":"2027-01-01"}', '2028-02-29'), 'T08: Feb 29 in leap year');
select ok(not public.rule_matches('{"freq":"monthly","day":31,"interval":1,"start_date":"2027-01-01"}', '2028-02-28'), 'T08: not Feb 28 in leap year');
select ok(public.rule_matches('{"freq":"monthly","day":31,"interval":1,"start_date":"2027-01-01"}', '2027-03-31'), 'T08: back to 31 in March');
select ok(public.rule_matches('{"freq":"monthly","day":31,"interval":1,"start_date":"2027-01-01"}', '2027-04-30'), 'T08: Apr 30');

-- 주간: 0=일요일, 격주
-- Weekly: 0=Sunday, every other week
select ok(public.rule_matches('{"freq":"weekly","weekdays":[0],"interval":1,"start_date":"2026-10-01"}', '2026-10-18'), 'weekly Sunday matches');
select ok(not public.rule_matches('{"freq":"weekly","weekdays":[0],"interval":1,"start_date":"2026-10-01"}', '2026-10-19'), 'weekly Monday not matched');
select ok(not public.rule_matches('{"freq":"weekly","weekdays":[1],"interval":2,"start_date":"2026-10-19"}', '2026-10-26'), 'biweekly skips odd week');
select ok(public.rule_matches('{"freq":"weekly","weekdays":[1],"interval":2,"start_date":"2026-10-19"}', '2026-11-02'), 'biweekly matches even week');

-- 시작일 이전 없음, 일간 간격
-- Nothing before start date, daily interval
select ok(not public.rule_matches('{"freq":"daily","interval":1,"start_date":"2026-10-19"}', '2026-10-18'), 'no occurrence before start');

-- 동일 입력 → 동일 미리보기
-- Same input → same preview
select is(
  (select array_agg(d) from public.preview_routine_dates('fixed', '{"freq":"monthly","day":31,"interval":1,"start_date":"2027-01-01"}', '2027-01-01', 3) d),
  array['2027-01-31', '2027-02-28', '2027-03-31']::date[],
  'preview uses same core'
);
select throws_like(
  $$ select public.validate_rule('fixed', '{"freq":"monthly","day":32,"start_date":"2027-01-01"}') $$,
  '%VALIDATION_ERROR%', 'invalid day rejected'
);

select * from finish();
rollback;
