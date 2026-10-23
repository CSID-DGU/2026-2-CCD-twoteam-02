// room A(캠 ON 조건) 화상회의 화면에 띄울 팀원 녹화 영상과 이름 (#192). 화면·React와 무관한 저장 코드입니다.
//
// 영상은 git·서버에 올리지 않고(CLAUDE.md), 실험용 컴퓨터의 브라우저 안(IndexedDB)에만 둡니다.
// 진행자가 한 번 골라 두면 다음부터 자동으로 틀어서, 참가자는 고르는 화면을 볼 일이 없습니다.
// IndexedDB: 브라우저가 기기 안에 큰 파일(영상 등)까지 담아 두는 저장소. 사이트·브라우저마다 따로이고 밖으로 나가지 않습니다.

export type PeerVideo = {
  name: string // 이름표 (C 지점의 팀원 캐릭터 닉네임과 같게, #194)
  file: Blob | null // 녹화 영상. 아직 안 골랐으면 null
  fileName: string // 진행자가 알아보기 위한 원래 파일 이름
}

export const PEER_COUNT = 3 // 화면에 나오는 팀원 수 (팀원 3명, 2026-10-23 결정)
export const DEFAULT_PEERS: PeerVideo[] = [
  { name: '참여자 1', file: null, fileName: '' },
  { name: '참여자 2', file: null, fileName: '' },
  { name: '참여자 3', file: null, fileName: '' },
]

const DB_NAME = 'dooteum-room-a'
const STORE = 'videos'
const KEY = 'peers'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// 저장해 둔 팀원 영상. 없거나 읽지 못하면 기본값(영상 없음)
export async function loadPeers(): Promise<PeerVideo[]> {
  try {
    const db = await openDb()
    const saved = await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    db.close()
    if (!Array.isArray(saved)) return DEFAULT_PEERS
    return DEFAULT_PEERS.map((d, i) => ({ ...d, ...(saved[i] as Partial<PeerVideo> | undefined) }))
  } catch {
    return DEFAULT_PEERS
  }
}

export async function savePeers(peers: PeerVideo[]): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(peers.slice(0, PEER_COUNT), KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}
