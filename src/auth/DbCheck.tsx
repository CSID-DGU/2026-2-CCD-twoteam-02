// DB 연결과 RLS 정책이 의도대로 동작하는지 눈으로 확인하는 패널. 확인용이라 임시다.
//
// Supabase SQL Editor 에서 확인하면 안 된다. 거기는 소유자 권한으로 돌아 RLS를 지나가므로
// 정책이 없어도 다 보인다. 브라우저에서 로그인한 상태로 조회해야 실제 권한이 확인된다.
//
// 라우터가 들어와 이 미리보기가 없어지면 이 파일도 지운다.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { styles } from './authStyles'

type Row = { label: string; expected: string; got: string; ok: boolean | null }

export default function DbCheck() {
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    let alive = true

    async function run() {
      const out: Row[] = []
      const add = (label: string, expected: string, got: string, ok: boolean | null) =>
        out.push({ label, expected, got, ok })

      // 배치 정보: 로그인했으면 읽힌다
      const branches = await supabase.from('branches').select('name, slug')
      add(
        'branches (지점)',
        '별다방 / byeol',
        branches.error ? `오류: ${branches.error.message}` : (branches.data ?? []).map((b) => `${b.name} / ${b.slug}`).join(', ') || '(없음)',
        !branches.error && (branches.data?.length ?? 0) === 1
      )

      const seats = await supabase.from('seats').select('seat_number', { count: 'exact', head: true })
      add('seats (좌석)', '20석', seats.error ? `오류: ${seats.error.message}` : `${seats.count}석`, !seats.error && seats.count === 20)

      const rooms = await supabase.from('rooms').select('room_number', { count: 'exact', head: true })
      add('rooms (회의실)', '3개', rooms.error ? `오류: ${rooms.error.message}` : `${rooms.count}개`, !rooms.error && rooms.count === 3)

      // 본인 것만 보여야 하는 테이블
      const profiles = await supabase.from('profiles').select('nickname')
      add(
        'profiles (본인만)',
        '1행',
        profiles.error ? `오류: ${profiles.error.message}` : `${profiles.data?.length ?? 0}행 (${(profiles.data ?? []).map((p) => p.nickname).join(', ')})`,
        !profiles.error && profiles.data?.length === 1
      )

      // 닉네임 뷰: 가입자 전원이 보인다 (캐릭터 위 이름표시용)
      const nicknames = await supabase.from('nicknames').select('nickname')
      add(
        'nicknames 뷰 (전원)',
        '가입자 수만큼',
        nicknames.error ? `오류: ${nicknames.error.message}` : `${nicknames.data?.length ?? 0}명`,
        !nicknames.error
      )

      const passes = await supabase.from('passes').select('id', { count: 'exact', head: true })
      add('passes (본인만)', '내 이용권 수', passes.error ? `오류: ${passes.error.message}` : `${passes.count}장`, !passes.error)

      // 점유 현황 함수
      const occupied = await supabase.rpc('occupied_seat_numbers', { p_branch_id: 1 })
      add(
        'occupied_seat_numbers()',
        '점유된 좌석 번호',
        occupied.error ? `오류: ${occupied.error.message}` : (occupied.data?.length ? occupied.data.join(', ') : '(점유 없음)'),
        !occupied.error
      )

      const occ = await supabase.rpc('room_occupancy', { p_branch_id: 1 })
      add(
        'room_occupancy()',
        '회의실 3개 현황',
        occ.error ? `오류: ${occ.error.message}` : `${occ.data?.length ?? 0}개 (정원 ${(occ.data ?? []).map((r: { capacity: number }) => r.capacity).join('/')})`,
        !occ.error && occ.data?.length === 3
      )

      // 막혀야 하는 것: 좌석 배치를 임의로 바꾸기
      const tamper = await supabase.from('seats').update({ pos_x: 999 }).eq('seat_number', 1).select()
      add(
        '좌석 좌표 변경 시도',
        '0행 (막혀야 정상)',
        tamper.error ? `막힘: ${tamper.error.message}` : `${tamper.data?.length ?? 0}행 바뀜`,
        (tamper.data?.length ?? 0) === 0
      )

      if (alive) setRows(out)
    }

    run()
    return () => {
      alive = false
    }
  }, [])

  if (!rows) return <p style={styles.hint}>DB 확인 중…</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ fontSize: 13, lineHeight: 1.5 }}>
          <span style={{ color: r.ok === false ? '#f87171' : '#4ade80' }}>{r.ok === false ? '✗' : '✓'}</span>{' '}
          <span style={{ color: '#fff' }}>{r.label}</span>
          <div style={{ color: '#9aa1ab', paddingLeft: 16 }}>{r.got}</div>
        </div>
      ))}
    </div>
  )
}
