"""
웹캠 -> MediaPipe FaceLandmarker -> 고개 각도(pitch/yaw/roll) + 눈 감김(EAR)

준비:
    python3 -m pip install --no-compile "mediapipe==1.0.0" opencv-python numpy
    (mediapipe 1.0.1은 macOS에서 실행 중 중단되는 버그가 있어 1.0.0으로 고정)
실행:
    python3 main.py             (종료: q 또는 ESC, 정면 다시 맞추기: 0 또는 c)
    python3 main.py 1           (카메라 번호를 직접 지정)
    python3 main.py camera      (진단용: MediaPipe 없이 웹캠 화면만)

모델 파일(face_landmarker.task)은 첫 실행 때 자동으로 내려받습니다.
"""
import os
import sys
import time
import urllib.request
from collections import deque

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

MODEL_PATH = "face_landmarker.task"
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)

# 눈 랜드마크 인덱스 (p1~p6: 바깥 꼬리, 위 2점, 안쪽 꼬리, 아래 2점)
RIGHT_EYE = [33, 160, 158, 133, 153, 144]
LEFT_EYE = [362, 385, 387, 263, 373, 380]

EAR_THRESHOLD = 0.20      # 이 값보다 작으면 "감김" (사람마다 다르니 직접 조정)
CLOSED_SECONDS = 120.0    # 이 시간 이상 감고 있으면 경고 (잠깐 눈 감고 쉬는 건 허용)
SMOOTH_ALPHA = 0.4        # 각도 떨림 보정 (작을수록 부드럽지만 반응이 느림, 0~1)
CALIB_SECONDS = 2.0       # 시작할 때 이 시간 동안의 각도 평균을 "정면"으로 삼음


# ---------- 1) 눈 감김: EAR (Eye Aspect Ratio) ----------
def eye_aspect_ratio(landmarks, idx, w, h):
    """EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
    눈을 뜨면 약 0.25~0.35, 감으면 0.15 이하로 떨어진다."""
    # 정규화 좌표(0~1)는 가로세로 비율이 왜곡되므로 픽셀 좌표로 바꿔서 계산
    p = np.array([[landmarks[i].x * w, landmarks[i].y * h] for i in idx])
    vertical = np.linalg.norm(p[1] - p[5]) + np.linalg.norm(p[2] - p[4])
    horizontal = np.linalg.norm(p[0] - p[3])
    return vertical / (2.0 * horizontal + 1e-6)


# ---------- 2) 고개 각도: 변환 행렬 -> 오일러 각 ----------
def head_angles(transform_4x4):
    """FaceLandmarker가 주는 4x4 얼굴 변환 행렬에서 회전(3x3)만 꺼내
    pitch(끄덕임) / yaw(좌우 돌림) / roll(갸웃) 각도(도)로 분해한다."""
    rotation = np.array(transform_4x4)[:3, :3]
    angles, *_ = cv2.RQDecomp3x3(rotation)
    pitch, yaw, roll = angles
    return pitch, yaw, roll


def probe_camera(index, need_bright, seconds=3.0):
    """index번 카메라가 seconds초 안에 프레임을 꾸준히 주는지 확인한다.
    need_bright=True면 새까만 프레임은 세지 않는다."""
    cap = cv2.VideoCapture(index)
    if not cap.isOpened():
        cap.release()
        return None
    good = 0
    deadline = time.time() + seconds
    while time.time() < deadline:           # 횟수가 아니라 "시간"으로 끊는다
        ok, frame = cap.read()              # (끊긴 카메라는 read 한 번이 1초쯤 걸림)
        if ok and (not need_bright or frame.mean() > 5):
            good += 1
            if good >= 5:
                return cap
        elif not ok:
            time.sleep(0.05)
    cap.release()
    return None


