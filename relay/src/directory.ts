// 예전 채널 안내 객체 (#442). #481 부터 채널은 장소를 모두 포함한 세계라, 배정을 접속 표시 방(online.ts)이 한다.
//
// Durable Object 클래스는 배포 기록(wrangler.jsonc 의 migrations)에 남아 있어 지우려면 삭제 마이그레이션이 따로 필요하다.
// 저장된 인원 기록도 함께 지워지므로, 새 배정이 안정된 뒤에 지우기로 하고 지금은 아무 일도 하지 않게 남겨 둔다.
import { DurableObject } from 'cloudflare:workers'
import type { RelayEnv } from './index'

export class ChannelDirectory extends DurableObject<RelayEnv> {
  async fetch(): Promise<Response> {
    return new Response('gone', { status: 410 })
  }
}
