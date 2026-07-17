# Floraxis

WebGPU 기반 실시간 개화 시뮬레이터입니다. 연구 자료에서 확인한 꽃의 기관 배열과 개화 메커니즘을 절차적 3D 모델로 옮겨, 꽃봉오리부터 완전 개화까지 직접 관찰하고 커스텀 프리셋을 설계할 수 있습니다.

## 주요 기능

- 장미, 튤립, 백합, 왕벚나무, 연꽃, 해바라기, 큰잎수국, 등나무 8종 프리셋
- 일반 꽃은 닫힘/열림 연속 모프, 장미는 기부 이완·S자 풀림·끝단 젖힘을 잇는 다단계 꽃잎 모프
- 논문 관찰을 정규화한 종별 봉오리 크기·꽃잎 길이/너비 성장 곡선
- 장미 기부 비대칭 성장, 백합 가장자리 초과 성장, 연꽃 안쪽 꽃잎 후기 신장
- 앞·뒤·측면이 닫힌 얇은 꽃잎 셸과 깊이 레인 기반 관통 완화 배치
- 개화 진행률에 따라 변하는 꽃잎 말림·중륵 접힘·장축 회전과 장미의 기부→끝단 풀림 전파
- 꽃잎 기부를 받치는 절차적 화탁·꽃자루 연결부와 꽃받침의 외향·하강 모션
- 종별 층·윤생·나선 배열과 시간차 개화
- 식물원·공식 품종 자료를 바탕으로 한 종별 실제 높이·꽃 지름·꽃머리 방향·꽃자루 길이
- 분지 관목, 단일 꽃대, 윤생 초본, 개방형 교목, 수생 꽃대 등 종별 줄기·수형과 절차적 잎 실루엣
- 해바라기 56개 설상화와 480개 통상화의 황금각 배열 및 구심적 개화
- 수국의 장식화·가임화가 섞인 24개 소화 돔과 등나무의 18개 나비형 소화 하수 총상화서
- 꽃잎 수, 층, 길이, 너비, 곡률, 봉오리 말림, 풀림 전파, 중심 말림 유지, 접힘, 회전, 개방각, 색상 커스터마이징
- 봉오리 크기, 닫힌 꽃잎 비율, 기부 팽창, 가장자리 성장, 개방 시점 커스터마이징
- 커스텀 프리셋 브라우저 저장, JSON 내보내기/가져오기
- 꽃밭의 개별 꽃을 cm 단위로 편집하고 줄기 두께까지 클립보드 또는 독립 JSON 파일로 복사·적용
- 18–85° 카메라 화각과 현재 피사체 초점 맞춤
- 환경광·배경 밝기·파노라마 흐림·회전 및 JPG·PNG·WebP·HDR 환경 이미지 불러오기
- 초점 거리·초점 범위·보케 크기와 원형·3–12날 다각형·별·하트 조리개 설정
- 보케 컨볼루션 전 감마와 최종 비초점 영역 감마의 독립 조절
- 식물학 구조와 개화 메커니즘을 보여 주는 연구 노트
- 반응형 데스크톱/모바일 인터페이스

## 프리셋 꽃밭

`프리셋 꽃밭` 모드는 8종 프리셋을 한 군락으로 조합합니다.

- 24~320개체, 꽃밭 반경, 최소 간격, 결정론적 배치 시드
- 자유 산포, 종별 평행 줄, 동심원, 종별 부채꼴, 중심원·부채·외곽원 복합 배치
- 중앙 통로를 비운 퍼골라 꽃터널과 평행 트렐리스 양벽 꽃길
- 종별 줄 수(1~6줄)와 동심원 수(2~12겹), 선택 종을 빠짐없이 포함하는 시드 기반 혼합 강도
- 종마다 시작색·끝색·강도를 저장하고 같은 종의 개체색을 배치 시드로 재현하는 컬러 범위 랜덤화
- 프리셋의 종별 기본 굵기 비율은 유지하면서 35~220% 범위에서 종별·개체별 줄기 두께 조정
- 왼쪽에서 오른쪽으로 진행하는 개화 파동과 개체별 개화 편차
- 줄기와 꽃머리에 공유되는 개체별 바람 위상
- 가까운 꽃, 중간 꽃, 먼 꽃의 꽃잎 수를 단계적으로 줄이는 정적 LOD
- 종마다 줄기·꽃잎·꽃받침·중심부를 묶는 WebGPU 인스턴싱
- 완전 개화 지름, 머리 기울기, 꽃자루와 바람 여유를 함께 계산하는 3차원 성숙 꽃머리 충돌 완화
- 개체별 실제 높이·꽃 지름·줄기 두께·방위·기울기·꽃자루·잎 크기/수·가지 수/각도 편집
- 한 개체 설정을 클립보드와 `floraxis.individual-flower` JSON으로 복사해 다른 꽃밭에 재사용
- 배치 시드와 공유되는 흙 굴곡·색 얼룩, 무성한 잔풀·지피 수풀, 작은 돌의 절차적 지표 생태층
- 공간적으로 이어지는 바람장에 꽃대·꽃자루·잎·꽃잎과 수풀별 강성 및 난류 응답
- 전역 0%에서는 모든 꽃이 봉오리이고 100%에서는 모든 꽃이 완전히 개화하도록 보존된 타임라인