def open_camera(forced=None, skip=None):
    """실제로 화면이 나오는 카메라를 찾아 (cap, 번호)를 돌려준다.
    맥에서는 아이폰 연속성 카메라가 0번으로 잡혀 검은 화면만 주다 끊기는 일이 있어,
    먼저 '밝은 화면이 꾸준히 나오는' 카메라를 찾고, 없으면 어두워도 나오는 카메라를 쓴다."""
    order = [forced] if forced is not None else [i for i in (0, 1, 2) if i != skip]
    for need_bright in (True, False):
        for index in order:
            cap = probe_camera(index, need_bright)
            if cap is not None:
                print(f"카메라 {index}번 사용")
                return cap, index
            if need_bright:
                print(f"카메라 {index}번: 화면이 안 나와 건너뜀")
    raise RuntimeError(
        "화면이 나오는 카메라를 찾지 못했습니다. "
        "시스템 설정 > 개인정보 보호 및 보안 > 카메라 권한을 확인하세요."
    )


def forced_index():
    """python3 main.py 1 처럼 숫자를 주면 그 카메라만 쓴다."""
    for arg in sys.argv[1:]:
        if arg.isdigit():
            return int(arg)
    return None


def camera_only():
    """진단용: MediaPipe 없이 웹캠 화면만 띄운다.  실행: python3 main.py camera"""
    cap, _index = open_camera(forced_index())
    shown = 0
    failed = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            failed += 1
            if failed > 100:
                print(f"프레임이 끊김 (그 전까지 {shown}장 표시)")
                break
            time.sleep(0.03)
            continue
        failed = 0
        shown += 1
        cv2.imshow("camera only", cv2.flip(frame, 1))
        if cv2.waitKey(1) & 0xFF in (ord("q"), 27):     # 27 = ESC (한글 입력 상태에서도 동작)
            print(f"정상 종료 ({shown}장 표시)")
            break
    cap.release()
    cv2.destroyAllWindows()


