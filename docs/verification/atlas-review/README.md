# Atlas whole-body acupoint review / Atlas 전신 혈자리 검수

[English](#english) | [한국어](#한국어)

## English

This separate review screen was created on 2026-10-09 at Yeonhwa's request. It does not replace the anatomy illustrations in the clinical app. On 2026-10-09, the user approved sharing the review screen and documentation through commit and push. That sharing approval is not clinical approval of the individual locations of all 361 acupoints.

### Usage

`index.html` is a standalone file containing the illustrations and data. Open it directly in a browser. No persistent preview server is provided.

1. Select a body region, acupoint name, or code.
2. Compare the location description with the point in the enlarged view.
3. Record whether the location is correct, needs correction, or requires further review, and add notes. Drag points to adjust their display positions.
4. Download the review results as JSON. Import previously downloaded results to continue on another computer.

Browser storage persists only at the same address in the same browser. Use the downloaded JSON to share results with Seho. Review status buttons do not confirm that a procedure was performed.

### Scope and adjustments

- The screen includes 361 standard acupoints across 25 body-region categories. The region classification is also a draft based on source text.
- It uses the original Atlas front, back, side, and head illustrations. Points outside or on the body outline were moved to the nearest interior position as display candidates. This is not a method for determining anatomical acupoint locations.
- Sixteen ankle points use separately prepared demo display candidates. The user's review of the ankle illustration was recorded, but does not constitute approval of all 361 individual clinical locations.
- Original coordinates are preserved in `original_coordinate` in `display-candidates.json`. Original coordinates and display candidates are distinct; both require clinical review.
- The screen does not include every patient-relative left/right instance. Areas not visible in the source illustrations, including medial surfaces, the back of the head, palms, soles, and perineum, require deferred judgments, notes, and review with additional illustrations.
- Forty-eight extra acupoints without coordinates and auricular acupuncture materials are not included. Actual procedure records for Ashi and tender points remain separate features in the existing app.

### Outputs

- `index.html`: Standalone whole-body review screen.
- `overview.png`: Whole-body overview image.
- `display-candidates.json`: Original coordinates and display candidates.
- `page-index.json`: Acupoint codes by PDF page.
- PDFs are excluded from the public repository. The generator writes them to the ignored local `output/pdf/` directory; redistribution requires a separate rights review.
- [`../../../scripts/build_atlas_review.py`](../../../scripts/build_atlas_review.py): Generator using the existing local `data/acupoints` materials and Atlas ankle display candidates.

### Sources and licensing

Original AcuAtlas illustrations and data: https://acupointatlas.com/atlas/ (CC BY 4.0). Modifications include enlarged illustrations, composited backgrounds, added points and labels, linked Korean acupoint names and AcuAtlas-authored English location descriptions, and separate display candidates. Original coordinates and coverage of all 361 acupoints are retained.

The public JSON and standalone HTML use AcuAtlas-authored English descriptions under CC BY 4.0 and external reference links, rather than bundling the original KMCRIC/WHO wording. Clinical instructions and needling depths have not been added to the screen. This source selection does not establish that the entire repository or asset bundle has cleared all rights checks; see [third-party notices](../../../THIRD_PARTY_NOTICES.md).

## 한국어

이 화면은 2026-10-09 연화의 요청으로 만든 별도 검수 화면이며, 진료 앱의 인체 도해를 교체하지 않습니다. 2026-10-09 사용자는 검수 화면과 문서를 커밋·푸시하여 공유하는 것을 승인했습니다. 공유 승인은 경혈 361종의 개별 임상 위치에 대한 승인과는 별개입니다.

### 사용 방법

`index.html`은 그림과 데이터를 포함한 독립 파일입니다. 브라우저에서 파일을 직접 열어 확인합니다. 상시 미리보기 서버는 제공하지 않습니다.

1. 부위 또는 혈명·코드를 선택합니다.
2. 선택점을 확대한 화면에서 위치 설명과 점을 대조합니다.
3. 위치 맞음, 위치 수정, 판단 보류 중 하나를 기록하고 메모를 남깁니다. 점을 끌어 표시 위치를 수정할 수 있습니다.
4. 검수 결과를 JSON으로 내려받아 보관합니다. 다른 컴퓨터에서 이전 결과를 불러와 검수를 이어갈 수 있습니다.

브라우저 저장은 같은 주소와 브라우저에서만 유지됩니다. 세호와 공유할 결과는 내려받은 JSON을 사용합니다. 검수 상태 버튼은 시술 시행 확인이 아닙니다.

### 범위와 보정

- 정규 경혈 361종과 부위 분류 25개를 포함합니다. 부위 분류도 출처 텍스트를 바탕으로 만든 초안입니다.
- Atlas 앞면·뒷면·옆면·머리의 원본 도해를 사용했습니다. 몸 윤곽 밖이나 경계에 있는 점은 가장 가까운 윤곽 내부의 화면 표시 후보로 이동했습니다. 이 방법은 해부학적 취혈 위치를 결정하는 방법이 아닙니다.
- 발목 16개는 별도로 준비한 데모 표시 후보를 사용했습니다. 사용자의 발목 그림 확인은 기록했지만, 경혈 361종의 개별 임상 위치를 모두 승인한 것으로 간주하지 않습니다.
- 원본 좌표는 `display-candidates.json`의 `original_coordinate`에 보존했습니다. 표시 후보와 원본 좌표는 서로 구분하며, 모두 임상 검수가 필요합니다.
- 환자 기준 좌우의 모든 위치를 포함하지는 않습니다. 원본에서 보이지 않는 내측·후두·손바닥·발바닥·회음 등은 판단을 보류하고 메모를 남긴 뒤 별도 도해로 검수해야 합니다.
- 좌표가 없는 경외기혈 48종과 이침 자료는 이 화면에 넣지 않았습니다. 아시혈·압통점의 실제 시술 기록은 기존 앱의 별도 기능입니다.

### 산출물

- `index.html`: 전신 검수용 독립 화면입니다.
- `overview.png`: 전신 개요 그림입니다.
- `display-candidates.json`: 원본 좌표와 표시 후보 좌표입니다.
- `page-index.json`: PDF 쪽별 혈자리 코드 목록입니다.
- PDF는 공개 저장소에서 제외합니다. 생성 스크립트는 Git에서 무시되는 로컬 `output/pdf/` 디렉터리에 PDF를 출력하며, 재배포 전에는 별도 권리 확인이 필요합니다.
- [`../../../scripts/build_atlas_review.py`](../../../scripts/build_atlas_review.py): 기존 로컬 `data/acupoints` 자료와 Atlas 발목 표시 후보를 입력으로 사용하는 생성 스크립트입니다.

### 출처와 라이선스

AcuAtlas 원본 그림·데이터의 출처는 https://acupointatlas.com/atlas/ 이며, 라이선스는 CC BY 4.0입니다. 변경 사항은 그림 확대, 배경 합성, 점과 라벨 추가, 한국어 혈명 및 AcuAtlas 자체 영문 위치 설명 연결, 별도 표시 후보 생성입니다. 원본 좌표와 경혈 361종의 범위는 유지합니다.

공개 JSON과 독립 HTML은 KMCRIC/WHO 원문을 묶어 제공하는 대신, CC BY 4.0이 적용되는 AcuAtlas 자체 영문 설명과 외부 참고 링크를 사용합니다. 임상 지시나 자침 깊이는 화면에 추가하지 않았습니다. 이러한 출처 선택이 저장소 전체나 자산 묶음의 권리 확인 완료를 뜻하지는 않습니다. [외부 자료 고지](../../../THIRD_PARTY_NOTICES.md)를 확인하세요.
