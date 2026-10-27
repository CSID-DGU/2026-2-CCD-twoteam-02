// 기록 재생 화면 (#195). 주소: /replay (?branch= 를 생략하면 room-c)
//
// C 조건의 팀원 캐릭터를 실제 접속처럼 보이게 하는 "재생 클라이언트"입니다. 팀원 재생 계정(r01~r03)으로 로그인해 엽니다.
//   1. 기록 모드(#190)에서 내려받은 JSON 을 고르면 이 브라우저 안에 저장합니다(replayStore.ts).
//   2. "자리에 앉기": 파일에 적힌 자리(18·19·20)를 실제로 잡고(sit_cafe_seat) 지점 방에 들어갑니다.
//      시작 전에는 기록의 첫 장면 그대로 앉아 있습니다.
//   3. 시작 시각을 넣으면 그 시각에 재생을 시작합니다. 세 화면에 같은 시각을 넣으면 함께 시작합니다.
//      재생 중에는 기록 시각에 맞는 값을 0.25초마다 내 상태(me)에 넣고, 보내는 것은 지점 화면과 같은 useParticipants 가 합니다.
//   4. 기록이 끝나면 마지막 장면으로 앉아 있습니다. "그만하기"를 누르면 자리를 반납하고 방에서 나갑니다.
//   5. 전송이 끊긴 구간을 기록해 끝날 때 CSV 로 내려받습니다(실험 문서 6-3절: 30초 넘게 끊기면 그 세션의 C 는 결측).
//
// 3D 화면·웹캠·트래킹은 켜지 않습니다(한 컴퓨터에서 세 개를 띄우므로 가볍게).
// 계정마다 크롬 프로필을 따로 써서 창 3개를 띄웁니다. 창을 최소화하면 크롬이 실시간 연결을 늦춰 캐릭터가 사라질 수 있으니
// 세 창을 화면에 나란히 둡니다.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ChangeEvent, ReactNode } from 'react'
import { useLocation } from 'react-router'
import { supabase } from '../lib/supabase'
import { workerInterval } from '../lib/workerInterval'
import { useSession } from '../auth/useSession'
import { useBranchInfo } from '../space/useBranchInfo'
import { useParticipants } from '../realtime/useParticipants'
import { channelName } from '../realtime/participants'
import type { PresenceState } from '../realtime/participants'
import { useOnlinePlace } from '../realtime/onlineContext'
import { ELSEWHERE } from '../realtime/online'
import { clockOf } from '../recording/recordLogic'
import type { RecordFile } from '../recording/recordLogic'
import {
  MAX_SEND_GAP_SEC, TICK_MS, initialSendStats, lengthOf, longestGapNow, nextSendStats, parseRecordFile, parseStartTime,
  replayLogCsv, replayLogName, sendGapTooLong, stateAt,
} from './replayLogic'
import type { SendStats } from './replayLogic'
import { loadRecord, saveRecord } from './replayStore'

const DEFAULT_BRANCH = 'room-c' // 재생은 C 조건 지점에서만 씁니다

// idle: 앉기 전 / seated: 앉아서 첫 장면으로 멈춤 / waiting: 시작 시각을 기다림 / playing: 재생 중 / ended: 끝, 마지막 장면
type Phase = 'idle' | 'seated' | 'waiting' | 'playing' | 'ended'

type Loaded = { name: string; file: RecordFile }

// 화면에 보일 값. 재생 중 계산은 ref 에 두고, 0.25초마다 여기에 옮겨 그립니다. (ref 는 그리는 중에 읽지 않음)
type View = { now: number; playedAt: number | null; stats: SendStats }