def main():
    if "camera" in sys.argv:
        camera_only()
        return

    if not os.path.exists(MODEL_PATH):
        print("모델 내려받는 중...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)

    options = vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=vision.RunningMode.VIDEO,   # 웹캠 스트림은 VIDEO 모드
        num_faces=1,
        output_face_blendshapes=True,                  # eyeBlink 점수 (EAR과 비교용)
        output_facial_transformation_matrixes=True,    # 고개 각도용
    )

    switched = 0
    closed_since = None
    smoothed = None                                # 보정된 (pitch, yaw, roll)
    history = deque(maxlen=30)                     # 최근 30프레임 (raw, smoothed) - 떨림 수치 비교용
    zero = None                                    # 정면 기준 각도 (None이면 맞추는 중)
    calib_start = None
    calib_samples = []
    start = time.time()

    with vision.FaceLandmarker.create_from_options(options) as landmarker:
        # 카메라는 MediaPipe가 준비된 "뒤에" 연다.
        cap, index = open_camera(forced_index())
        last_ok = time.time()
        while True:
            ok, frame = cap.read()
            if not ok:
                if time.time() - last_ok > 2.0:     # 2초 넘게 끊기면 다른 카메라로
                    switched += 1
                    if switched > 3:
                        print("카메라에서 프레임이 계속 끊겨 종료합니다.")
                        break
                    print(f"카메라 {index}번이 끊겨 다른 카메라를 찾습니다 ({switched}/3)")
                    cap.release()
                    cap, index = open_camera(forced_index(), skip=index)
                    last_ok = time.time()
                continue
            last_ok = time.time()
            frame = cv2.flip(frame, 1)                 # 거울 모드
            h, w = frame.shape[:2]

            # OpenCV는 BGR, MediaPipe는 RGB
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            timestamp_ms = int((time.time() - start) * 1000)   # 반드시 증가해야 함
            result = landmarker.detect_for_video(mp_image, timestamp_ms)

            if result.face_landmarks:
                lm = result.face_landmarks[0]           # 478개 점 (x, y, z)

                # 눈 점 찍어 보기
                for i in LEFT_EYE + RIGHT_EYE:
                    cv2.circle(frame, (int(lm[i].x * w), int(lm[i].y * h)), 2, (0, 255, 0), -1)

                # 눈 감김
                ear = (eye_aspect_ratio(lm, LEFT_EYE, w, h)
                       + eye_aspect_ratio(lm, RIGHT_EYE, w, h)) / 2
                closed = ear < EAR_THRESHOLD
                if closed:
                    closed_since = closed_since or time.time()
                else:
                    closed_since = None
                closed_for = time.time() - closed_since if closed_since else 0.0

                # 고개 각도
                raw = np.array(head_angles(result.facial_transformation_matrixes[0]))

                # 떨림 보정: 지수이동평균(EMA). 얼굴이 처음 잡히면 그 값에서 시작
                if smoothed is None:
                    smoothed = raw
                else:
                    smoothed = smoothed * (1 - SMOOTH_ALPHA) + raw * SMOOTH_ALPHA
                history.append((raw, smoothed))

                # 정면 기준 맞추기: 노트북 화면 기울기·카메라 위치가 사람마다 달라
                # 화면을 보고 있어도 각도가 0이 아니므로, 처음 CALIB_SECONDS 동안의 평균을 빼 준다
                if zero is None:
                    calib_start = calib_start or time.time()
                    calib_samples.append(raw)
                    if time.time() - calib_start >= CALIB_SECONDS:
                        zero = np.mean(calib_samples, axis=0)
                pitch, yaw, roll = smoothed - zero if zero is not None else smoothed

                # blendshape의 눈 깜빡임 점수 (0=뜸, 1=감음)
                blink = {c.category_name: c.score for c in result.face_blendshapes[0]}
                blink_avg = (blink.get("eyeBlinkLeft", 0) + blink.get("eyeBlinkRight", 0)) / 2

                lines = [
                    f"pitch {pitch:+6.1f}  yaw {yaw:+6.1f}  roll {roll:+6.1f}",
                    f"EAR {ear:.2f}  blink {blink_avg:.2f}  {f'CLOSED {closed_for:.0f}s' if closed else 'open'}",
                ]
                # 보정 전 값 (비교용, 회색)
                cv2.putText(frame, "raw   pitch {:+6.1f}  yaw {:+6.1f}  roll {:+6.1f}".format(*raw),
                            (10, h - 60), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)

                # 떨림 수치: 프레임 사이 각도 변화량 평균(도). 가만히 있을 때 작을수록 안정적
                if len(history) >= 2:
                    arr = np.array(history)                    # (프레임, raw/smoothed, 각도3)
                    jitter = np.abs(np.diff(arr, axis=0)).mean(axis=(0, 2))
                    cv2.putText(frame, f"jitter  raw {jitter[0]:.2f}  smooth {jitter[1]:.2f}",
                                (10, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)

                for n, text in enumerate(lines):
                    cv2.putText(frame, text, (10, 35 + 35 * n),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
                if zero is None:
                    left = CALIB_SECONDS - (time.time() - calib_start)
                    cv2.putText(frame, f"CALIBRATING... look at the screen {left:.1f}s", (10, 160),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 255), 2)
                else:
                    cv2.putText(frame, "zero  pitch {:+6.1f}  yaw {:+6.1f}  roll {:+6.1f}".format(*zero),
                                (10, h - 100), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)
                if closed_for >= CLOSED_SECONDS:
                    cv2.putText(frame, f"EYES CLOSED {closed_for:.1f}s", (10, 115),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 3)
            else:
                closed_since = None
                smoothed = None                        # 다시 잡히면 새 위치에서 시작
                history.clear()
                if zero is None:                       # 맞추는 중에 얼굴이 빠지면 처음부터 다시
                    calib_start = None
                    calib_samples = []
                cv2.putText(frame, "no face", (10, 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

            cv2.imshow("face monitor", frame)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):                  # 27 = ESC (한글 입력 상태에서도 동작)
                break
            if key in (ord("0"), ord("c")):            # 정면 다시 맞추기 (숫자는 한글 입력 상태에서도 동작)
                zero = None
                calib_start = None
                calib_samples = []

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()