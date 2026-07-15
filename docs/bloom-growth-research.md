# 개화 성장 프로파일 연구 노트

Floraxis의 개화 모델은 논문에서 관찰된 기관 배열, 상대 크기 변화, 차등 성장 위치와 개화 순서를 실시간 메시 변형에 대응시킨 교육용 근사 모델이다. 논문마다 종·품종·온도·계측 단계가 다르므로, 아래 백분율은 원시 계측값을 그대로 복제한 값이 아니라 완전 개화 상태를 `1.0`으로 맞춘 정규화 계수다.

## 적용 방식

- `budHeadScale`: 닫힌 봉오리에서 꽃 머리 전체의 상대 크기
- `closedPetalLength`, `closedPetalWidth`: 닫힌 상태의 꽃잎 길이·너비
- `basalEpinasty`: 꽃잎 기부의 향축면 팽창을 후굴 곡률로 변환한 세기
- `marginGrowth`: 중륵보다 가장자리에서 큰 종방향 생장을 곡률 반전과 물결로 변환한 세기
- `openingStart`, `openingSpan`: 팽윤 뒤 기관이 실제로 벌어지는 시점과 기간
- `radialSpread`: 개화 중 꽃잎 기부가 바깥으로 이동하는 정도

| 프리셋 | 봉오리 머리 | 닫힌 꽃잎 길이 | 닫힌 꽃잎 너비 | 기부 팽창 | 가장자리 성장 | 배열·순서 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 장미 | 72% | 66% | 49% | 94% | 10% | 4층, 바깥층 우선 |
| 튤립 | 82% | 84% | 62% | 16% | 10% | 3+3 두 윤생 |
| 백합 | 79% | 82% | 61% | 8% | 96% | 3+3, 가장자리 초과 성장 |
| 왕벚나무 | 68% | 73% | 54% | 18% | 14% | 5수성 단일 윤생 |
| 연꽃 | 74% | 75% | 55% | 58% | 16% | 꽃잎 나선, 안쪽 꽃잎 후기 신장 |
| 해바라기 | 78% | 56% | 70% | 6% | 18% | 56개 설상화, 480개 통상화, 구심 진행 |

## 종별 근거와 모델 대응

### 장미

Rosa hybrida의 Stage 1 봉오리부터 Stage 5 완전 개화까지 꽃잎 면적은 약 6배, 생체중은 약 4배 증가한다. 개방 운동은 꽃잎 판 전체보다 꽃잎–화탁 접합부 약 0.05–0.40 mm 구간의 향축면 세포 팽창과 기부 비후에 의해 주도된다. 이 관찰을 머리·꽃잎 두 축의 성장과 강한 기부 후굴로 나누어 적용했다.

- [Ethylene-regulated asymmetric growth of the petal base promotes flower opening in rose](https://academic.oup.com/plcell/article/33/4/1229/6126472)
- [Cell Division and Expansion Growth during Rose Petal Development](https://doi.org/10.2503/jjshs1.78.356)

### 튤립

튤립 화피의 외측·내측 중배엽은 생장 최적 온도가 약 10°C 차이 난다. 별도 실험에서는 5°C에서 닫힌 꽃을 20°C로 옮긴 뒤 약 100분에 완전히 열렸고, 5°C로 되돌리면 다시 닫혔다. Floraxis는 온도 입력을 직접 계산하지 않고 이 양면 생장·수분 이동 차이를 컵 곡률의 가역적 이완으로 표현한다.

- [Thermonasty in Tulip and Crocus Flowers](https://doi.org/10.1093/jxb/4.1.65)
- [Phosphorylation of Plasma Membrane Aquaporin Regulates Temperature-Dependent Opening of Tulip Petals](https://doi.org/10.1093/pcp/pch069)

### 백합

Lilium의 개방은 중륵 자체가 당기는 운동보다 꽃잎 가장자리의 종방향 초과 성장에 의해 발생한다. 실험에서 중륵을 제거한 화피도 개방했고, 측정된 가장자리–중륵 성장 구배는 얇은 셸의 곡률 반전과 가장자리 물결을 만들기에 충분했다. 모델은 가장자리 정점의 종방향 길이와 물결 진폭을 함께 증가시킨다.

- [Growth, geometry, and mechanics of a blooming lily](https://pmc.ncbi.nlm.nih.gov/articles/PMC3078366/)

### 왕벚나무

소메이요시노를 포함한 여러 벚꽃 계통에서 꽃잎 크기는 개화 약 5일 전부터 빠르게 증가하고, 개화 전날부터 개화일까지 증가율이 가장 컸다. 이를 5수성 배열은 유지하면서 개방 구간을 짧게 집중한 후기 급성장 곡선으로 적용했다.

- [사쿠라 꽃잎의 발육에 따른 안토시아닌 축적](https://da.lib.kobe-u.ac.jp/da/kernel/00227252/)
- [Cherry Blossom Forecast Based on Transcriptome of Floral Organs Approaching Blooming](https://pmc.ncbi.nlm.nih.gov/articles/PMC8825344/)

### 연꽃

Nelumbo의 꽃잎은 나선으로 시작하지만 수술과 심피는 동시 윤생으로 시작한다. 4일 개화 관찰에서 안쪽 꽃잎이 바깥 꽃잎보다 더 신장했고, 꽃잎 안에서는 기부 세포가 가장 크게 확대되었다. 별도 5단계 관찰에서 Stage 3은 꽃잎 간격 2–12 cm와 암술 노출, Stage 4는 수평 꽃잎과 성숙 수술 노출로 기술된다. 모델은 나선 층별 지연, 안쪽 꽃잎의 추가 성장, 기부 중심 곡률을 결합한다.

- [Floral Development of Nelumbo nucifera](https://doi.org/10.1086/317577)
- [Structural changes in Nelumbo flower petals during opening and closing](https://doi.org/10.1002/ajb2.16433)
- [Small RNA and Transcriptome Sequencing Reveals miRNA Regulation of Floral Thermogenesis](https://pmc.ncbi.nlm.nih.gov/articles/PMC7246644/)

### 해바라기

Helianthus annuus의 머리는 50–100개 설상화와 최대 약 1000개 통상화를 가질 수 있다. 통상화 분열조직이 먼저 진행되는 동안 설상화 분열조직은 억제되었다가, 개화 직전 빠르게 신장해 통상화 봉오리 길이에 도달한다. 모델은 성능 범위 안에서 56개 설상화와 480개 통상화를 사용하고, 머리판 팽윤 뒤 설상화를 빠르게 펼치며 통상화는 바깥 고리부터 안쪽으로 성숙시킨다.

- [Are capitula inflorescences? A reassessment based on flower-like meristem identity and ray flower development](https://academic.oup.com/aob/article/137/1/47/8195846)
- [Quantifying the reproductive progression of sunflower using FIJI](https://pmc.ncbi.nlm.nih.gov/articles/PMC9587322/)

## 해석 한계

이 구현은 논문에 보고된 형태학적 방향과 상대 순서를 보존하지만, 세포벽 탄성·팽압·호르몬 농도·온도장을 유한요소법으로 푸는 생물역학 해석은 아니다. 서로 다른 논문의 절대 수치는 직접 비교하지 않았고, 화면에서 기관이 식별되도록 비선형 완화와 종별 지연을 사용했다.