export function ReplayPage() {
  const { search } = useLocation()
  const slug = new URLSearchParams(search).get('branch') ?? DEFAULT_BRANCH
  const { info, loading, error: branchError } = useBranchInfo(slug)
  const { session } = useSession()
  const userId = session?.user.id ?? null

  const [nickname, setNickname] = useState('')
  const [record, setRecord] = useState<Loaded | null>(null)
  const [fileError, setFileError] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [startText, setStartText] = useState('')
  const [startAt, setStartAt] = useState<number | null>(null) // 예약한 시작 시각 (ms)
  const [message, setMessage] = useState('')
  const [view, setView] = useState<View>(() => ({ now: Date.now(), playedAt: null, stats: initialSendStats }))
  const [busy, setBusy] = useState(false)

  const me = useRef<PresenceState | null>(null) // 보낼 내 상태. useParticipants 가 0.25초마다 읽어 보냅니다
  const playedAt = useRef<number | null>(null) // 실제로 재생을 시작한 시각 (ms)
  const stats = useRef<SendStats>(initialSendStats) // 재생 중 전송 기록
  const logged = useRef(false) // 이번 재생의 끊김 기록을 이미 내려받았는지

  const joined = phase !== 'idle' && info !== null
  useParticipants(joined ? channelName(info.id) : '', me, {
    background: true,
    onSend: (at) => {
      if (playedAt.current !== null) stats.current = nextSendStats(stats.current, at)
    },
  })
  useOnlinePlace(joined ? slug : ELSEWHERE) // 앉아 있는 동안 접속 상태도 "이 지점에 있음"

  // 이 계정 닉네임 (화면 표시와 끊김 기록 파일 이름용)
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void supabase
      .from('avatars')
      .select('nickname')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setNickname((data as { nickname?: string } | null)?.nickname ?? '')
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  // 저장해 둔 기록 파일을 읽어 옵니다.
  useEffect(() => {
    let cancelled = false
    void loadRecord().then((saved) => {
      if (cancelled || !saved) return
      const file = parseRecordFile(saved.text)
      if (typeof file !== 'string') setRecord({ name: saved.name, file })
    })
    return () => {
      cancelled = true
    }
  }, [])

  // 지난번에 반납하지 못한 자리가 있으면 정리하고, 창을 닫거나 화면을 떠나면 자리를 반납합니다. (지점 화면과 같게)
  const seatedRef = useRef(false)
  useEffect(() => {
    seatedRef.current = phase !== 'idle'
  }, [phase])
  useEffect(() => {
    void supabase.rpc('leave_cafe_seat')
    const leave = () => {
      if (seatedRef.current) void supabase.rpc('leave_cafe_seat')
    }
    window.addEventListener('pagehide', leave)
    return () => {
      window.removeEventListener('pagehide', leave)
      leave()
    }
  }, [])

  // 이번 재생의 끊김 기록을 CSV 로 내려받습니다. (재생을 한 번이라도 했을 때만, 한 번만)
  const downloadLog = (endedAt: number) => {
    const started = playedAt.current
    if (started === null || !record || logged.current) return
    logged.current = true
    const log = { nickname: nickname || 'replay', file: record.name, seat: record.file.seat, startedAt: started, endedAt, stats: stats.current }
    download(replayLogName(log), new Blob([replayLogCsv(log)], { type: 'text/csv' }))
  }
  const downloadLogRef = useRef(downloadLog)
  useEffect(() => {
    downloadLogRef.current = downloadLog
  })

  // 재생 시작. 세 화면이 같은 시각을 0초로 잡도록, 시각 예약은 누른 시각이 아니라 예약한 시각을 넘깁니다.
  const beginPlaying = (at: number) => {
    playedAt.current = at
    stats.current = initialSendStats
    logged.current = false
    setPhase('playing')
  }
  const beginRef = useRef(beginPlaying)
  useEffect(() => {
    beginRef.current = beginPlaying
  })

  // 앉아 있는 동안 0.25초마다: 시작 시각이 되면 재생을 시작하고, 지금 보낼 값을 내 상태에 넣습니다.
  // 창이 가려져도 늦어지지 않게 워커 타이머를 씁니다.
  useEffect(() => {
    if (phase === 'idle' || !record || !userId) return
    const { file } = record
    const tick = () => {
      const t = Date.now()
      setView({ now: t, playedAt: playedAt.current, stats: stats.current })
      if (phase === 'waiting' && startAt !== null && t >= startAt) {
        beginRef.current(startAt)
        return
      }
      const elapsed = playedAt.current === null || phase === 'seated' || phase === 'waiting' ? 0 : t - playedAt.current
      me.current = stateAt(file, elapsed, userId)
      if (phase === 'playing' && elapsed >= lengthOf(file)) {
        setPhase('ended')
        downloadLogRef.current(t)
      }
    }
    tick()
    return workerInterval(TICK_MS, tick)
  }, [phase, startAt, record, userId])

  const pickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0]
    e.target.value = '' // 같은 파일을 다시 골라도 바뀌게
    if (!picked) return
    const text = await picked.text()
    const file = parseRecordFile(text)
    if (typeof file === 'string') {
      setFileError(file)
      return
    }
    setFileError('')
    setRecord({ name: picked.name, file })
    void saveRecord({ name: picked.name, text }).catch(() => setFileError('파일을 이 브라우저에 저장하지 못했어요. 새로고침하면 다시 골라야 해요.'))
  }

  // 파일에 적힌 자리를 잡습니다. 이 계정이 다른 자리를 쓰고 있으면(DT001) 반납하고 한 번 더 시도합니다.
  const sit = async () => {
    if (!record || !info || busy) return
    setBusy(true)
    setMessage('')
    const args = { p_branch_id: info.id, p_seat_number: record.file.seat }
    let { error } = await supabase.rpc('sit_cafe_seat', args)
    if (error?.code === 'DT001') {
      await supabase.rpc('release_my_place')
      ;({ error } = await supabase.rpc('sit_cafe_seat', args))
    }
    setBusy(false)
    if (error) {
      setMessage(`자리를 잡지 못했어요: ${error.message}`)
      return
    }
    playedAt.current = null
    setPhase('seated')
  }

  const schedule = () => {
    const at = parseStartTime(startText, new Date())
    if (at === null) {
      setMessage('시작 시각을 15:00 또는 15:00:30 처럼 적어 주세요.')
      return
    }
    if (at <= Date.now()) {
      setMessage('이미 지난 시각이에요.')
      return
    }
    setMessage('')
    setStartAt(at)
    setPhase('waiting')
  }

  // 그만하기: 끊김 기록을 남기고, 자리를 반납하고, 방에서 나갑니다.
  const stop = () => {
    downloadLog(Date.now())
    void supabase.rpc('leave_cafe_seat')
    me.current = null
    playedAt.current = null
    setStartAt(null)
    setPhase('idle')
  }

  if (loading) return <Page>지점 정보를 읽는 중…</Page>
  if (!info) return <Page>{branchError || '없는 지점이에요.'}</Page>

  const file = record?.file ?? null
  const { now, stats: shown } = view
  const elapsed = phase === 'playing' && view.playedAt !== null ? Math.max(0, now - view.playedAt) : phase === 'ended' && file ? lengthOf(file) : 0
  const played = view.playedAt !== null && (phase === 'playing' || phase === 'ended')
  const longest = longestGapNow(shown, now)
  const tooLong = played && sendGapTooLong(shown, now)

  return (
    <Page>
      <h1 style={styles.title}>기록 재생 · {info.name}</h1>
      <div style={styles.row}>
        계정: <b>{nickname || '…'}</b>
      </div>

      <section style={styles.section}>
        <div style={styles.label}>기록 파일</div>
        {file ? (
          <div>
            {record?.name} · {file.seat}번 자리 · 길이 {clockOf(lengthOf(file))} · 얼굴 인식{' '}
            {Math.round((file.quality?.faceRate ?? 0) * 100)}%
            {file.branch !== slug && <div style={styles.warn}>이 파일은 {file.branch} 에서 기록했어요. 지금 지점은 {slug} 이에요.</div>}
          </div>
        ) : (
          <div style={styles.hint}>기록 모드에서 내려받은 JSON 파일을 골라 주세요.</div>
        )}
        <input type="file" accept="application/json,.json" disabled={phase !== 'idle'} onChange={(e) => void pickFile(e)} />
        {fileError && <div style={styles.error}>{fileError}</div>}
      </section>

      <section style={styles.section}>
        <div style={styles.label}>상태</div>
        <div style={styles.status}>
          {phase === 'idle' && '자리에 앉기 전'}
          {phase === 'seated' && `${file?.seat}번 자리에 앉음 · 첫 장면으로 멈춰 있음`}
          {phase === 'waiting' && startAt !== null && `${new Date(startAt).toLocaleTimeString()}에 시작 (${clockOf(Math.max(0, startAt - now))} 남음)`}
          {phase === 'playing' && file && `● 재생 중 ${clockOf(elapsed)} / ${clockOf(lengthOf(file))}`}
          {phase === 'ended' && '재생 끝 · 마지막 장면으로 앉아 있음'}
        </div>
        {played && (
          <div style={{ color: tooLong ? '#fca5a5' : '#aab0bb' }}>
            전송 {shown.count}회 · 마지막 전송 {shown.lastAt === null ? '-' : `${(Math.max(0, now - shown.lastAt) / 1000).toFixed(1)}초 전`} · 가장 긴 끊김{' '}
            {(longest / 1000).toFixed(1)}초 (기준 {MAX_SEND_GAP_SEC}초 미만){tooLong && ' · 이 세션의 C 는 결측'}
          </div>
        )}
        {message && <div style={styles.error}>{message}</div>}

        <div style={styles.actions}>
          {phase === 'idle' && (
            <button type="button" style={styles.primary} disabled={!file || busy} onClick={() => void sit()}>
              {file ? `${file.seat}번 자리에 앉기` : '파일을 먼저 골라 주세요'}
            </button>
          )}
          {phase === 'seated' && (
            <>
              <input
                style={styles.input}
                value={startText}
                onChange={(e) => setStartText(e.target.value)}
                placeholder="시작 시각 (예: 15:00)"
              />
              <button type="button" style={styles.primary} onClick={schedule}>
                시각에 시작
              </button>
              <button type="button" style={styles.secondary} onClick={() => beginPlaying(Date.now())}>
                지금 시작
              </button>
            </>
          )}
          {phase === 'waiting' && (
            <button type="button" style={styles.secondary} onClick={() => setPhase('seated')}>
              예약 취소
            </button>
          )}
          {phase !== 'idle' && (
            <button type="button" style={styles.secondary} onClick={stop}>
              그만하기 (자리 반납)
            </button>
          )}
        </div>
      </section>

      <p style={styles.hint}>
        이 창을 최소화하거나 다른 창으로 가리지 마세요. 크롬이 실시간 연결을 늦춰 캐릭터가 사라질 수 있어요. 재생 계정마다 크롬 프로필을
        따로 써서 세 창을 화면에 나란히 띄워 주세요. 재생이 끝나거나 그만두면 전송 끊김 기록(CSV)이 내려받아집니다.
      </p>
    </Page>
  )
}

