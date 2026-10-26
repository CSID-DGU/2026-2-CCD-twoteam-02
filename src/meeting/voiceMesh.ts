// 회의실 음성 연결 묶음 (#46). React 와 무관하게 브라우저의 WebRTC 를 직접 다룹니다(useVoice 가 감싸서 씀).
//
// WebRTC: 브라우저끼리 음성을 직접 주고받는 브라우저 기본 기능. 서버를 거치지 않아 녹음·저장되지 않습니다.
// RTCPeerConnection 하나가 상대 한 명과의 연결입니다. 참석자마다 하나씩 둡니다(메시).
//
// 연결 순서 (거는 쪽 = 계정 번호가 작은 쪽, voiceLogic.isCaller)
//   1. 거는 쪽: 음성 통로(transceiver)를 만들고 offer(연결 조건)를 보냅니다.
//   2. 받는 쪽: offer 를 받으면 연결을 새로 만들고 answer 를 돌려줍니다. (같은 사람에게서 offer 가 또 오면 예전 연결은 버림)
//   3. 양쪽: 연결할 수 있는 주소 후보(ICE)를 찾는 대로 서로 보냅니다.
//   이어지지 않거나 끊기면 거는 쪽이 처음부터 다시 겁니다.
//
// 마이크는 처음부터 통로에 끼우지 않고, 켤 때 replaceTrack 으로 끼웁니다. 그래서 끄고 켤 때 다시 연결하지 않아도 됩니다.
// 말하는 중인지는 받은 소리의 크기를 이 브라우저 안에서만 재서 정합니다(AnalyserNode).
import { CONNECT_TIMEOUT_MS, ICE_SERVERS, SPEAKING_LEVEL, isCaller, isSpeaking, parseSignal, rms } from './voiceLogic'

type Peer = {
  pc: RTCPeerConnection
  audio: HTMLAudioElement // 상대 목소리를 트는 곳(화면에는 붙이지 않음)
  analyser: AnalyserNode | null
  pendingIce: RTCIceCandidateInit[] // 연결 조건을 받기 전에 먼저 온 주소 후보
  timer: ReturnType<typeof setTimeout> | null // 연결 시간 초과 확인
  lastLoudAt: number | null
}

export class VoiceMesh {
  private peers = new Map<string, Peer>()
  private people = new Set<string>() // 지금 회의 방에 있는 다른 참석자
  private earlyIce = new Map<string, RTCIceCandidateInit[]>() // 연결을 만들기 전에 온 주소 후보
  private micTrack: MediaStreamTrack | null = null
  private micAnalyser: AnalyserNode | null = null
  private micLoudAt: number | null = null
  private ctx: AudioContext | null = null
  private closed = false
  speaking = new Set<string>() // 말하는 중인 사람(나 포함)
  blocked = false // 브라우저가 소리 재생을 막았는지 (화면을 한 번 누르면 풀림)

  private myId: string
  private send: (to: string, data: unknown) => void
  private onChange: () => void // 말하는 사람·재생 막힘이 바뀌었을 때

  constructor(myId: string, send: (to: string, data: unknown) => void, onChange: () => void) {
    this.myId = myId
    this.send = send
    this.onChange = onChange
  }

  // 소리 크기를 재는 데 쓰는 오디오 장치. 처음 쓸 때 만듭니다.
  private audioContext() {
    this.ctx ??= new AudioContext()
    return this.ctx
  }

  private analyserFor(stream: MediaStream) {
    const analyser = this.audioContext().createAnalyser()
    analyser.fftSize = 512
    this.audioContext().createMediaStreamSource(stream).connect(analyser) // 재기만 하고 스피커로는 보내지 않음
    return analyser
  }

  // 방에 있는 사람이 바뀌었을 때. 나간 사람과는 끊고, 새로 온 사람에게는 (내가 거는 쪽이면) 연결을 겁니다.
  setPeople(ids: string[]) {
    this.people = new Set(ids)
    for (const id of [...this.peers.keys()]) if (!this.people.has(id)) this.closePeer(id)
    this.tick()
  }

  // 1초마다: 거는 쪽인데 아직 연결이 없는 사람에게 연결을 겁니다(방에 막 들어와 신호를 못 보냈던 경우 등).
  tick() {
    if (this.closed) return
    for (const id of this.people) if (!this.peers.has(id) && isCaller(this.myId, id)) void this.call(id)
  }

