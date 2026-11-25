// 설정 → 관리자 탭의 "같이 공부하는 봇" 켜고 끄기와 목표 인원 (#50). 관리자 탭은 팀원에게만 보입니다(SettingsView).
// 실제로 바꿀 수 있는지는 DB 가 정합니다(set_bots_enabled·set_bots_target 이 is_team 확인, 0075·0076).
// 바꾸면 DB 가 바로 한 번 움직여, 봇이 들어오거나 자리를 놓습니다.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from '../lib/supabase'
import { reloadBotPresence } from './botStore'

const MAX_TARGET = 100 // DB 검사(0076)와 같은 상한

export function BotSwitch() {
  const [enabled, setEnabled] = useState<boolean | null>(null) // null: 읽는 중
  const [target, setTarget] = useState<number | null>(null) // null: 아직 모름(0076 전이면 계속 null)
  const [draft, setDraft] = useState('') // 입력 중인 인원
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    supabase
      .from('bot_settings')
      .select('*') // target 은 0076 부터 있어, 칸 이름을 적지 않고 받습니다
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return
        if (error) return setError(`봇 설정을 읽지 못했어요: ${error.message}`)
        setEnabled(data?.enabled === true)
        if (typeof data?.target === 'number') {
          setTarget(data.target)
          setDraft(String(data.target))
        }
      })
    return () => {
      alive = false
    }
  }, [])

  const changeEnabled = async (next: boolean) => {
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('set_bots_enabled', { p_enabled: next })
    setBusy(false)
    if (error) return setError(`바꾸지 못했어요: ${error.message}`)
    setEnabled(data === true)
    reloadBotPresence()
  }

  const saveTarget = async () => {
    const next = Number(draft)
    if (!Number.isInteger(next) || next < 0 || next > MAX_TARGET) {
      setError(`인원은 0~${MAX_TARGET} 사이 정수로 적어 주세요.`)
      setDraft(target === null ? '' : String(target))
      return
    }
    if (next === target) return
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('set_bots_target', { p_target: next })
    setBusy(false)
    if (error) {
      setDraft(target === null ? '' : String(target))
      return setError(`인원을 바꾸지 못했어요: ${error.message}`)
    }
    setTarget(typeof data === 'number' ? data : next)
    reloadBotPresence()
  }

  return (
    <div style={styles.stack}>
      <label style={styles.row}>
        <span style={styles.label}>같이 공부하는 봇</span>
        <input type="checkbox" checked={enabled === true} disabled={enabled === null || busy} onChange={(e) => void changeEnabled(e.target.checked)} style={styles.check} />
      </label>
      {target !== null && (
        <label style={styles.row}>
          <span style={styles.label}>목표 인원 (실제 접속자 + 봇)</span>
          <input
            type="number"
            min={0}
            max={MAX_TARGET}
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void saveTarget()}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            style={styles.number}
          />
        </label>
      )}
      <span style={styles.help}>
        {error ||
          `접속한 사람이 ${target ?? '목표 인원'}명이 안 되면 그만큼 봇이 빈자리에 앉아 공부해요(봇마다 최근 24시간에 4~8시간까지). 끄면 바로 자리를 놓고 나가요.`}
      </span>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  stack: { display: 'flex', flexDirection: 'column', gap: 6 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' },
  label: { fontWeight: 700 },
  check: { width: 18, height: 18, cursor: 'pointer' },
  number: { width: 64, padding: '4px 6px', borderRadius: 6, border: '1px solid #3a3f4b', background: '#16181d', color: '#fff', font: 'inherit', textAlign: 'right' },
  help: { color: '#aab0bb', fontSize: 13 },
}