function Page({ children }: { children: ReactNode }) {
  return (
    <div style={styles.page}>
      <div style={styles.panel}>{children}</div>
    </div>
  )
}

// 파일을 이 컴퓨터로 내려받습니다. (서버로 보내지 않음)
function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: '#16181d', color: '#fff', font: '14px/1.6 system-ui, sans-serif', padding: 16, boxSizing: 'border-box' },
  panel: { maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 },
  title: { fontSize: 18, margin: 0 },
  row: {},
  section: { display: 'flex', flexDirection: 'column', gap: 6, padding: 12, borderRadius: 10, background: '#20232a' },
  label: { fontWeight: 600 },
  status: { fontSize: 16 },
  hint: { color: '#aab0bb', fontSize: 12 },
  warn: { color: '#fde68a' },
  error: { color: '#f87171' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  input: { padding: '6px 8px', borderRadius: 6, border: '1px solid #4b5563', background: '#111318', color: '#fff', font: 'inherit', width: 160 },
  primary: { padding: '6px 14px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#0b1a10', fontWeight: 600, cursor: 'pointer', font: 'inherit' },
  secondary: { padding: '6px 12px', borderRadius: 6, border: '1px solid #4b5563', background: 'transparent', color: '#fff', cursor: 'pointer', font: 'inherit' },
}
