# Floraxis Lighting QA 테스트 앱

## 목적

`lighting-test.html`은 Floraxis에 적용한 Unreal-inspired 하이브리드 조명 기술을 독립 장면에서 재현하고 성능 회귀를 측정하는 테스트 앱이다. 별도의 간이 렌더러가 아니라 본 앱의 `BloomRenderer`를 그대로 사용하므로 다음 경로가 제품과 동일하다.

- 2단 practical-split CSM과 적응형 섀도 해상도
- 32-byte attachment 한도에 맞춘 4개 MRT
- SSGI, 금속 전용 SSR, GTAO, 화면 공간 접촉 그림자
- velocity/depth 기반 TRAA와 시간 필터링
- Bloom, ACES tone mapping, PMREM IBL
- GPU timestamp와 FPS를 함께 보는 적응형 품질 단계
- WebGPU 및 WebGL 2 폴백 분기

## 실행

```bash
npm install
npm run dev
```

Vite가 표시한 로컬 주소 뒤에 `/lighting-test.html`을 붙인다.

```text
http://localhost:5173/lighting-test.html
```

WebGL 2 폴백을 강제로 확인하려면 다음 쿼리를 사용한다.

```text
http://localhost:5173/lighting-test.html?backend=webgl
```

본 Floraxis 앱 상단의 태양 아이콘으로도 QA Lab을 열 수 있다.

## 기준 장면

### 재질

- 위 행: metalness 0의 유전체, roughness 0.05/0.25/0.5/0.75/1.0
- 아래 행: metalness 1의 금속, 같은 roughness 단계
- 검정/18% 회색/흰색/색상 카드
- Bloom 임계 응답을 확인하는 고휘도 발광 바

SSR을 켰을 때 아래 금속 행의 저거칠기 물체가 우선 반응하고, 거친 유전체까지 동일하게 거울처럼 보이면 합격이 아니다.

### CSM 그림자

- 카메라에서 멀어지는 56개 얇은 기둥과 112개 양면 잎 카드
- 거리 확인용 지면 띠
- 회전하는 장거리 그림자 투영체

카메라 이동 중 그림자 해상도 전환선이 보이거나 가까운 잎 그림자가 큰 덩어리로 합쳐지면 섀도 bias, normal bias, cascade split과 해상도 단계를 다시 검토한다.

### 시간 안정성

- 고대비 세로 발광 띠
- 회전하는 3엽 로터
- 왕복하는 저거칠기 금속구
- 회전하는 clearcoat 패널

로터 뒤의 긴 검은 꼬리, 금속구 주변의 폭발적인 반사 점멸, 카메라 회전 시 얇은 모서리 분해 여부를 확인한다.

## A/B 프로필

| 프로필 | 용도 | 활성 효과 |
| --- | --- | --- |
| Production | 실제 제품 기본 경로 | SSGI, SSR, GTAO, 접촉 그림자, Bloom, CSM, panorama |
| Baseline | 화면 공간 효과의 순이득 비교 | 직접광, IBL, CSM, panorama |
| GI Study | 간접광과 접점 대비 분리 | SSGI, GTAO, 접촉 그림자, CSM |
| Reflection | 금속 반사 에너지 확인 | SSR, GTAO, Bloom, CSM |

프로필 선택 후 개별 토글을 바꾸면 현재 조합에 맞지 않는 프로필 강조가 자동으로 해제된다. 현재 백엔드에서 사용할 수 없는 기능은 비활성화 상태와 이유를 표시한다.

## 6초 성능 검증

`RUN TEST`는 현재 장면과 현재 효과 조합을 바꾸지 않고 다음 순서로 측정한다.

1. 1초 워밍업
2. 5초 프레임 샘플 수집
3. median frame time, p95, p99 기반 1% low, 평균 GPU timestamp 계산
4. p95 ≤ 20ms는 PASS, ≤ 33.34ms는 WARN, 그 이상은 FAIL

브라우저 rAF 기반 프레임 시간과 GPU timestamp는 서로 다른 지표다. GPU 시간이 낮고 p95가 높다면 CPU, 브라우저 합성, 백그라운드 부하를 먼저 의심한다. 결과 비교 시 해상도, 브라우저 크기, GPU, 전원 모드, backend, quality tier를 동일하게 유지해야 한다.

## 2026-07-18 실제 QA 결과

테스트 환경: Windows, Codex 인앱 Chromium, 1280×720 기본 뷰포트, WebGPU, Balanced, Production, 재질 장면, Warm dawn.

| 항목 | 결과 |
| --- | ---: |
| 수집 프레임 | 301 |
| 평균 FPS | 60.0 |
| median frame time | 16.7ms |
| p95 frame time | 16.9ms |
| 1% low | 58.5 FPS |
| 평균 GPU timestamp | 0.5ms |
| 판정 | PASS |
| 콘솔 오류/경고 | 0 |

추가 확인:

- Botanical studio에서 Warm dawn으로 전환할 때 배경, PMREM 반사, 직접광 색과 방향이 함께 변경됐다.
- 꽃잎과 잎은 metalness 0을 유지하면서 IOR·거칠기·제한된 큐티클 반사로 서로 다른 광택을 보였다.
- WebGPU Material/CSM/Temporal 세 장면 모두 60 FPS로 관찰됐다.
- Cinematic 전환 후 tier와 내부 해상도 표시가 즉시 갱신됐다.
- `?backend=webgl`에서 `WEBGL 2 FALLBACK`이 표시되고 SSGI/SSR이 비활성화됐으며, 60 FPS 및 콘솔 오류/경고 0건을 확인했다.
- 390×844 뷰포트에서 문서 가로 스크롤 폭이 뷰포트를 초과하지 않았고, 렌더 뷰와 전체 제어판을 세로 스크롤로 사용할 수 있었다.

이 수치는 표준화된 GPU 벤치마크가 아니라 현재 호스트에서의 회귀 기준이다. 다른 GPU와 브라우저 비교에는 동일 장면에서 새 결과를 기록해야 한다.

## 자동·수동 검증 경계

앱이 자동으로 판정할 수 있는 것은 프레임 통계, capability, backend, 런타임 오류 상태다. 다음 항목은 현재 육안 검증이다.

- CSM 경계선과 Peter-panning
- SSR 에너지 과가산과 화면 가장자리 누락
- TRAA/SSGI 잔상과 disocclusion 노이즈
- gray-card 노출 및 white-furnace 수준의 에너지 보존

다음 우선 연구 단계는 고정 카메라의 PNG 골든 이미지와 허용 오차 기반 이미지 회귀 테스트를 CI에 추가하는 것이다.
