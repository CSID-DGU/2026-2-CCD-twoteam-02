-- 두뜀 0010: 회원마다 캐릭터를 저장한다 (백엔드·DB 육심호)
-- 실행 위치: Supabase 대시보드 > SQL Editor
--
-- 배경:
--   실시간으로 다른 참여자를 그리려면 "이 사람은 어떤 캐릭터인가"를 알아야 하는데
--   profiles 에 그 칸이 없었다. SeatedCharacter 는 model 로 'a'~'r' 을 받아
--   public/models/character-<model>.glb 를 불러온다.
--
--   칸 이름을 character 로 하지 않은 이유: character 는 PostgreSQL 의 자료형 이름이라
--   컬럼 이름으로 쓰면 질의에 따라 해석이 꼬일 수 있다. avatar 로 둔다.
--
--   jsonb 로 두는 이유: 지금은 모델 하나만 고르지만, 나중에 머리·옷처럼 파츠를 조합하게 되면
--   칸을 추가하는 마이그레이션 없이 키만 늘리면 된다. 지금은 {"model":"a"} 하나만 쓴다.
--
--   닉네임과 캐릭터는 둘 다 "남을 화면에 그리는 데 필요한 값"이라 한 창구로 모은다.
--   기존 nicknames 뷰는 아직 코드에서 쓰지 않으므로 avatars 로 바꾼다.

begin;

-- ---------------------------------------------------------------
-- 1. 캐릭터 칸
--    기본값이 있으므로 가입 트리거(handle_new_user)는 고치지 않아도 된다.
-- ---------------------------------------------------------------
alter table public.profiles
  add column avatar jsonb not null default '{"model":"a"}'::jsonb;

-- 모델은 public/models/character-a.glb ~ character-r.glb 의 18종만 쓴다.
-- 파츠가 늘어나면 이 제약에 키를 더 넣는다.
alter table public.profiles
  add constraint profiles_avatar_model_check
  check (avatar ? 'model' and avatar ->> 'model' ~ '^[a-r]$');

comment on column public.profiles.avatar is
  '캐릭터 설정. 지금은 {"model":"a"} 하나만 쓴다. 파츠가 늘어나면 키를 추가한다.';

-- ---------------------------------------------------------------
-- 2. 남을 화면에 그리는 데 필요한 값만 내보내는 창구
--
--    캐릭터 위에 이름을 띄우고 모습을 그리려면 남의 닉네임과 캐릭터가 필요하다.
--    화면을 그리는 건 각자의 브라우저이므로 그 브라우저가 값을 받아야 한다.
--    RLS 는 컬럼 단위로 열 수 없어서, 필요한 칸만 담은 뷰를 둔다.
--    profiles 테이블 자체는 여전히 본인 것만 열려 있다. (0004)
-- ---------------------------------------------------------------
drop view if exists public.nicknames;

create view public.avatars as
  select id, nickname, avatar from public.profiles;

revoke all on public.avatars from public, anon;
grant select on public.avatars to authenticated;

comment on view public.avatars is
  '다른 참여자를 그리는 데 쓰는 값. 가입일 등 나머지 프로필 정보는 나가지 않는다.';

commit;
