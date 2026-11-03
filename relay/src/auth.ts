// Supabase 액세스 토큰(JWT) 확인 (#451)
//
// JWT 는 "머리.내용.서명" 세 조각이다. 서명이 맞으면 내용(누구인지, 언제까지인지)을 믿을 수 있다.
// 라이브러리를 더하지 않고 Workers 에 내장된 crypto.subtle 로 확인한다.
//
//   ES256·RS256  요즘 Supabase 프로젝트 방식. 공개 키를 {프로젝트 주소}/auth/v1/.well-known/jwks.json 에서 받는다
//   HS256        예전 프로젝트 방식이자 측정 봇 방식. 비밀값 JWT_HS256_SECRET 을 넣었을 때만 받아 준다
//
// 머리에 적힌 알고리즘을 그대로 믿으면 안 된다. 그래서 이름마다 쓸 수 있는 키 종류를 고정한다.
// (alg 가 none 이거나, 공개 키를 HMAC 비밀값처럼 쓰게 하는 공격을 막는다)

const JWKS_TTL_MS = 600000 // 공개 키를 들고 있는 시간. Supabase 쪽 캐시도 10분이다
const JWKS_MISS_RETRY_MS = 30000 // 모르는 키 번호(kid)가 와도 이 간격 안에는 다시 받지 않는다. 가짜 토큰으로 Supabase 를 두드리지 못하게 한다

type Jwk = JsonWebKey & { kid?: string }
type Claims = { sub?: unknown; exp?: unknown; iss?: unknown; aud?: unknown; role?: unknown }

export type AuthConfig = { supabaseUrl: string; hs256Secret?: string }
export type Verified = { userId: string; expiresAt: number } // expiresAt: 밀리초

let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null

async function findJwk(supabaseUrl: string, kid: string, now: number): Promise<Jwk | null> {
  const find = () => jwksCache?.keys.find((k) => k.kid === kid) ?? null
  const age = jwksCache ? now - jwksCache.fetchedAt : Infinity
  const known = age < JWKS_TTL_MS ? find() : null
  if (known) return known
  if (age < JWKS_MISS_RETRY_MS) return null
  const res = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)
  if (!res.ok) return find() // 받지 못하면 들고 있던 키로 버틴다
  jwksCache = { keys: ((await res.json()) as { keys?: Jwk[] }).keys ?? [], fetchedAt: now }
  return find()
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const parseJson = <T>(text: string) => JSON.parse(new TextDecoder().decode(fromBase64Url(text))) as T

async function signatureIsValid(alg: unknown, kid: unknown, signed: BufferSource, signature: BufferSource, config: AuthConfig, now: number): Promise<boolean> {
  if (alg === 'HS256') {
    if (!config.hs256Secret) return false
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(config.hs256Secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    return crypto.subtle.verify('HMAC', key, signature, signed)
  }
  if ((alg !== 'ES256' && alg !== 'RS256') || typeof kid !== 'string') return false
  const jwk = await findJwk(config.supabaseUrl, kid, now)
  if (!jwk) return false
  if (alg === 'ES256') {
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') return false
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, signed)
  }
  if (jwk.kty !== 'RSA') return false
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed)
}

// 맞으면 누구인지와 만료 시각, 틀리면 null. 이유는 일부러 구분하지 않는다.
export async function verifyToken(token: string, config: AuthConfig, now = Date.now()): Promise<Verified | null> {
  try {
    const [head, body, sig, ...rest] = token.split('.')
    if (!head || !body || !sig || rest.length > 0) return null
    const header = parseJson<{ alg?: unknown; kid?: unknown }>(head)
    const signed = new TextEncoder().encode(`${head}.${body}`)
    if (!(await signatureIsValid(header.alg, header.kid, signed, fromBase64Url(sig), config, now))) return null

    const claims = parseJson<Claims>(body)
    const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null
    if (claims.iss !== `${config.supabaseUrl}/auth/v1`) return null
    if (!auds.includes('authenticated') || claims.role !== 'authenticated') return null // 익명 공개 키(anon)·service_role 은 사람이 아니다
    if (typeof claims.sub !== 'string' || claims.sub === '' || claims.sub.length > 64) return null
    return { userId: claims.sub, expiresAt: claims.exp * 1000 }
  } catch {
    return null // 조각이 깨졌거나 JSON 이 아니거나 키 형식이 틀린 경우
  }
}
