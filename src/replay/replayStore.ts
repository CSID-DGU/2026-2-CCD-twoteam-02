// 재생할 기록 파일을 이 브라우저 안에 저장해 둡니다 (#195). 화면·React와 무관한 저장 코드입니다.
//
// 기록 파일은 git·서버에 올리지 않고(CLAUDE.md), 재생용 컴퓨터의 브라우저 안(IndexedDB)에만 둡니다.
// 재생 계정마다 브라우저 프로필이 따로라 저장도 프로필마다 따로입니다. 한 번 골라 두면 새로고침해도 다시 고르지 않습니다.
// (room A 영상 저장 videoStore.ts 와 같은 방식)

export type SavedRecord = { name: string; text: string } // 원래 파일 이름과 내용(JSON 글자)

const DB_NAME = 'dooteum-replay'
const STORE = 'records'
const KEY = 'current'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// 저장해 둔 기록. 없거나 읽지 못하면 null
export async function loadRecord(): Promise<SavedRecord | null> {
  try {
    const db = await openDb()
    const saved = await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    db.close()
    const r = saved as Partial<SavedRecord> | undefined
    return r && typeof r.name === 'string' && typeof r.text === 'string' ? { name: r.name, text: r.text } : null
  } catch {
    return null
  }
}

export async function saveRecord(record: SavedRecord): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(record, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}