## WebGPU 렌더링

Floraxis는 Three.js의 최신 WebGPU 렌더러와 TSL(Render Pipeline)을 사용합니다.

- 절차적 RoomEnvironment IBL과 내장 2:1 파노라마, 사용자 파노라마 PMREM 조명
- SSGI(Screen-Space Global Illumination)
- SSR(Screen-Space Reflections)
- GTAO(Ground Truth Ambient Occlusion)
- SSS(Screen-Space Contact Shadows) + 소프트 블러
- `MeshSSSNodeMaterial` 기반 꽃잎 subsurface scattering
- 절차적 주맥·측맥 normal map과 실제 측면 셸을 결합한 꽃잎 두께 표현
- 잔풀·수풀·돌을 각각 한 번에 그리는 WebGPU 인스턴싱과 동적 바람 행렬
- 2K PCF 소프트 섀도 맵
- 깊이 텍스처 기반 WebGPU DOF, 사용자 지정 조리개 커널과 보케/비초점 감마
- Bloom, ACES tone mapping, SMAA

SSGI에 필요한 GPU 기능이 없으면 해당 효과만 자동으로 비활성화되며 나머지 WebGPU 렌더링은 유지됩니다.

## 식물학 모델

| 프리셋 | 시뮬레이션에 반영한 구조/개화 규칙 |
| --- | --- |
| 장미 | 겹꽃 층, 꽃잎 기부의 비대칭 성장, 기부→끝단 풀림 전파, 중심층 잔류 말림 |
| 튤립 | 3+3 화피, 내·외측 성장률 차이에 의한 thermonasty |
| 백합 | 3+3 화피, 중륵과 가장자리의 차등 성장, 끝단 후굴 |
| 왕벚나무 | 5수성 화관, 오목한 꽃잎 끝, 다수 수술 |
| 연꽃 | 나선형 다층 화피, 수술 고리, 확대된 원뿔형 화탁 |
| 해바라기 | 바깥 설상화, 황금각 통상화, 바깥에서 안으로 진행하는 개화 |
| 큰잎수국 | 둥근 취산화서, 4개 꽃받침조각을 가진 장식화와 작은 가임화의 시차 개화 |
| 등나무 | 아래로 늘어진 총상화서, 배너·날개·용골 꽃잎, 부착부에서 끝으로 진행하는 개화 |

이 프로젝트는 관찰 가능한 외형 변화를 위한 교육·시각화 모델입니다. 세포 및 분자 수준의 생장 전체를 계산하는 생물역학 해석기는 아닙니다.

종별 관찰값과 정규화 계수의 대응은 [개화 성장 프로파일 연구 노트](./docs/bloom-growth-research.md)에 정리했습니다.

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
- `1`–`8`: 종 프리셋 빠른 선택

## GitHub Pages

소스는 `main`, 프로덕션 빌드 산출물은 `gh-pages` 브랜치에서 제공합니다. 공개 앱은 [https://sevenword0.github.io/floraxis-webgpu/](https://sevenword0.github.io/floraxis-webgpu/)에서 실행할 수 있습니다.

## 연구 출처

- [Growth, geometry, and mechanics of a blooming lily (PNAS)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3078366/)
- [Ethylene-regulated asymmetric growth of the petal base promotes flower opening in rose (The Plant Cell)](https://academic.oup.com/plcell/article/33/4/1229/6126472)
- [Cell Division and Expansion Growth during Rose Petal Development](https://doi.org/10.2503/jjshs1.78.356)
- [Thermonasty in Tulip and Crocus Flowers](https://doi.org/10.1093/jxb/4.1.65)
- [Phosphorylation of Plasma Membrane Aquaporin Regulates Temperature-Dependent Opening of Tulip Petals](https://doi.org/10.1093/pcp/pch069)
- [사쿠라 꽃잎의 발육에 따른 안토시아닌 축적](https://da.lib.kobe-u.ac.jp/da/kernel/00227252/)
- [Structural changes in Nelumbo flower petals during opening and closing](https://doi.org/10.1002/ajb2.16433)
- [Floral Development of Nelumbo nucifera](https://doi.org/10.1086/317577)
- [Are capitula inflorescences? — Helianthus annuus development](https://academic.oup.com/aob/article/137/1/47/8195846)
- [Hydrangea macrophylla 장식화·가임화와 꽃받침 발달](https://pmc.ncbi.nlm.nih.gov/articles/PMC9694991/)
- [Hydrangea 꽃봉오리와 화서 분지 발달](https://www.mdpi.com/1422-0067/24/9/7691)
- [Wisteria floribunda 총상화서](https://gobotany.nativeplanttrust.org/species/wisteria/floribunda/)
- [RHS — Wisteria floribunda 크기와 꽃차례](https://www.rhs.org.uk/plants/145006/wisteria-floribunda-geisha/details)
- [WebGPURenderer — Three.js manual](https://threejs.org/manual/en/webgpurenderer)

기본 3D 형태·재질·파노라마는 런타임에 절차적으로 생성됩니다. 사용자가 불러온 환경 이미지는 현재 브라우저 세션에서만 조명과 배경에 사용됩니다.

## License

[MIT](./LICENSE)
