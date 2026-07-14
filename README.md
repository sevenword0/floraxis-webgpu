# Floraxis

WebGPU 기반 실시간 개화 시뮬레이터입니다. 연구 자료에서 확인한 꽃의 기관 배열과 개화 메커니즘을 절차적 3D 모델로 옮겨, 꽃봉오리부터 완전 개화까지 직접 관찰하고 커스텀 프리셋을 설계할 수 있습니다.

## 주요 기능

- 장미, 튤립, 백합, 왕벚나무, 연꽃, 해바라기 6종 프리셋
- 동일 위상의 닫힘/열림 메시를 이용한 연속 꽃잎 모프
- 앞·뒤·측면이 닫힌 얇은 꽃잎 셸과 깊이 레인 기반 관통 완화 배치
- 종별 층·윤생·나선 배열과 시간차 개화
- 해바라기 320개 통상화의 황금각 배열 및 구심적 개화
- 꽃잎 수, 층, 길이, 너비, 곡률, 말림, 개방각, 색상 커스터마이징
- 커스텀 프리셋 브라우저 저장, JSON 내보내기/가져오기
- 식물학 구조와 개화 메커니즘을 보여 주는 연구 노트
- 반응형 데스크톱/모바일 인터페이스

## WebGPU 렌더링

Floraxis는 Three.js의 최신 WebGPU 렌더러와 TSL(Render Pipeline)을 사용합니다.

- 절차적 RoomEnvironment 기반 IBL 환경맵 조명
- SSGI(Screen-Space Global Illumination)
- SSR(Screen-Space Reflections)
- GTAO(Ground Truth Ambient Occlusion)
- SSS(Screen-Space Contact Shadows) + 소프트 블러
- `MeshSSSNodeMaterial` 기반 꽃잎 subsurface scattering
- 절차적 주맥·측맥 normal map과 실제 측면 셸을 결합한 꽃잎 두께 표현
- 2K PCF 소프트 섀도 맵
- Bloom, ACES tone mapping, SMAA

SSGI에 필요한 GPU 기능이 없으면 해당 효과만 자동으로 비활성화되며 나머지 WebGPU 렌더링은 유지됩니다.

## 식물학 모델

| 프리셋 | 시뮬레이션에 반영한 구조/개화 규칙 |
| --- | --- |
| 장미 | 겹꽃 층, 꽃잎 기부의 비대칭 성장, 후기 세포 팽창 |
| 튤립 | 3+3 화피, 내·외측 성장률 차이에 의한 thermonasty |
| 백합 | 3+3 화피, 중륵과 가장자리의 차등 성장, 끝단 후굴 |
| 왕벚나무 | 5수성 화관, 오목한 꽃잎 끝, 다수 수술 |
| 연꽃 | 나선형 다층 화피, 수술 고리, 확대된 원뿔형 화탁 |
| 해바라기 | 바깥 설상화, 황금각 통상화, 바깥에서 안으로 진행하는 개화 |

이 프로젝트는 관찰 가능한 외형 변화를 위한 교육·시각화 모델입니다. 세포 및 분자 수준의 생장 전체를 계산하는 생물역학 해석기는 아닙니다.

## 실행

Node.js 24 이상을 권장합니다.

```bash
npm install
npm run dev
```

검증과 프로덕션 빌드:

```bash
npm run check
npm run build
npm run preview
```

최신 Chrome 또는 Edge에서 하드웨어 가속과 WebGPU가 활성화되어 있어야 합니다.

## 조작

- 드래그: 카메라 회전
- 스크롤/핀치: 확대·축소
- `Space`: 재생/일시 정지
- `R`: 카메라 초기화
- `1`–`6`: 종 프리셋 빠른 선택

## GitHub Pages

소스는 `main`, 프로덕션 빌드 산출물은 `gh-pages` 브랜치에서 제공합니다. 공개 앱은 [https://sevenword0.github.io/floraxis-webgpu/](https://sevenword0.github.io/floraxis-webgpu/)에서 실행할 수 있습니다.

## 연구 출처

- [Growth, geometry, and mechanics of a blooming lily (PNAS)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3078366/)
- [Ethylene-regulated asymmetric growth of the petal base promotes flower opening in rose (The Plant Cell)](https://academic.oup.com/plcell/article/33/4/1229/6126472)
- [Cell Division and Expansion Growth during Rose Petal Development](https://doi.org/10.2503/jjshs1.78.356)
- [Thermonasty in Tulip and Crocus Flowers](https://doi.org/10.1093/jxb/4.1.65)
- [Prunus floral morphology — Kew Plants of the World Online](https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:30003057-2/general-information)
- [Nelumbo nucifera — Kew Plants of the World Online](https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:605422-1/general-information)
- [Helianthus annuus — Kew Plants of the World Online](https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:119003-2/general-information)
- [WebGPURenderer — Three.js manual](https://threejs.org/manual/en/webgpurenderer)

모든 3D 형태와 재질은 런타임에 절차적으로 생성되며 외부 모델·텍스처 자산을 사용하지 않습니다.

## License

[MIT](./LICENSE)
