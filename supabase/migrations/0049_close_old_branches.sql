-- 두뜀 0049: 레트로카페(옛 솔카페, slug sol)·흑요 라운지(obsidian)·월넛 바(walnut) 닫기
-- 실행 위치: Supabase 대시보드 > SQL Editor (서비스 프로젝트. develop 전용이며 실험 프로젝트에서는 실행하지 않는다)
--
-- 배경:
--   캠리단길에서 레트로카페 건물 자리에 이끼 정원(moss)을 옮겨 왔고(캠리 스퀘어 2층 → 단독 건물),
--   흑요 라운지·월넛 바 건물은 거리에서 뺐다. 세 건물은 들어갈 수 없으므로 열린 지점 목록에서도 뺀다.
--   지점 행·기록(공부 기록, 이용 기록)은 지우지 않는다. 다시 열려면 is_open 을 true 로 돌리면 된다.

update public.branches set is_open = false where slug in ('sol', 'obsidian', 'walnut');
