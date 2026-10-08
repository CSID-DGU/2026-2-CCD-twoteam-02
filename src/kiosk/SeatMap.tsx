// 키오스크 좌석 배치도.
//
// 좌표의 원본은 src/space/branches/byeol.json 이다. 지점 공간 화면과 같은 값을 쓰므로
// 여기서 고른 자리가 2D 공간의 그 자리와 정확히 맞는다.
// 위에서 내려다본 그림이라 x 는 가로, z 는 세로로 그대로 쓴다.
import branch from '../space/branches/byeol.json'
import { SEAT } from '../space/layout'

type Props = {
  occupied: Set<number> // 이용 중인 좌석 번호
  selected: number | null
  onSelect: (seatNumber: number) => void
}

const COLOR = {
  floor: '#e8e2d6',
  wall: '#8a8f98',
  room: '#c9d6e3',
  kiosk: '#22c55e',
  free: '#4ade80',
  occupied: '#6b7280',
  selected: '#f59e0b',
}

export default function SeatMap({ occupied, selected, onSelect }: Props) {
  const { w, d } = branch.size

  return (
    <svg
      viewBox={`${-w / 2} ${-d / 2} ${w} ${d}`}
      style={{ width: '100%', height: 'auto', borderRadius: 8, background: COLOR.floor }}
      role="group"
      aria-label="좌석 배치도"
    >
      {branch.rooms.map((r) => (
        <g key={`room-${r.no}`}>
          <rect x={r.x - r.w / 2} y={r.z - r.d / 2} width={r.w} height={r.d} fill={COLOR.room} />
          <text x={r.x} y={r.z} fontSize={0.7} fill="#5b6b7c" textAnchor="middle" dominantBaseline="middle">
            회의실 {r.no}
          </text>
        </g>
      ))}

      {branch.walls.map((wall, i) => (
        <rect
          key={`wall-${i}`}
          x={wall.x - wall.w / 2}
          y={wall.z - wall.d / 2}
          width={wall.w}
          height={wall.d}
          fill={COLOR.wall}
        />
      ))}

      <g>
        <rect x={branch.kiosk.x - 0.4} y={branch.kiosk.z - 0.3} width={0.8} height={0.6} fill={COLOR.kiosk} />
        <text x={branch.kiosk.x} y={branch.kiosk.z + 1.1} fontSize={0.6} fill="#2f6b43" textAnchor="middle">
          키오스크
        </text>
      </g>

      {branch.seats.map((s) => {
        const isOccupied = occupied.has(s.no)
        const isSelected = selected === s.no
        const fill = isSelected ? COLOR.selected : isOccupied ? COLOR.occupied : COLOR.free
        return (
          <g
            key={s.no}
            onClick={() => !isOccupied && onSelect(s.no)}
            style={{ cursor: isOccupied ? 'not-allowed' : 'pointer' }}
            role="button"
            aria-label={`${s.no}번 좌석 ${isOccupied ? '이용 중' : '빈자리'}`}
          >
            <rect
              x={s.x - SEAT.w / 2}
              y={s.z - SEAT.d / 2}
              width={SEAT.w}
              height={SEAT.d}
              rx={0.12}
              fill={fill}
              stroke={isSelected ? '#b45309' : 'none'}
              strokeWidth={0.12}
            />
            <text
              x={s.x}
              y={s.z}
              fontSize={0.42}
              fill={isOccupied ? '#d1d5db' : '#14532d'}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {s.no}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
