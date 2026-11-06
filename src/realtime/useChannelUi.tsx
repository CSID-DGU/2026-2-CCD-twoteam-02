// 광장·카페 화면이 같이 쓰는 채널 화면과 따라가기 설정 (#442, #481).
//
// 채널은 장소를 모두 포함한 세계라, 광장(WorldScene)과 카페(BranchScene)가 똑같이 동작해야 합니다.
//   overlay  채널 표시(인원·혼잡도, 바꾸기), 전체 상한 입장 대기, 친구가 다른 채널에 있을 때 옮길지 묻는 창
//   arrival  useFollowArrival 에 넘길 장소·준비 여부·채널 설정
// 고른 채널이 가득 차 못 옮기면 채팅 로그에 안내합니다(따라가던 중이면 따라가기를 버리고 부르기를 권함).
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useChat } from '../chat/chatContext'
import { dropFollowTo, followInChannel } from '../friends/useFollow'
import type { FollowReason } from '../friends/useFollow'
import { ChannelBadge, ChannelFollowAsk, ChannelWaiting } from './ChannelBadge'
import type { useChannel } from './useChannel'

type Ask = { friendId: string; reason: FollowReason; no: number }

type Options = {
  channel: ReturnType<typeof useChannel>
  place: string // 이 화면의 장소 (접속 상태의 place)
  seated: boolean // 앉아 있으면 채널을 바꾸지 않음 (자리는 채널별)
  count: number // 내 채널 인원 (나 포함, 지금 방 기준)
  showBadge: boolean // 채널 표시를 보일지 (숨김 모드·앉아 있을 때는 숨김)
}

export function useChannelUi({ channel, place, seated, count: roomCount, showBadge }: Options) {
  const chat = useChat()
  // 채널 인원은 장소를 모두 합친 수라 서버 현황(배정·창 열 때 받음)과 지금 방 인원 중 큰 쪽을 보입니다
  const count = Math.max(roomCount, channel.channels.find((c) => c.no === channel.no)?.count ?? 0)
  const [ask, setAsk] = useState<Ask | null>(null)

  // 가득 찼는지는 서버가 정합니다(정원 20명). 가득 차면 방을 바꾸지 않고 channel.rejected 로 알려 줍니다
  const moveToFriend = (a: Ask) => {
    setAsk(null)
    followInChannel(a.friendId, a.reason, a.no)
    channel.changeTo(a.no)
  }

  const shownRejection = useRef<number | null>(null)
  useEffect(() => {
    const r = channel.rejected
    if (!r || shownRejection.current === r.seq) return
    shownRejection.current = r.seq
    if (dropFollowTo(r.no)) chat?.note(`${r.no}채널이 가득 차서 따라갈 수 없어요. 친구에게 [부르기]를 해 보세요.`)
    else chat?.note(`${r.no}채널이 가득 찼어요. 다른 채널을 골라 주세요.`)
  }, [channel.rejected, chat])

  const arrival = {
    // 채널이 나뉘면 방 이름이 장소. 채널을 옮기거나 배정이 끝나면 친구를 기다리는 시간을 새로 셈
    place: channel.split ? channel.room ?? `${place}#배정중` : place,
    ready: !channel.split || channel.room !== null,
    channel: channel.split && channel.room ? {
      mine: channel.no,
      onOtherChannel: (friendId: string, reason: FollowReason, no: number) => {
        if (seated) chat?.note(`친구는 ${no}채널에 있어요. 자리에서 일어난 뒤 다시 따라가 주세요.`)
        else setAsk({ friendId, reason, no })
      },
    } : undefined,
  }

  const overlay: ReactNode = (
    <>
      {showBadge && channel.split && channel.room && !seated && (
        <ChannelBadge no={channel.no} count={count} capacity={channel.capacity} autoFill={channel.autoFill} channels={channel.channels} onOpen={() => void channel.refresh()} onChange={channel.changeTo} />
      )}
      {channel.waiting && <ChannelWaiting total={channel.total} totalCapacity={channel.totalCapacity} />}
      {ask && <ChannelFollowAsk no={ask.no} reason={ask.reason} onYes={() => moveToFriend(ask)} onNo={() => setAsk(null)} />}
    </>
  )

  return { arrival, overlay }
}
