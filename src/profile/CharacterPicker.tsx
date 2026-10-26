// 캐릭터 꾸미기 창 (#131 → #56): 피부색, 눈(모양·색), 눈썹, 입(다문·벌린), 머리(모양·색), 상의·하의·신발(모양·색)을 골라 입혀 봅니다.
//
// 왼쪽: 지금 고른 차림의 3D 미리보기(천천히 돌고, 끌어서 돌려 볼 수 있음)
// 오른쪽: 부위 탭, 부품 목록, 색상표. 부품 그림(썸네일)은 3D 화면을 여러 개 띄우지 않고 2D 캔버스에 그 부위만 그립니다.
//   (3D 화면을 부품마다 만들면 무겁고, 브라우저가 한 번에 열 수 있는 3D 화면 수(보통 16개)도 넘습니다. #137)
// 저장은 바깥(CharacterTab)이 합니다.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useAnimations, useGLTF } from '@react-three/drei'
import type { Group } from 'three'
import { BASE_MODEL_URL } from './characters'
import { useEyeSkin } from '../tracking/useEyeSkin'
import { PARTS, SKIN_PRESETS, avatarKey, randomAvatar } from '../avatar/avatarLogic'
import type { Avatar, Part, Slot } from '../avatar/avatarLogic'
import { drawPartThumb } from '../avatar/composeSkin'

const SCALE = 0.6 // 지점과 같은 크기 (키 약 1.6)
const THUMB = 56 // 부품 그림 칸 크기(px)
const COLOR_DELAY_MS = 150 // 색상표를 끄는 동안에는 이 시간만큼 멈췄을 때 미리보기를 바꿈(매번 스킨을 새로 만들지 않게)
const SELECTED = '#3b82f6'

type ColorKey = 'skin' | 'eyeColor' | 'hairColor' | 'topColor' | 'bottomColor' | 'shoesColor'
type Tab = { key: string; label: string; slots: { slot: Slot; title?: string }[]; color?: { key: ColorKey; label: string } }
const TABS: Tab[] = [
  { key: 'skin', label: '피부', slots: [], color: { key: 'skin', label: '피부색' } },
  { key: 'eyes', label: '눈', slots: [{ slot: 'eyes' }], color: { key: 'eyeColor', label: '눈 색' } },
  { key: 'brows', label: '눈썹', slots: [{ slot: 'brows', title: '눈썹 (머리 색을 따라요)' }] },
  { key: 'mouth', label: '입', slots: [{ slot: 'mouth', title: '다문 입 (평소)' }, { slot: 'mouthOpen', title: '벌린 입 (회의실에서 말할 때)' }] },
  { key: 'hair', label: '머리', slots: [{ slot: 'hair' }], color: { key: 'hairColor', label: '머리 색' } },
  { key: 'top', label: '상의', slots: [{ slot: 'top' }], color: { key: 'topColor', label: '상의 색' } },
  { key: 'bottom', label: '하의', slots: [{ slot: 'bottom' }], color: { key: 'bottomColor', label: '하의 색' } },
  { key: 'shoes', label: '신발', slots: [{ slot: 'shoes' }], color: { key: 'shoesColor', label: '신발 색' } },
]

type Props = {
  value: Avatar | null // 지금 고른 차림 (아직 모르면 null)
  onChange: (avatar: Avatar) => void
}

