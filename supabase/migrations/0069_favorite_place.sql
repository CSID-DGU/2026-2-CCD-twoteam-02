-- 바로 앉기(#116)의 최애 공간. 접속 직후 "바로 앉기"를 누르면 이 공간의 빈자리에 앉습니다.
-- 값은 지점 slug('sol' 등) 또는 바깥 공간 이름('plaza', 'campus', 'beach'). 없으면 null(고르는 창을 띄움).
-- 본인 행만 고칠 수 있는 기존 정책(0004)으로 충분해 정책은 바꾸지 않습니다.

begin;

alter table public.profiles
  add column favorite_place text
  check (favorite_place is null or char_length(favorite_place) between 1 and 40);

comment on column public.profiles.favorite_place is
  '바로 앉기(#116)에서 갈 최애 공간. 지점 slug 또는 plaza/campus/beach. null 이면 누를 때 고른다.';

commit;