  private newPeer(id: string): Peer {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const audio = new Audio()
    audio.autoplay = true
    const peer: Peer = { pc, audio, analyser: null, pendingIce: [], timer: null, lastLoudAt: null }
    pc.onicecandidate = (e) => {
      if (e.candidate) this.send(id, { kind: 'ice', candidate: e.candidate.toJSON() })
    }
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track])
      audio.srcObject = stream
      audio.play().catch(() => this.setBlocked(true)) // 사용자가 화면을 누르기 전에는 재생이 막힐 수 있음
      peer.analyser = this.analyserFor(stream)
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected' && peer.timer) {
        clearTimeout(peer.timer)
        peer.timer = null
      }
      // 끊겼으면 거는 쪽이 처음부터 다시 겁니다(받는 쪽은 새 offer 를 기다림).
      if (pc.connectionState === 'failed' && isCaller(this.myId, id)) this.retry(id)
    }
    this.peers.set(id, peer)
    // 먼저 와 있던 주소 후보를 넘겨받습니다.
    peer.pendingIce.push(...(this.earlyIce.get(id) ?? []))
    this.earlyIce.delete(id)
    return peer
  }

  // 거는 쪽: 음성 통로를 만들고 offer 를 보냅니다.
  private async call(id: string) {
    const peer = this.newPeer(id)
    const transceiver = peer.pc.addTransceiver('audio', { direction: 'sendrecv' })
    await transceiver.sender.replaceTrack(this.micTrack)
    const offer = await peer.pc.createOffer()
    if (this.peers.get(id) !== peer) return // 그사이 끊었으면 그만
    await peer.pc.setLocalDescription(offer)
    this.send(id, { kind: 'offer', sdp: offer.sdp })
    peer.timer = setTimeout(() => this.retry(id), CONNECT_TIMEOUT_MS)
  }

  private retry(id: string) {
    this.closePeer(id)
    if (this.people.has(id) && !this.closed) void this.call(id)
  }

  // 같은 회의 사람이 보낸 신호를 받았을 때 (useParticipants 의 SIGNAL_EVENT)
  async receive(from: string, data: unknown) {
    const signal = parseSignal(data)
    if (!signal || this.closed) return
    if (signal.kind === 'offer') {
      // 받는 쪽: 연결을 새로 만들어 answer 를 돌려줍니다.
      this.closePeer(from, true)
      const peer = this.newPeer(from)
      await peer.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp })
      const transceiver = peer.pc.getTransceivers()[0]
      if (transceiver) {
        transceiver.direction = 'sendrecv' // 받기만 하는 통로로 만들어지므로 보내기도 하게 바꿈
        await transceiver.sender.replaceTrack(this.micTrack)
      }
      const answer = await peer.pc.createAnswer()
      await peer.pc.setLocalDescription(answer)
      this.send(from, { kind: 'answer', sdp: answer.sdp })
      await this.flushIce(peer)
    } else if (signal.kind === 'answer') {
      const peer = this.peers.get(from)
      if (!peer || peer.pc.signalingState !== 'have-local-offer') return
      await peer.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp })
      await this.flushIce(peer)
    } else {
      const peer = this.peers.get(from)
      if (!peer) {
        // 연결을 만들기 전에 온 주소 후보는 모아 둡니다.
        this.earlyIce.set(from, [...(this.earlyIce.get(from) ?? []), signal.candidate])
        return
      }
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(signal.candidate).catch(() => {})
      else peer.pendingIce.push(signal.candidate)
    }
  }

  private async flushIce(peer: Peer) {
    const list = peer.pendingIce.splice(0)
    for (const c of list) await peer.pc.addIceCandidate(c).catch(() => {})
  }

  private closePeer(id: string, keepEarlyIce = false) {
    const peer = this.peers.get(id)
    if (!keepEarlyIce) this.earlyIce.delete(id)
    if (!peer) return
    if (peer.timer) clearTimeout(peer.timer)
    peer.pc.close()
    peer.audio.pause()
    peer.audio.srcObject = null
    this.peers.delete(id)
  }

  // 마이크를 켜거나(track) 끕니다(null). 끌 때는 마이크 자체를 멈춰 브라우저의 마이크 사용 표시도 꺼집니다.
  async setMicTrack(track: MediaStreamTrack | null) {
    if (this.micTrack && this.micTrack !== track) this.micTrack.stop()
    this.micTrack = track
    this.micAnalyser = track ? this.analyserFor(new MediaStream([track])) : null
    this.micLoudAt = null
    for (const peer of this.peers.values()) {
      const sender = peer.pc.getTransceivers()[0]?.sender
      if (sender) await sender.replaceTrack(track).catch(() => {})
    }
  }

  // 막힌 재생을 다시 시도합니다(화면을 누른 뒤).
  unlock() {
    void this.ctx?.resume()
    for (const peer of this.peers.values()) void peer.audio.play().catch(() => {})
    this.setBlocked(false)
  }

  private setBlocked(on: boolean) {
    if (this.blocked === on) return
    this.blocked = on
    this.onChange()
  }

  // 소리 크기를 재서 말하는 사람을 정합니다(0.1초마다).
  measure() {
    if (this.closed) return
    const now = performance.now()
    const level = (analyser: AnalyserNode | null) => {
      if (!analyser) return 0
      const buf = new Float32Array(analyser.fftSize)
      analyser.getFloatTimeDomainData(buf)
      return rms(buf)
    }
    const next = new Set<string>()
    for (const [id, peer] of this.peers) {
      if (level(peer.analyser) > SPEAKING_LEVEL) peer.lastLoudAt = now
      if (isSpeaking(peer.lastLoudAt, now)) next.add(id)
    }
    if (level(this.micAnalyser) > SPEAKING_LEVEL) this.micLoudAt = now
    if (this.micTrack && isSpeaking(this.micLoudAt, now)) next.add(this.myId)
    const changed = next.size !== this.speaking.size || [...next].some((id) => !this.speaking.has(id))
    this.speaking = next
    if (changed) this.onChange()
  }

  // 회의에서 나갈 때: 모든 연결과 마이크를 끕니다.
  close() {
    this.closed = true
    for (const id of [...this.peers.keys()]) this.closePeer(id)
    this.micTrack?.stop()
    this.micTrack = null
    void this.ctx?.close()
  }
}
