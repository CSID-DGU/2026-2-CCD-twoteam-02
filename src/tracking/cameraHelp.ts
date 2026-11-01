// 카메라 안내 (#376). React 와 무관한 순수 로직입니다. (Node 로 검사)
//
//   CAMERA_PRIVACY  카메라를 켜기 전 안내 문구. 나중에 앱(iOS NSCameraUsageDescription, 안드로이드 권한 안내)에도 같은 문장을 씁니다.
//   cameraProblem   웹캠을 못 켰을 때 오류 이름(DOMException.name)으로 원인을 나눔
//   detectPlatform  지금 기기·브라우저. 앱 껍데기(Capacitor 등) 안이면 iOS 앱·안드로이드 앱으로 구분
//   cameraSteps     원인 + 기기에 맞는 해결 단계

export const CAMERA_PRIVACY = {
  title: '카메라를 켤게요',
  what: '카메라로 고개 방향·눈 감음·자리에 있는지만 봐요.',
  promise: '영상은 이 기기 밖으로 나가지 않고, 저장하지도 않아요. 서버로는 숫자만 보내요.',
} as const

export type CameraProblem = 'denied' | 'no-camera' | 'in-use' | 'insecure' | 'model' | 'unknown'
export const MODEL_LOAD_ERROR = 'ModelLoadError' // 인식 모델을 못 불러옴 (카메라는 문제없음, useTracking 이 붙이는 이름)
export type Platform = 'ios-app' | 'android-app' | 'ios' | 'android' | 'edge' | 'chrome' | 'safari' | 'firefox' | 'other'

// getUserMedia 가 던진 오류 이름으로 원인 나누기
export function cameraProblem(errorName: string, secure = true): CameraProblem {
  if (!secure) return 'insecure' // http 주소에서는 브라우저가 카메라를 아예 막음
  switch (errorName) {
    case MODEL_LOAD_ERROR:
      return 'model'
    case 'NotAllowedError':
    case 'PermissionDeniedError': // 예전 크롬 이름
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'no-camera'
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'in-use'
    default:
      return 'unknown'
  }
}

// 기기·브라우저 구분. nativeApp: 앱 껍데기 안인지 (Capacitor 는 window.Capacitor.isNativePlatform())
export function detectPlatform(ua: string, nativeApp = false): Platform {
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile\//i.test(ua)) // 아이패드는 맥처럼 자기를 소개하기도 함
  const android = /Android/i.test(ua)
  if (nativeApp) return ios ? 'ios-app' : android ? 'android-app' : 'other'
  if (ios) return 'ios' // 아이폰·아이패드는 크롬을 깔아도 사파리 엔진이라 권한 위치가 같음
  if (android) return 'android'
  if (/Edg\//.test(ua)) return 'edge'
  if (/Firefox\//.test(ua)) return 'firefox'
  if (/Chrome\//.test(ua)) return 'chrome'
  if (/Safari\//.test(ua)) return 'safari'
  return 'other'
}

export const PROBLEM_TITLE: Record<CameraProblem, string> = {
  denied: '카메라 사용을 허용하지 않았어요',
  'no-camera': '연결된 웹캠을 찾지 못했어요',
  'in-use': '다른 앱이 카메라를 쓰고 있어요',
  insecure: '이 주소에서는 카메라를 켤 수 없어요',
  model: '얼굴 인식을 준비하지 못했어요',
  unknown: '카메라를 켜지 못했어요',
}

const ALLOW_STEPS: Record<Platform, string[]> = {
  chrome: ['주소창 왼쪽의 자물쇠(사이트 정보)를 눌러요', '카메라를 "허용"으로 바꿔요', '아래 [다시 시도]를 눌러요'],
  edge: ['주소창 왼쪽의 자물쇠를 눌러요', '사이트 사용 권한 → 카메라를 "허용"으로 바꿔요', '아래 [다시 시도]를 눌러요'],
  safari: ['메뉴 막대의 Safari → 설정 → 웹사이트 → 카메라를 열어요', '이 사이트를 "허용"으로 바꿔요', '아래 [다시 시도]를 눌러요'],
  firefox: ['주소창 왼쪽의 카메라 아이콘(줄 그어짐)을 눌러요', '"차단됨"을 지워요', '아래 [다시 시도]를 눌러요'],
  ios: ['설정 앱 → Safari → 카메라를 "허용" 또는 "묻기"로 바꿔요', '이 페이지로 돌아와 [다시 시도]를 눌러요'],
  android: ['주소창 왼쪽의 자물쇠 → 권한 → 카메라를 "허용"으로 바꿔요', '아래 [다시 시도]를 눌러요'],
  'ios-app': ['설정 앱 → 두뜀 → 카메라를 켜요', '앱으로 돌아와 [다시 시도]를 눌러요'],
  'android-app': ['설정 → 애플리케이션 → 두뜀 → 권한 → 카메라를 "허용"으로 바꿔요', '앱으로 돌아와 [다시 시도]를 눌러요'],
  other: ['브라우저 설정에서 이 사이트의 카메라 권한을 "허용"으로 바꿔요', '아래 [다시 시도]를 눌러요'],
}

// 원인 + 기기에 맞는 해결 단계
export function cameraSteps(problem: CameraProblem, platform: Platform): string[] {
  switch (problem) {
    case 'denied':
      return ALLOW_STEPS[platform]
    case 'no-camera':
      return ['웹캠이 연결돼 있는지 확인해요 (외장 웹캠은 다시 꽂아 보세요)', '아래 [다시 시도]를 눌러요']
    case 'in-use':
      return ['Zoom·Teams·카메라 앱처럼 카메라를 쓰는 다른 프로그램이나 탭을 닫아요', '아래 [다시 시도]를 눌러요']
    case 'insecure':
      return ['https:// 로 시작하는 주소로 들어와 주세요']
    case 'model':
      return ['인터넷 연결을 확인해요 (인식 프로그램을 처음 한 번 받아 와요)', '아래 [다시 시도]를 눌러요']
    default:
      return ['페이지를 새로고침하거나 다른 브라우저(크롬 등)로 들어와 보세요', '아래 [다시 시도]를 눌러요']
  }
}
