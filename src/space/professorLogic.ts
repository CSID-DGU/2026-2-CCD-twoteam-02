// 강의동 교수 NPC 자리·교탁·말. React·three.js 와 무관한 순수 로직입니다. (Node 로 검사)
//
// 지점 JSON 의 professor: 교수가 서는 자리(x·z)와 보는 방향(rot, 0 = +z 남쪽, 좌석 rot 과 같은 식), 생김새(look).
// 카페 바리스타(baristaLogic)와 같은 방식이지만 주문은 없고, 인사와 강의실 시간표(timetableLogic) 알림만 합니다.
//   lecternOf     교탁 자리: 교수 앞 (부딪힘 상자이기도 함)
//   blockBoxes    부딪히는 상자: 교탁 + 교수 몸 (교수를 뚫고 지나가지 않게)
//   nearProfessor 내 자리가 교탁 앞(학생 쪽) 가까이인지 → 손 흔들며 인사
//   phaseLine     수업 시작·쉬는 시간이 될 때 교수가 하는 말
// 돈·DB·실시간 없이 내 화면에만 그립니다. 시간표가 시계 기준이라 모두의 화면에서 같은 때에 말합니다.
import type { BaristaLook } from './baristaLogic'
import { CLASS_MINUTES } from '../study/timetableLogic'

// 교수 생김새: 바리스타와 같은 캐릭터 부품(머리·옷 색) + 안경·넥타이 색. 앞치마·모자는 쓰지 않음
export type ProfessorLook = Pick<BaristaLook, 'hair' | 'hairColor' | 'top' | 'topColor' | 'bottomColor' | 'skin'> & { glasses?: string; tie?: string }
export type Professor = { x: number; z: number; rot: number; look: ProfessorLook; greeting?: string }

// w·d·h: 교탁 크기(m), ahead: 교수 자리에서 교탁 가운데까지, body: 교수 몸 부딪힘 상자 한 변
// reach: 교탁 가운데에서 이 거리 안이고 학생 쪽이면 가까움, sayMs: 말풍선을 띄워 두는 시간
export const LECTERN = { w: 0.7, d: 0.5, h: 1.1, ahead: 0.6 }
export const PROFESSOR = { body: 0.5, reach: 2.2, sayMs: 6000 }
export const DEFAULT_GREETING = '오늘도 화이팅! 📚'
const HOUR_MINUTES = 60

// 보는 방향 (단위 벡터). rot 0 이면 +z
const dirOf = (rot: number) => ({ x: Math.sin(rot), z: Math.cos(rot) })

export function lecternOf(p: Professor) {
  const d = dirOf(p.rot)
  return { x: p.x + d.x * LECTERN.ahead, z: p.z + d.z * LECTERN.ahead, rot: p.rot }
}

// 교탁은 돌려 놓아도 부딪힘은 축에 맞춘 상자라, 돌린 교탁이 다 들어가는 크기로 잡습니다
export function blockBoxes(p: Professor) {
  const l = lecternOf(p)
  const c = Math.abs(Math.cos(p.rot))
  const s = Math.abs(Math.sin(p.rot))
  const w = LECTERN.w * c + LECTERN.d * s
  const d = LECTERN.w * s + LECTERN.d * c
  return [
    { x: l.x, z: l.z, w, d },
    { x: p.x, z: p.z, w: PROFESSOR.body, d: PROFESSOR.body },
  ]
}

export function nearProfessor(me: { x: number; z: number }, p: Professor) {
  const l = lecternOf(p)
  const d = dirOf(p.rot)
  const inFront = (me.x - l.x) * d.x + (me.z - l.z) * d.z > 0 // 교탁보다 학생 쪽
  return inFront && Math.hypot(me.x - l.x, me.z - l.z) < PROFESSOR.reach
}

// 수업 시작·쉬는 시간 알림. period: 몇 교시 (timetableLogic.classPhase)
export function phaseLine(phase: 'class' | 'break', period: number): string {
  return phase === 'class' ? `${period}교시 수업 시작합니다 📖` : `${HOUR_MINUTES - CLASS_MINUTES}분 쉬었다 합시다 ☕`
}