export function CharacterPicker({ value, onChange }: Props) {
  const [tabKey, setTabKey] = useState('skin')
  const tab = TABS.find((t) => t.key === tabKey)!
  const pick = (patch: Partial<Avatar>) => value && onChange({ ...value, ...patch })

  return (
    <div style={styles.wrap}>
      <div style={styles.preview}>
        <Canvas camera={{ fov: 30, position: [0, 1.0, 4.2] }}>
          <ambientLight intensity={1.5} />
          <directionalLight position={[3, 5, 4]} intensity={1.5} />
          {value && <Preview model={avatarKey(value)} />}
          <OrbitControls target={[0, 0.85, 0]} enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={1.5} />
        </Canvas>
      </div>
      <div style={styles.side}>
        <div style={styles.tabs} role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tabKey === t.key}
              style={{ ...styles.tab, ...(tabKey === t.key ? styles.tabOn : null) }}
              onClick={() => setTabKey(t.key)}
            >
              {t.label}
            </button>
          ))}
          <button type="button" style={styles.tab} onClick={() => onChange(randomAvatar())} disabled={!value} title="무작위로 꾸미기">
            🎲
          </button>
        </div>

        {value && tab.color && (
          <ColorField
            // key: 탭을 바꾸면 그 칸의 색으로 새로 시작
            key={tab.color.key}
            label={tab.color.label}
            value={value[tab.color.key]}
            presets={tab.color.key === 'skin' ? SKIN_PRESETS : undefined}
            onChange={(c) => pick({ [tab.color!.key]: c })}
          />
        )}

        {value &&
          tab.slots.map(({ slot, title }) => (
            <div key={slot} style={styles.section}>
              {title && <span style={styles.label}>{title}</span>}
              <div style={styles.grid}>
                {PARTS[slot].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    title={p.name}
                    aria-label={p.name}
                    style={{ ...styles.cell, ...(value[slot] === p.id ? styles.cellOn : null) }}
                    onClick={() => pick({ [slot]: p.id })}
                  >
                    {p.tint || p.file ? <PartThumb slot={slot} part={p} avatar={value} /> : <span style={styles.none}>없음</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}

// 색상표(아무 색) + 자주 쓰는 색. 끄는 동안에는 잠깐 멈췄을 때만 바깥에 알립니다.
function ColorField({ label, value, presets, onChange }: { label: string; value: string; presets?: string[]; onChange: (c: string) => void }) {
  const [draft, setDraft] = useState(value)
  // 바깥에서 색이 바뀌면(🎲 등) 그 색으로 맞춥니다. (렌더 중에 이전 값과 비교해 고치는 React 권장 방식)
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setDraft(value)
  }
  const latest = useRef(onChange)
  useEffect(() => {
    latest.current = onChange
  })
  useEffect(() => {
    if (draft === value) return
    const t = setTimeout(() => latest.current(draft), COLOR_DELAY_MS)
    return () => clearTimeout(t)
  }, [draft, value])
  return (
    <div style={styles.colorRow}>
      <span style={styles.label}>{label}</span>
      <input type="color" value={draft} onChange={(e) => setDraft(e.target.value)} style={styles.colorInput} aria-label={label} />
      {presets?.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`${label} ${c}`}
          style={{ ...styles.swatch, background: c, ...(draft === c ? styles.swatchOn : null) }}
          onClick={() => setDraft(c)}
        />
      ))}
    </div>
  )
}

// 부품 그림: 그 부위만 지금 차림의 색으로 그립니다.
function PartThumb({ slot, part, avatar }: { slot: Slot; part: Part; avatar: Avatar }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const key = avatarKey(avatar)
  useEffect(() => {
    if (ref.current) void drawPartThumb(ref.current, slot, part, avatar)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 차림이 바뀌었는지는 key 로 봄
  }, [slot, part, key])
  // 레티나 화면처럼 화면 배율이 크면 캔버스도 그만큼 크게 그려야 흐리지 않습니다(보이는 크기는 THUMB 그대로).
  const [ratio] = useState(() => Math.min(3, Math.ceil(window.devicePixelRatio || 1)))
  return <canvas ref={ref} width={THUMB * ratio} height={THUMB * ratio} style={{ width: THUMB, height: THUMB }} />
}

// 미리보기 캐릭터: 가만히 서 있는 동작
function Preview({ model }: { model: string }) {
  const ref = useRef<Group>(null!)
  const { scene, animations } = useGLTF(BASE_MODEL_URL)
  const copy = useMemo(() => scene.clone(true), [scene]) // 지점의 캐릭터와 같은 모델이라 복사본
  useEyeSkin(copy, model)
  const { actions } = useAnimations(animations, ref)
  useEffect(() => {
    actions.idle?.play()
  }, [actions])
  return (
    <group ref={ref}>
      <primitive object={copy} scale={SCALE} />
    </group>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  preview: { width: 220, height: 300, borderRadius: 10, overflow: 'hidden', background: '#16181d', flexShrink: 0 },
  side: { flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  tabs: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  tab: {
    padding: '6px 10px', borderRadius: 6, border: '1px solid #374151', background: 'transparent', color: '#cbd5e1',
    font: 'inherit', fontSize: 13, cursor: 'pointer',
  },
  tabOn: { background: '#374151', color: '#fff', fontWeight: 700 },
  section: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { color: '#cbd5e1', fontSize: 13 },
  grid: { display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${THUMB + 12}px, 1fr))`, gap: 6 },
  cell: {
    height: THUMB + 12, borderRadius: 8, border: '2px solid transparent', background: '#16181d',
    display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0,
  },
  cellOn: { border: `2px solid ${SELECTED}` },
  none: { color: '#9aa1ab', fontSize: 12 },
  colorRow: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  colorInput: { width: 44, height: 32, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' },
  swatch: { width: 26, height: 26, borderRadius: 6, border: '2px solid transparent', cursor: 'pointer', padding: 0 },
  swatchOn: { border: `2px solid ${SELECTED}` },
}
