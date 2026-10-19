-- 반복 루틴 엔진: 규칙 검증·날짜 매칭·담당 교대·회차 생성. 미리보기와 생성은 같은 계산 코어(rule_matches)를 쓴다.
-- Routine engine: rule validation, date matching, rotation and materialization. Preview and materialize share rule_matches.
-- 근거: docs/planning/docs/06-routine-engine.md
-- Source: docs/planning/docs/06-routine-engine.md
--
-- 규칙 JSON 형식 / Rule JSON shapes
--   fixed:            {"freq":"daily","interval":n,"start_date":"YYYY-MM-DD","time":"HH:MM"?}
--                     {"freq":"weekly","weekdays":[0..6],"interval":n,"start_date":...}   (0=일요일 / 0=Sunday)
--                     {"freq":"monthly","day":1..31,"interval":n,"start_date":...}
--   after_resolution: {"interval_days":n,"start_date":"YYYY-MM-DD","time":"HH:MM"?}
--   manual:           {"time":"HH:MM"?}

-- 가까운 미래 생성 창(일). 제안 수치 30일.
-- Near-future materialization window in days (proposed 30).
create function public.materialize_window_days()
returns integer
language sql
immutable
as $$ select 30 $$;

-- 규칙 간격 상한
-- Upper bound for rule intervals
create function public.max_rule_interval()
returns integer
language sql
immutable
as $$ select 365 $$;

-- 미리보기 탐색 상한(일)
-- Preview search horizon in days
create function public.preview_horizon_days()
returns integer
language sql
immutable
as $$ select 800 $$;

-- 미리보기 최대 개수
-- Maximum preview count
create function public.preview_max_count()
returns integer
language sql
immutable
as $$ select 50 $$;

-- 공간 시간대 기준 오늘 날짜
-- Today's date in the space time zone
create function public.space_today(p_space_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone s.timezone)::date from public.spaces s where s.id = p_space_id;
$$;

create function public.is_valid_timezone(p_tz text)
returns boolean
language sql
stable
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz);
$$;

-- 해당 월의 마지막 날짜(일)
-- Last day number of the month containing p_date
create function public.last_day_of_month(p_date date)
returns integer
language sql
immutable
as $$
  select extract(day from (date_trunc('month', p_date) + interval '1 month - 1 day'))::integer;
$$;

-- 규칙 형식 검증. 위반 시 VALIDATION_ERROR.
-- Validate rule shape; raises VALIDATION_ERROR on violation.
create function public.validate_rule_strict(p_mode public.routine_mode, p_rule jsonb)
returns void
language plpgsql
immutable
as $$
declare
  v_freq text;
  v_interval integer;
  v_day integer;
  v_weekday jsonb;
