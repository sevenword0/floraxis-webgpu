# 개화 성장 프로파일 연구 노트

Floraxis의 개화 모델은 논문에서 관찰된 기관 배열, 상대 크기 변화, 차등 성장 위치와 개화 순서를 실시간 메시 변형에 대응시킨 교육용 근사 모델이다. 논문마다 종·품종·온도·계측 단계가 다르므로, 아래 백분율은 원시 계측값을 그대로 복제한 값이 아니라 완전 개화 상태를 `1.0`으로 맞춘 정규화 계수다.

## 적용 방식

- `budHeadScale`: 닫힌 봉오리에서 꽃 머리 전체의 상대 크기
- `closedPetalLength`, `closedPetalWidth`: 닫힌 상태의 꽃잎 길이·너비
- `basalEpinasty`: 꽃잎 기부의 향축면 팽창을 후굴 곡률로 변환한 세기
- `marginGrowth`: 중륵보다 가장자리에서 큰 종방향 생장을 곡률 반전과 물결로 변환한 세기
- `openingStart`, `openingSpan`: 팽윤 뒤 기관이 실제로 벌어지는 시점과 기간
- `radialSpread`: 개화 중 꽃잎 기부가 바깥으로 이동하는 정도
- `budCurl`: 봉오리에서 꽃잎 끝이 중심을 감싸는 종방향 말림
- `unfurl`: 기부가 먼저 이완된 뒤 끝단까지 풀림이 전파되는 시간차
- `innerCoil`: 완전 개화 뒤에도 중심층에 남는 안쪽 곡률

| 프리셋 | 봉오리 머리 | 닫힌 꽃잎 길이 | 닫힌 꽃잎 너비 | 기부 팽창 | 가장자리 성장 | 배열·순서 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 장미 | 72% | 66% | 49% | 94% | 10% | 4층, 바깥층 우선 |
| 튤립 | 82% | 84% | 62% | 16% | 10% | 3+3 두 윤생 |
| 백합 | 79% | 82% | 61% | 8% | 96% | 3+3, 가장자리 초과 성장 |
| 왕벚나무 | 68% | 73% | 54% | 18% | 14% | 5수성 단일 윤생 |
| 연꽃 | 74% | 75% | 55% | 58% | 16% | 꽃잎 나선, 안쪽 꽃잎 후기 신장 |
| 해바라기 | 78% | 56% | 70% | 6% | 18% | 56개 설상화, 480개 통상화, 구심 진행 |
| 큰잎수국 | 56% | 48% | 42% | 34% | 12% | 24개 소화의 둥근 취산화서 |
| 등나무 | 58% | 52% | 44% | 42% | 15% | 18개 소화, 부착부→끝 순차 개화 |

## 종별 근거와 모델 대응

### 장미

Rosa hybrida의 Stage 1 봉오리부터 Stage 5 완전 개화까지 꽃잎 면적은 약 6배, 생체중은 약 4배 증가한다. 개방 운동은 꽃잎 판 전체보다 꽃잎–화탁 접합부 약 0.05–0.40 mm 구간의 향축면 세포 팽창과 기부 비후에 의해 주도된다. 이 관찰을 머리·꽃잎 두 축의 성장과 강한 기부 후굴로 나누어 적용했다. 장미 꽃잎은 단일 닫힘/열림 보간 대신 봉오리, 기부 이완, S자 풀림, 끝단 젖힘의 네 포즈를 통과하며, 바깥층이 먼저 열리고 중심층은 일부 안쪽 곡률을 유지한다. 단계별 시간과 곡률 크기는 논문의 형태학적 방향을 실시간 그래픽에 맞춰 정규화한 값이다.

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

### 큰잎수국

Hydrangea macrophylla의 취산화서는 큰 꽃잎처럼 보이는 꽃받침조각을 가진 장식화와 작은 가임화가 함께 둥근 꽃머리를 만든다. 꽃봉오리 팽창 뒤 화서분열조직의 1·2차 분지가 생기고 장식화의 꽃받침조각이 펼쳐지며 착색된다. 모델은 24개 가시 소화를 피보나치 구면에 배치하고, 대부분은 4개의 큰 장식 꽃받침조각, 일부는 작은 가임화로 축소했다. 소화 위치별 지연과 꽃머리 전체 팽윤을 결합해 하나의 구가 동시에 커지는 인상을 피했다.

