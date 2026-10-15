// 로그인 정보를 어디에 둘지 고릅니다. (#128)
//
// 왜 필요한가:
//   Supabase 기본값은 로그인 정보를 localStorage 에 넣고 만료 전에 자동으로 갱신합니다.
//   그래서 브라우저를 닫았다 열어도 로그인이 계속 유지됩니다. 학교 실습실이나 공용
//   컴퓨터에서 쓰고 나가면 다음 사람이 그대로 들어갈 수 있습니다.
//
// 어떻게 하는가:
//   기본은 sessionStorage 에 둡니다. 새로고침과 탭 안 이동은 유지되지만, 창을 닫으면
//   사라집니다. "로그인 유지"를 고른 사람만 localStorage 에 둬서 다음에 와도 유지합니다.
//
//   createClient 는 저장소를 한 번만 정할 수 있고, 어디에 둘지는 로그인할 때 정해집니다.
//   그래서 "그때그때 둘 중 하나를 고르는 저장소"를 만들어 넘깁니다.
//
// 주의:
//   브라우저가 저장소를 막아 두면(시크릿 모드 등) 읽기·쓰기가 예외를 던집니다.
//   그러면 로그인 자체가 안 되므로 전부 try/catch 로 감쌉니다. 저장이 안 되면
//   메모리에만 남아 새로고침 시 로그아웃되는데, 아예 못 들어가는 것보다 낫습니다.

const KEEP_FLAG = 'twoteam.keepSignedIn'

// 지금 "로그인 유지"가 켜져 있는가. 이 값 자체는 localStorage 에 둡니다.
// (sessionStorage 에 두면 창을 닫을 때 같이 사라져서 다음 방문에 알 수 없습니다)
export function isKeepSignedIn(): boolean {
  try {
    return window.localStorage.getItem(KEEP_FLAG) === '1'
  } catch {
    return false
  }
}

// 로그인할 때 호출합니다. 끄는 경우 localStorage 에 남은 로그인 정보도 같이 지웁니다.
export function setKeepSignedIn(keep: boolean) {
  try {
    if (keep) {
      window.localStorage.setItem(KEEP_FLAG, '1')
    } else {
      window.localStorage.removeItem(KEEP_FLAG)
      // 전에 "유지"로 로그인해 둔 흔적이 남아 있으면 창을 닫아도 안 지워집니다.
      moveKeysOut(window.localStorage)
    }
  } catch {
    // 저장소를 못 쓰는 환경. 이 경우 유지 자체가 안 되므로 그냥 넘어갑니다.
  }
}

// Supabase 가 쓰는 키만 골라 지웁니다. 다른 값은 건드리지 않습니다.
function moveKeysOut(store: Storage) {
  try {
    const keys: string[] = []
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i)
      if (k && k.startsWith('sb-')) keys.push(k)
    }
    for (const k of keys) store.removeItem(k)
  } catch {
    // 무시
  }
}

// 로그아웃할 때 양쪽을 모두 비웁니다.
// 체크 여부도 함께 지워서, 다음에 로그인 화면에 왔을 때 항상 해제된 상태로 시작합니다.
export function clearStoredSession() {
  try {
    window.localStorage.removeItem(KEEP_FLAG)
  } catch {
    // 무시
  }
  moveKeysOut(safe(() => window.localStorage))
  moveKeysOut(safe(() => window.sessionStorage))
}

function safe(get: () => Storage): Storage {
  try {
    return get()
  } catch {
    return memoryStore
  }
}

// 저장소를 아예 못 쓰는 환경에서 쓰는 대체품. 새로고침하면 사라집니다.
const memory = new Map<string, string>()
const memoryStore: Storage = {
  get length() {
    return memory.size
  },
  key: (i) => [...memory.keys()][i] ?? null,
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
  clear: () => memory.clear(),
}

// createClient 에 넘길 저장소. 읽고 쓸 때마다 "지금 어디에 둘지"를 다시 고릅니다.
export const choosingStorage = {
  getItem(key: string): string | null {
    // 읽을 때는 양쪽을 다 봅니다. "유지"로 로그인해 둔 사람이 다시 들어온 경우에도
    // 찾을 수 있어야 하기 때문입니다.
    try {
      return window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key)
    } catch {
      return memoryStore.getItem(key)
    }
  },
  setItem(key: string, value: string): void {
    try {
      const store = isKeepSignedIn() ? window.localStorage : window.sessionStorage
      store.setItem(key, value)
    } catch {
      memoryStore.setItem(key, value)
    }
  },
  removeItem(key: string): void {
    try {
      window.sessionStorage.removeItem(key)
      window.localStorage.removeItem(key)
    } catch {
      memoryStore.removeItem(key)
    }
  },
}
