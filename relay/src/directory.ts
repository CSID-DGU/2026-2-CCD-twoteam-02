// 채널 안내 객체 (#442). 서비스 전체에 하나만 있다.
//
// 방 객체는 서로를 모른다. 그래서 방마다 활동 인원이 바뀔 때 여기로 알리고,
// 화면은 입장 전에 여기서 "어느 채널로 갈지"와 "전체 상한을 넘었는지"를 받는다.
//
// 여기 값은 안내용이다. 실제 정원은 방 객체가 입장할 때 다시 확인하므로, 여기가 잠깐 틀려도 정원을 넘지 않는다.
// 방이 알리는 값은 증감이 아니라 지금 인원이라 다음 알림에서 저절로 맞춰진다.
//
// 인원은 저장소에도 적는다. 객체가 메모리에서 내려갔다 올라와도 현황을 잃지 않게 하려는 것이다.
// 위치처럼 초당 여러 번 바뀌는 값이 아니라 입장·퇴장 때만 쓰므로 쓰기 양이 적다.
import { DurableObject } from 'cloudflare:workers'
import { assignChannel, CHANNEL_CAPACITY, channelCounts, TOTAL_CAPACITY, totalCount, type Holds } from './relayLogic'
import type { RelayEnv } from './index'

export const DIRECTORY_NAME = 'global'

export type RoomReport = { room: string; count: number; joined?: string } // joined: 방금 들어온 사람. 그 사람의 자리 맡기를 푼다
export type AssignRequest = { world: string; want: number | null; userId: string; peek: boolean } // peek: 현황만 본다. 자리를 맡지 않는다

export class ChannelDirectory extends DurableObject<RelayEnv> {
  private counts = new Map<string, number>()
  private holds: Holds = new Map()

  constructor(ctx: DurableObjectState, env: RelayEnv) {
    super(ctx, env)
    void ctx.blockConcurrencyWhile(async () => {
      this.counts = await ctx.storage.list<number>()
    })
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === '/report') return this.report((await request.json()) as RoomReport)
    if (pathname === '/assign') return this.assign((await request.json()) as AssignRequest)
    return new Response('not found', { status: 404 })
  }

  private async report({ room, count, joined }: RoomReport): Promise<Response> {
    if (joined) this.holds.delete(joined)
    if (count > 0) {
      this.counts.set(room, count)
      await this.ctx.storage.put(room, count)
    } else if (this.counts.delete(room)) {
      await this.ctx.storage.delete(room)
    }
    return new Response(null, { status: 204 })
  }

  private assign({ world, want, userId, peek }: AssignRequest): Response {
    const now = Date.now()
    const assigned = peek ? null : assignChannel(world, want, userId, this.counts, this.holds, now)
    return Response.json({
      assigned,
      total: totalCount(this.counts, this.holds, now),
      channels: channelCounts(world, this.counts),
      capacity: CHANNEL_CAPACITY,
      totalCapacity: TOTAL_CAPACITY,
    })
  }
}