- [Exploring the Molecular Mechanism of Sepal Formation in Hydrangea macrophylla](https://pmc.ncbi.nlm.nih.gov/articles/PMC9694991/)
- [Transcriptome Analysis of Flower Bud Development in Hydrangea macrophylla](https://www.mdpi.com/1422-0067/24/9/7691)
- [Mophead inflorescence architecture and size](https://pmc.ncbi.nlm.nih.gov/articles/PMC7049302/)

### 등나무

Wisteria floribunda는 꽃자루가 달린 소화가 길고 무분지인 중심축에 배열되는 하수 총상화서를 만든다. 각 소화는 콩과의 나비형 꽃부리처럼 배너 1장, 날개 2장, 용골 2장으로 구분했다. 총상화서의 향정적 성숙 순서를 매달린 좌표계에 적용하여 위쪽 부착부 소화가 먼저, 아래쪽 끝 소화가 나중에 펼쳐진다. 이 순서는 정량 생장속도 재현이 아니라 식물학적 개화 방향을 보존한 시각화 매핑이다.

- [Native Plant Trust — Wisteria floribunda raceme](https://gobotany.nativeplanttrust.org/species/wisteria/floribunda/)
- [Toronto Botanical Garden — pendulous wisteria racemes](https://torontobotanicalgarden.ca/blog/word-of-the-week/botanical-nerd-word-raceme/)
- [RHS — Wisteria floribunda ‘Geisha’ dimensions](https://www.rhs.org.uk/plants/145006/wisteria-floribunda-geisha/details)

## 실제 치수·꽃 방향·영양기관 구조

꽃밭 모드의 개별 꽃 값은 cm 단위 원자료 범위 안에서 생성한다. 한 장면에 10 m급 교목과 수십 cm 초본을 함께 놓을 수 있도록 초본 높이는 비례 축척을 유지하고 320 cm를 넘는 교목만 로그 압축한다. 등나무의 8–12 m 값은 수직 줄기 높이가 아니라 덩굴 길이이므로, 원자료는 보존하되 화면의 꽃차례 부착 높이는 정원 지지대 높이로 제한한다. 꽃 지름은 기관을 식별할 수 있도록 2배 세부 확대하지만, 편집·내보내기·충돌 판정에는 확대 전 실측값을 보존한다.

| 종 | 적용한 실제 범위 | 기본 꽃머리 방향 | 줄기·수형·잎 대응 |
| --- | --- | --- | --- |
| 다마스크 장미 | 높이 150–250 cm, 꽃 지름 최대 8 cm | 약한 측향 | 활 모양의 분지 관목, 우상복엽·톱니 소엽 |
| 아펠도른 튤립 | 높이 10–50 cm, 꽃 지름 6.3–8.3 cm | 상향 | 분지 없는 단일 꽃대, 기부의 넓은 피침형 잎 |
| 오리엔탈 백합 | 높이 90–150 cm, 꽃 지름 12.7–15.2 cm | 반직립–수평 측향 | 직립 유엽 줄기, 긴 꽃자루, 윤생·호생 피침형 잎 |
| 왕벚나무 | 높이 914–1219 cm | 가지 끝 측향 | 넓고 열린 교목 수관, 3–6송이 총상화서, 톱니 타원형 잎 |
| 연꽃 | 높이 91–183 cm, 꽃 지름 20–30 cm | 상향 | 수중 근경에서 올라오는 꽃대, 별도 엽병의 방패형 원형 잎 |
| 해바라기 | 높이 91–305 cm, 머리 지름 7.6–15.2 cm | 개화 시 동향·준수평 | 굵은 직립 줄기, 난형·삼각형 톱니 잎 |
| 큰잎수국 | 높이 100–150 cm, 화서 지름 7.5–15 cm | 상향 돔 | 분지 관목, 마주나는 넓은 난형 톱니 잎 |
| 등나무 | 덩굴 높이 8–12 m, 꽃차례 약 25–35 cm | 수직 하향 | 목질 덩굴, 호생 우상복엽, 퍼골라 유인 |

백합의 머리 기울기는 UPOV의 직립, 직립–수평, 수평(외향), 하향 형질 등급을 수치 각도로 대응했다. 해바라기는 미성숙기 추적 운동 뒤 개화 시 동쪽을 향해 고정되고, 개화 당일 약 10° 고도에서 이후 처지는 관찰을 기본 방위와 기울기로 대응했다. 사용자가 모든 개체의 방향·크기·꽃자루·줄기 두께·잎·가지를 다시 조정할 수 있다. 줄기 두께는 종마다 다른 프리셋 반지름을 기준으로 한 35–220% 표시 배율이며, 실측 직경을 새로 주장하는 값은 아니다. 같은 배율은 본줄기와 상대 비율로 만들어지는 가지·꽃자루·잎자루에 함께 전달된다.

완전 개화 충돌은 각 꽃머리를 지름과 기울기로 만든 3차원 타원체로 취급한다. 배치 단계에서 줄기 최소 간격을 먼저 확보한 뒤, 꽃자루와 바람 진폭을 더한 성숙 중심 사이의 침범을 반복 완화한다. 따라서 꽃봉오리가 팽창하고 머리가 옆으로 기울어도 기본 120개 꽃밭에서 꽃머리끼리 관통하지 않는다.

- [RHS — Rosa × damascena](https://www.rhs.org.uk/plants/33926/rosa-x-damascena-d/details)
- [RHS — Tulipa gesneriana](https://www.rhs.org.uk/plants/18512/tulipa-gesneriana/details)
- [UPOV TG/59 — Lily flower attitude](https://www.upov.int/documents/d/upov/tg-documents-en-tg059.pdf)
- [Missouri Botanical Garden — Oriental lily ‘Muscadet’](https://www.missouribotanicalgarden.org/PlantFinder/PlantFinderDetails.aspx?basic=mu&isprofile=0&taxonid=244778)
- [Kew Plants of the World Online — Lilium](https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A30009317-2/general-information)
- [Missouri Botanical Garden — Prunus × yedoensis](https://www.missouribotanicalgarden.org/PlantFinder/PlantFinderDetails.aspx?bt=4&taxonid=286608)
- [Missouri Botanical Garden — Nelumbo nucifera](https://www.missouribotanicalgarden.org/PlantFinder/PlantFinderDetails.aspx?hf=3&isprofile=0&taxonid=282911)
- [Missouri Botanical Garden — Helianthus annuus](https://www.missouribotanicalgarden.org/PlantFinder/PlantFinderDetails.aspx?cv=5&isprofile=0&lo=1&taxonid=277199)
- [Sunflower head orientation and pollinator visits](https://pmc.ncbi.nlm.nih.gov/articles/PMC7725789/)
- [Dynamics of sunflower head orientation](https://pmc.ncbi.nlm.nih.gov/articles/PMC10168033/)

## 꽃밭 배치 모델

자유 산포, 종별 평행 줄, 동심원, 종별 부채꼴, 중심원·부채·외곽원 복합 배치는 식물의 생물학적 형질이 아니라 정원 설계와 비교 관찰을 위한 표시 규칙이다. 꽃터널은 중앙 통로 양쪽 식재를 안쪽으로 기울이고 목재 퍼골라 아치를 생성하며, 양벽 꽃길은 통로 양쪽의 다중 띠와 수직 트렐리스를 만든다. 두 방식 모두 충돌 반복 중에도 식재 뿌리가 통로를 침범하지 않으며 지피·수풀·돌도 통로 밖에 둔다.

모든 방식은 같은 배치 시드에서 결정론적으로 재생되며, 랜덤 혼합 강도 0%에서는 패턴의 종별 구획을 보존하고 100%에서는 위치 패턴은 유지한 채 종만 무작위로 교환한다. 같은 종의 높이와 꽃·꽃차례 지름도 종별로 독립 조절한다. 0%에서는 모든 비편집 개체가 프리셋 기본값을 사용하고, 100%에서는 위 표의 종별 관찰 범위 전체를 배치 시드로 표본화하며, 중간 강도는 기본값과 표본 사이를 보간한다. 개별 꽃에 저장한 cm 값은 이 랜덤값보다 우선한다. 종별 컬러 범위도 별도 시드 샘플로 결정하여 배치를 다시 열었을 때 같은 개체색을 얻는다. 강도 0%는 원래 프리셋 색, 100%는 지정한 시작색–끝색의 선형광 보간을 사용한다. 배치가 끝난 뒤에는 실제 꽃 지름·머리 기울기·꽃자루·바람 여유를 사용한 성숙 꽃머리 충돌 완화를 공통 적용하므로 개화 중 기관이 서로 관통하지 않도록 한다.

## 꽃밭 지표 생태층과 바람장

꽃밭 바닥은 외부 3D 자산 없이 배치 시드로부터 생성한다. 낮은 주파수의 흙 높이장을 식물 뿌리 높이와 지면 메시가 함께 사용하며, 정점 색으로 건조한 흙·양토·이끼성 얼룩을 섞는다. 잔풀, 넓은 잎 수풀, 작은 돌은 꽃대 바로 주변을 피하여 원형 꽃밭 안에 결정론적으로 산포하고 각각 하나의 인스턴스 배치로 그린다. 지피·수풀·돌 밀도와 흙 굴곡은 0–100% 범위에서 독립적으로 조절할 수 있다.

바람은 장면 전체가 같은 방향으로 천천히 이동하는 성분과 위치·개체 위상에 따라 빠르게 변하는 난류 성분을 합친 공간장이다. 꽃대는 전체 높이에 비례한 저주파 굽힘, 꽃자루와 꽃머리는 별도의 고개 끄덕임, 잎은 잎자루 끝의 이동과 장축 회전, 열린 꽃잎은 개별 위상에 따른 작은 굽힘·비틀림을 받는다. 잔풀은 가장 유연하고 넓은 잎 수풀은 더 단단하게 반응한다. 이는 실시간 관찰을 위한 강성 계층 근사이며 유체–구조 연성 해석은 아니다.

## 해석 한계

이 구현은 논문에 보고된 형태학적 방향과 상대 순서를 보존하지만, 세포벽 탄성·팽압·호르몬 농도·온도장을 유한요소법으로 푸는 생물역학 해석은 아니다. 서로 다른 논문의 절대 수치는 직접 비교하지 않았고, 화면에서 기관이 식별되도록 비선형 완화와 종별 지연을 사용했다.