begin
  if p_rule is null or jsonb_typeof(p_rule) <> 'object' then
    perform public.raise_app_error('VALIDATION_ERROR', 'rule must be an object');
  end if;

  if p_rule ? 'time' and (p_rule ->> 'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    perform public.raise_app_error('VALIDATION_ERROR', 'time must be HH:MM');
  end if;

  if p_mode = 'manual' then
    return;
  end if;

  if (p_rule ->> 'start_date') is null or (p_rule ->> 'start_date') !~ '^\d{4}-\d{2}-\d{2}$' then
    perform public.raise_app_error('VALIDATION_ERROR', 'start_date is required');
  end if;
  perform (p_rule ->> 'start_date')::date;

  if p_mode = 'after_resolution' then
    v_interval := (p_rule ->> 'interval_days')::integer;
    if v_interval is null or v_interval < 1 or v_interval > public.max_rule_interval() then
      perform public.raise_app_error('VALIDATION_ERROR', 'interval_days out of range');
    end if;
    return;
  end if;

  -- fixed
  v_freq := p_rule ->> 'freq';
  v_interval := coalesce((p_rule ->> 'interval')::integer, 1);
  if v_interval < 1 or v_interval > public.max_rule_interval() then
    perform public.raise_app_error('VALIDATION_ERROR', 'interval out of range');
  end if;

  if v_freq = 'daily' then
    return;
  elsif v_freq = 'weekly' then
    if jsonb_typeof(p_rule -> 'weekdays') <> 'array' or jsonb_array_length(p_rule -> 'weekdays') = 0 then
      perform public.raise_app_error('VALIDATION_ERROR', 'weekdays required');
    end if;
    for v_weekday in select * from jsonb_array_elements(p_rule -> 'weekdays') loop
      if jsonb_typeof(v_weekday) <> 'number' or (v_weekday)::integer not between 0 and 6 then
        perform public.raise_app_error('VALIDATION_ERROR', 'weekday must be 0..6');
      end if;
    end loop;
  elsif v_freq = 'monthly' then
    v_day := (p_rule ->> 'day')::integer;
    if v_day is null or v_day not between 1 and 31 then
      perform public.raise_app_error('VALIDATION_ERROR', 'day must be 1..31');
    end if;
  else
    perform public.raise_app_error('VALIDATION_ERROR', 'unknown freq');
  end if;
end;
$$;

-- 규칙 검증 진입점: 잘못된 날짜·숫자 형식의 캐스트 오류도 VALIDATION_ERROR 로 통일
-- Rule validation entry point: malformed date/number casts also surface as VALIDATION_ERROR
create function public.validate_rule(p_mode public.routine_mode, p_rule jsonb)
returns void
language plpgsql
immutable
as $$
begin
  perform public.validate_rule_strict(p_mode, p_rule);
exception
  when invalid_datetime_format or datetime_field_overflow or invalid_text_representation
    or numeric_value_out_of_range or invalid_parameter_value then
    perform public.raise_app_error('VALIDATION_ERROR', 'malformed rule value');
end;
$$;

-- 고정 일정 규칙이 해당 날짜에 회차를 갖는지. 존재하지 않는 월일은 말일로 보정한다.
-- Whether a fixed rule produces an occurrence on p_date. Missing month days clamp to the last day.
create function public.rule_matches(p_rule jsonb, p_date date)
returns boolean
language plpgsql
immutable
as $$
declare
  v_start date := (p_rule ->> 'start_date')::date;
  v_interval integer := coalesce((p_rule ->> 'interval')::integer, 1);
  v_freq text := p_rule ->> 'freq';
  v_weeks integer;
  v_months integer;
  v_day integer;
begin
  if p_date < v_start then
    return false;
  end if;

  if v_freq = 'daily' then
    return (p_date - v_start) % v_interval = 0;
  end if;

  if v_freq = 'weekly' then
    if not (p_rule -> 'weekdays') @> to_jsonb(extract(dow from p_date)::integer) then
      return false;
    end if;
    -- 월요일 기준 주 차이
    -- Week distance using Monday-based weeks
    v_weeks := (date_trunc('week', p_date)::date - date_trunc('week', v_start)::date) / 7;
    return v_weeks % v_interval = 0;
  end if;

  if v_freq = 'monthly' then
    v_months := (extract(year from p_date)::integer - extract(year from v_start)::integer) * 12
      + (extract(month from p_date)::integer - extract(month from v_start)::integer);
    if v_months % v_interval <> 0 then
      return false;
    end if;
    v_day := least((p_rule ->> 'day')::integer, public.last_day_of_month(p_date));
    return extract(day from p_date)::integer = v_day;
  end if;

  return false;
end;
$$;

-- 다음 담당자 선택. rotate 는 직전 원래 담당자 다음 순번, fixed 는 첫 순번, free 는 null.
-- Pick the next assignee: rotate → next after previous original assignee; fixed → first; free → null.
create function public.pick_assignee(p_routine_id uuid, p_prev_assignee uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mode public.assignment_mode;
  v_prev_order integer;
  v_next uuid;
begin
  select assignment_mode into v_mode from public.routines where id = p_routine_id;
  if v_mode = 'free' then
    return null;
  end if;

  if v_mode = 'rotate' and p_prev_assignee is not null then
    select sequence_order into v_prev_order
    from public.routine_assignees
    where routine_id = p_routine_id and user_id = p_prev_assignee;

    if v_prev_order is not null then
      select user_id into v_next
      from public.routine_assignees
      where routine_id = p_routine_id and sequence_order > v_prev_order
      order by sequence_order
      limit 1;
      if v_next is not null then
        return v_next;
      end if;
    end if;
  end if;

  select user_id into v_next
  from public.routine_assignees
  where routine_id = p_routine_id
  order by sequence_order
  limit 1;
  return v_next;
end;
$$;

-- 고정 일정 회차를 오늘부터 생성 창 끝까지 멱등 생성한다.
-- Idempotently materialize fixed occurrences from today through the window end.
create function public.materialize_fixed(p_routine_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_routine public.routines%rowtype;
  v_rule jsonb;
  v_today date;
  v_day date;
  v_prev uuid;
  v_assignee uuid;
  v_created integer := 0;
begin
  select * into v_routine from public.routines where id = p_routine_id;
  if v_routine.id is null or v_routine.mode <> 'fixed' or v_routine.archived_at is not null then
    return 0;
  end if;

  select rule into v_rule from public.routine_rules
  where routine_id = p_routine_id and version = v_routine.current_rule_version;
  v_today := public.space_today(v_routine.space_id);

  for v_day in
    select d::date
    from generate_series(v_today, v_today + public.materialize_window_days(), interval '1 day') as d
  loop
    continue when not public.rule_matches(v_rule, v_day);
    continue when exists (
      select 1 from public.routine_occurrences
      where routine_id = p_routine_id and is_fixed_slot and due_local_date = v_day
    );

    select original_assignee_id into v_prev
    from public.routine_occurrences
    where routine_id = p_routine_id and is_fixed_slot and due_local_date < v_day
    order by due_local_date desc
    limit 1;

    v_assignee := public.pick_assignee(p_routine_id, v_prev);

    insert into public.routine_occurrences (
      space_id, routine_id, rule_version, is_fixed_slot, due_local_date,
      original_assignee_id, assigned_user_id
    ) values (
      v_routine.space_id, p_routine_id, v_routine.current_rule_version, true, v_day,
      v_assignee, v_assignee
    );
    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

-- 완료일 기준 모드의 다음 회차 생성. p_rotate=false 이면 담당 유지(건너뛰기).
-- Spawn the next after_resolution occurrence; p_rotate=false keeps the assignee (skip).
create function public.spawn_next_after_resolution(
  p_occurrence_id uuid,
  p_base_date date,
  p_rotate boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occ public.routine_occurrences%rowtype;
  v_routine public.routines%rowtype;
  v_rule jsonb;
  v_assignee uuid;
  v_new_id uuid;
begin
  select * into v_occ from public.routine_occurrences where id = p_occurrence_id;
  select * into v_routine from public.routines where id = v_occ.routine_id;
  if v_routine.archived_at is not null then
    return null;
  end if;

  select rule into v_rule from public.routine_rules
  where routine_id = v_routine.id and version = v_routine.current_rule_version;

  if p_rotate then
    v_assignee := public.pick_assignee(v_routine.id, v_occ.original_assignee_id);
  else
    v_assignee := coalesce(v_occ.original_assignee_id, public.pick_assignee(v_routine.id, null));
  end if;

  insert into public.routine_occurrences (
    space_id, routine_id, rule_version, is_single_open, due_local_date,
    original_assignee_id, assigned_user_id, created_from_occurrence_id
  ) values (
    v_routine.space_id, v_routine.id, v_routine.current_rule_version, true,
    p_base_date + (v_rule ->> 'interval_days')::integer,
    v_assignee, v_assignee, p_occurrence_id
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

-- 완료일 기준 루틴의 첫 회차 생성 (열린 회차가 없을 때만)
-- Create the first after_resolution occurrence (only when none is open)
create function public.ensure_first_after_resolution(p_routine_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_routine public.routines%rowtype;
  v_rule jsonb;
  v_assignee uuid;
begin
  select * into v_routine from public.routines where id = p_routine_id;
  if v_routine.mode <> 'after_resolution' or v_routine.archived_at is not null then
    return;
  end if;
  if exists (
    select 1 from public.routine_occurrences where routine_id = p_routine_id and status = 'scheduled'
  ) then
    return;
  end if;
  -- 이미 해결 이력이 있으면 후속 회차는 해결 시점에 만들어진다
  -- If resolutions already exist, follow-ups are spawned at resolution time
  if exists (
    select 1 from public.routine_occurrences
    where routine_id = p_routine_id and status in ('completed', 'skipped')
  ) then
    return;
  end if;

  select rule into v_rule from public.routine_rules
  where routine_id = p_routine_id and version = v_routine.current_rule_version;
  v_assignee := public.pick_assignee(p_routine_id, null);

  insert into public.routine_occurrences (
    space_id, routine_id, rule_version, is_single_open, due_local_date,
    original_assignee_id, assigned_user_id
  ) values (
    v_routine.space_id, p_routine_id, v_routine.current_rule_version, true,
    (v_rule ->> 'start_date')::date, v_assignee, v_assignee
  );
end;
$$;

-- 미리보기: 규칙으로 다음 예정일 N개 계산 (생성과 같은 rule_matches 사용)
-- Preview: compute the next N due dates with the same rule_matches used by materialization
create function public.preview_routine_dates(
  p_mode public.routine_mode,
  p_rule jsonb,
  p_from date,
  p_count integer default 5
)
returns setof date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day date;
  v_found integer := 0;
  v_count integer;
  v_start date;
  v_interval integer;
begin
  perform public.validate_rule(p_mode, p_rule);
  if p_mode = 'manual' then
    return;
  end if;
  -- 과도한 요청으로 백엔드를 점유하지 않도록 개수 제한
  -- Cap the count so oversized requests cannot tie up the backend
  v_count := least(greatest(coalesce(p_count, 1), 1), public.preview_max_count());

  v_start := (p_rule ->> 'start_date')::date;

  if p_mode = 'after_resolution' then
    -- 매번 즉시 완료한다고 가정한 예시 일정
    -- Example schedule assuming each occurrence is resolved on its due date
    v_interval := (p_rule ->> 'interval_days')::integer;
    v_day := greatest(v_start, p_from);
    while v_found < v_count loop
      return next v_day;
      v_found := v_found + 1;
      v_day := v_day + v_interval;
    end loop;
    return;
  end if;

  v_day := greatest(v_start, p_from);
  while v_found < v_count and v_day <= p_from + public.preview_horizon_days() loop
    if public.rule_matches(p_rule, v_day) then
      return next v_day;
      v_found := v_found + 1;
    end if;
    v_day := v_day + 1;
  end loop;
end;
$$;
