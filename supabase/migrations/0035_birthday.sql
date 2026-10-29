-- 0035: 프로필에 생일(월·일) 칸 (#321 별자리 운세)
--
-- 왜: 광장 밤하늘에서 내 별자리를 금색으로 보여 주고, 오늘의 별자리 운세 창 맨 위에 내 별자리 운세를 보여 주려고
--     가입할 때(또는 계정 탭에서) 생일을 받는다.
-- 개인정보: 별자리에는 월·일만 있으면 되므로 태어난 해는 받지 않는다.
--     profiles 는 0004 의 RLS 로 본인만 읽고 고칠 수 있다. 다른 사람이 보는 avatars 뷰(0010)는 id·nickname·avatar 만
--     고르므로 생일은 남에게 보이지 않는다. 뷰는 고치지 않는다.
-- 적용: develop 으로 가는 PR 이라 머지 전에 서비스 DB(SQL Editor)에 실행한다. experiment DB 에는 실행하지 않는다.

alter table public.profiles
  add column birth_month smallint,
  add column birth_day smallint;

-- 둘 다 비었거나 둘 다 있고, 그 달에 있는 날이어야 한다. (2월은 29일까지: 2월 29일생도 받음)
alter table public.profiles
  add constraint profiles_birthday_check check (
    (birth_month is null and birth_day is null)
    or (
      birth_month between 1 and 12
      and birth_day between 1 and (case when birth_month = 2 then 29 when birth_month in (4, 6, 9, 11) then 30 else 31 end)
    )
  );

comment on column public.profiles.birth_month is '생일 달(양력, 1~12). 별자리용, 본인만 읽음';
comment on column public.profiles.birth_day is '생일 날(양력). 별자리용, 본인만 읽음';

-- 가입 트리거: 닉네임은 0001 과 같고, signUp 의 options.data.birth_month·birth_day 가 올바르면 같이 넣는다.
-- 비었거나 틀린 값이면 생일은 비워 두고 가입은 그대로 된다. (가입을 막지 않음)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m_text text := new.raw_user_meta_data ->> 'birth_month';
  d_text text := new.raw_user_meta_data ->> 'birth_day';
  m smallint;
  d smallint;
begin
  if m_text ~ '^[0-9]{1,2}$' and d_text ~ '^[0-9]{1,2}$' then
    m := m_text::smallint;
    d := d_text::smallint;
    if not (m between 1 and 12
            and d between 1 and (case when m = 2 then 29 when m in (4, 6, 9, 11) then 30 else 31 end)) then
      m := null;
      d := null;
    end if;
  end if;

  insert into public.profiles (id, nickname, birth_month, birth_day)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nickname', '사용자'), m, d);
  return new;
end;
$$;

-- 확인 (실행 뒤, 다른 계정으로 로그인한 앱에서): 남의 생일은 안 보여야 한다.
--   select birth_month, birth_day from public.profiles where id <> auth.uid();   -- 0행 (RLS)
--   select * from public.avatars limit 1;                                       -- 생일 칸 없음
