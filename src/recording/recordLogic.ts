// 트래킹 기록 모드 (#190). 화면·React와 무관한 값과 계산입니다.
//
// C 조건의 팀원 캐릭터는 실시간 접속이 아니라 기록 재생입니다(실험 문서 4절). 팀원 3명이 room C 의 정해진 자리
// (18·19·20번)에 앉아 각본대로 공부하는 동안, 앱이 다른 참여자에게 보내는 값(participants.ts 의 PresenceState)을
// 0.25초마다 모아 파일(JSON)로 내려받습니다. 재생 모드(#195)가 이 파일을 읽어 그대로 다시 보냅니다.
// 같은 순간 웹캠 영상도 녹화해 A 조건(화상회의 화면, #192)의 팀원 영상으로 씁니다. A와 C가 같은 한 번의 수행에서
// 나와야 하기 때문입니다(실험 문서 4절). 녹화는 이 기록 모드에서 팀원 자신만 하고, 파일은 이 컴퓨터로만 내려받습니다.
// 서버로 보내지 않고, 참가자 화면에서는 녹화하지 않습니다.
import type { PresenceState } from '../realtime/participants'

export const RECORD_PARAM = 'record' // 주소의 ?record=18 → 18번 자리에 앉는 기록 모드
export const RECORD_INTERVAL_MS = 250 // 기록 간격. 다른 참여자에게 보내는 간격(SEND_INTERVAL_MS)과 같게
export const FILE_VERSION = 2 // 2: 함께 녹화한 영상 파일 이름(video) 추가

// 영상 녹화 형식. 앞에서부터 브라우저가 지원하는 것을 씁니다. (mp4는 맥 미리보기·QuickTime에서도 바로 열림)
export const VIDEO_TYPES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'] as const
export const VIDEO_BITS_PER_SECOND = 1_500_000 // 640×480 화면에 충분한 화질. 25분이면 약 280MB
export const VIDEO_CHUNK_MS = 1000 // 녹화 조각을 이 간격으로 받아 둡니다

// 품질 기준 (실험 문서 6-3절): 얼굴 인식률 90% 미만이거나 인식 끊김이 30초 이상이면 다시 기록
export const MIN_FACE_RATE = 0.9
export const MAX_GAP_SEC = 30

// 한 번의 기록. userId 는 재생할 계정이 따로 정해지므로 남기지 않습니다.
export type RecordSample = Omit<PresenceState, 'userId'> & { t: number } // t: 기록 시작부터 지난 시간(ms)

export type RecordQuality = {
  seatedSec: number // 앉아서 공부하던 시간(초). 품질은 이 동안만 셉니다
  faceRate: number // 그동안 얼굴(고개 각도)을 찾은 비율 0~1
  longestGapSec: number // 얼굴을 못 찾은 채로 가장 길게 이어진 시간(초)
  ok: boolean // 6-3절 기준을 넘는지
}

export type RecordFile = {
  version: number
  branch: string // 지점 slug (room-c)
  seat: number // 기록한 자리
  startedAt: string // 기록 시작 시각 (ISO)
  video: string | null // 같은 순간 시작한 영상 파일 이름 (없으면 null). t = 0 이 영상의 0초입니다
  intervalMs: number
  durationSec: number
  quality: RecordQuality
  samples: RecordSample[]
}

// 주소의 ?record= 값. 숫자 자리 번호가 아니면 null (기록 모드 아님)
export function recordSeatOf(search: string): number | null {
  const raw = new URLSearchParams(search).get(RECORD_PARAM)
  const no = raw === null ? NaN : Number(raw)
  return Number.isInteger(no) && no > 0 ? no : null
}

export function sampleOf(state: PresenceState, t: number): RecordSample {
  const { userId: _userId, ...rest } = state
  void _userId
  return { t, ...rest }
}

// 앉아서 공부한 동안(자리 있음, 공부 시작 뒤)의 얼굴 인식률과 가장 긴 끊김
export function qualityOf(samples: RecordSample[], intervalMs = RECORD_INTERVAL_MS): RecordQuality {
  const studying = samples.filter((s) => s.seat !== null && s.status !== 'idle')
  let found = 0
  let gap = 0
  let longest = 0
  for (const s of studying) {
    if (s.head) {
      found += 1
      gap = 0
    } else {
      gap += 1
      longest = Math.max(longest, gap)
    }
  }
  const faceRate = studying.length === 0 ? 0 : found / studying.length
  const longestGapSec = (longest * intervalMs) / 1000
  return {
    seatedSec: (studying.length * intervalMs) / 1000,
    faceRate,
    longestGapSec,
    ok: studying.length > 0 && faceRate >= MIN_FACE_RATE && longestGapSec < MAX_GAP_SEC,
  }
}

// videoType: 함께 녹화한 영상 형식 (녹화하지 않았으면 null)
export function buildFile(branch: string, seat: number, startedAt: Date, samples: RecordSample[], videoType: string | null = null): RecordFile {
  const last = samples[samples.length - 1]
  return {
    version: FILE_VERSION,
    branch,
    seat,
    startedAt: startedAt.toISOString(),
    video: videoType === null ? null : `${baseNameOf(branch, seat, startedAt)}.${videoExtOf(videoType)}`,
    intervalMs: RECORD_INTERVAL_MS,
    durationSec: last ? Math.round(last.t / 1000) : 0,
    quality: qualityOf(samples),
    samples,
  }
}

// 내려받을 파일 이름: record-room-c-seat18-20261023-1530.json (영상은 같은 이름에 .mp4 또는 .webm)
export function fileNameOf(file: RecordFile): string {
  return `${baseNameOf(file.branch, file.seat, new Date(file.startedAt))}.json`
}

function baseNameOf(branch: string, seat: number, d: Date): string {
  const two = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`
  return `record-${branch}-seat${seat}-${stamp}`
}

// 녹화 형식(video/mp4;codecs=avc1 등) → 확장자
export const videoExtOf = (type: string) => (type.startsWith('video/mp4') ? 'mp4' : 'webm')

// 브라우저가 지원하는 첫 녹화 형식. 하나도 없으면 null (영상 없이 수치만 기록)
export function pickVideoType(isSupported: (type: string) => boolean): string | null {
  return VIDEO_TYPES.find((type) => isSupported(type)) ?? null
}

// 화면에 보일 경과 시간: 12:34
export function clockOf(ms: number): string {
  const sec = Math.floor(ms / 1000)
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}
