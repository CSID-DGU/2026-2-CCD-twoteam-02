// 실험 팀원 3명의 녹화 파일 목록 (public/experiment/peers.json, #192 #195).
// 참가자 화면이 사이트에서 직접 받습니다. room A 는 영상(영상 서버에서 받음)을, room C 는 기록(JSON)을 씁니다.
import type { RecordFile } from '../recording/recordLogic'
import { parseRecordFile } from './replayLogic'

export const MANIFEST_URL = '/experiment/peers.json'
const FOLDER = '/experiment/'

export type PeerEntry = {
  name: string // 이름표
  model: string // room C 캐릭터 모습 (character-<model>.glb)
  record: string // 이 폴더의 기록 파일 이름
  video: string // 영상 서버에 올린 영상 파일 이름. 비어 있으면 없음
}

export type Manifest = {
  videoServer: string // 영상 서버(Worker) 주소. 비어 있으면 영상 없음
  peers: PeerEntry[]
}

export type PeerRecord = PeerEntry & { file: RecordFile }

const EMPTY: Manifest = { videoServer: '', peers: [] }

function isEntry(v: unknown): v is PeerEntry {
  const e = v as Partial<PeerEntry>
  return typeof e === 'object' && e !== null && typeof e.name === 'string' && typeof e.model === 'string' && typeof e.record === 'string' && typeof e.video === 'string'
}

// 목록을 읽습니다. 못 읽으면 빈 목록 (팀원이 안 보일 뿐 화면은 동작)
export async function loadManifest(): Promise<Manifest> {
  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-cache' })
    if (!res.ok) throw new Error(String(res.status))
    const data = (await res.json()) as Partial<Manifest>
    if (typeof data !== 'object' || data === null || !Array.isArray(data.peers) || !data.peers.every(isEntry)) throw new Error('모양이 다름')
    return { videoServer: typeof data.videoServer === 'string' ? data.videoServer.replace(/\/$/, '') : '', peers: data.peers }
  } catch (e) {
    console.error('팀원 목록(peers.json)을 읽지 못했습니다:', e)
    return EMPTY
  }
}

// 목록과 기록 파일까지 읽습니다. 못 읽은 사람은 뺍니다.
export async function loadPeerRecords(): Promise<PeerRecord[]> {
  const { peers } = await loadManifest()
  const loaded = await Promise.all(
    peers.map(async (e) => {
      try {
        const res = await fetch(FOLDER + e.record)
        if (!res.ok) throw new Error(String(res.status))
        const file = parseRecordFile(await res.text())
        if (typeof file === 'string') throw new Error(file)
        return { ...e, file }
      } catch (err) {
        console.error(`팀원 기록(${e.record})을 읽지 못했습니다:`, err)
        return null
      }
    }),
  )
  return loaded.filter((p): p is PeerRecord => p !== null)
}

// 영상 서버에 로그인 토큰을 보여 주고, 이 영상의 잠깐 유효한 주소를 받습니다. (로그인한 실험 계정만 볼 수 있게)
// 못 받으면 null (그 칸은 이름만 보임)
export async function signVideoUrl(server: string, file: string, accessToken: string): Promise<string | null> {
  if (!server || !file) return null
  try {
    const res = await fetch(`${server.replace(/\/$/, '')}/sign?file=${encodeURIComponent(file)}`, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(String(res.status))
    const data = (await res.json()) as { url?: unknown }
    return typeof data.url === 'string' ? data.url : null
  } catch (e) {
    console.error(`영상 주소(${file})를 받지 못했습니다:`, e)
    return null
  }
}
