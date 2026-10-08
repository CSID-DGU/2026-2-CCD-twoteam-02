// 키오스크 자리 표시용 임시 창.
// 육심호의 KioskScreen(src/kiosk/)이 develop 에 들어오면 BranchScene 에서 이 창 대신 KioskScreen 을 띄우고, 이 파일은 지웁니다.
export function KioskPlaceholder({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,.45)",
      }}
    >
      <div
        style={{
          padding: "24px 32px",
          borderRadius: 12,
          background: "#20232a",
          color: "#fff",
          font: "14px/1.6 system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 18, marginBottom: 8 }}>키오스크</div>
        <div style={{ marginBottom: 16 }}>이용권 화면은 준비 중입니다.</div>
        <button type="button" onClick={onClose} autoFocus>
          닫기
        </button>
      </div>
    </div>
  );
}
