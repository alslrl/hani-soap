# iPad 인체 도해와 좌표 기록

2026년 10월 9일 사용자가 AcuAtlas의 3D 인체를 정면·후면의 고정 그림으로 사용하는 안을 승인했다. 앱에는 PNG 두 장을 표시하며 WebGL·3D 회전·원본 혈자리 점을 로딩하지 않는다.

## 원본과 재현

- 원본 모델: [AcuAtlas body-skin.glb](https://acupointatlas.com/models/body-skin.glb). [배포 페이지](https://acupointatlas.com/3d-atlas/)가 Z-Anatomy의 CC BY-SA 메시로 표시한다.
- 원저작자·조건: [Z-Anatomy 원본 저장소](https://github.com/Z-Anatomy/Models-of-human-anatomy). 피부 모델과 파생 PNG는 CC BY-SA 4.0으로 배포하고 BodyParts3D 상위 출처도 표시한다.
- 공개 출처 안내: `public/demo/anatomy/ATTRIBUTION.html`. 사용한 원본 GLB와 라이선스 사본도 같은 자산 폴더에 보존한다.
- 재현: `node scripts/render-anatomy.mjs`. 고정한 Three.js와 Playwright Chromium으로 원본 GLB를 렌더링한다. 실제 환자 파일이나 API 키를 읽지 않는다.

렌더러는 인체 밖에 있는 분리된 문자 기하만 제외하고 모든 피부 부품을 보존한다. 작은 얼굴·손가락 부품을 크기 기준으로 삭제하지 않는다. 표면 재질·법선·조명을 조정하며, 카메라는 앞뒤 모두 같은 크기의 직교 투영을 사용한다.

PNG는 투명 2000×2000이고 SVG의 1000×1000 좌표면에 등록한다. 인체의 머리 위는 y=42, 발바닥은 y=963을 기준으로 한다. 실제 PNG alpha에서 추출한 부위 판정용 silhouette은 `data/anatomy/body-map-v2-silhouette.json`에 저장한다. 혈자리 좌표와는 관계없는 화면 입력 영역이다.

## 여성형 도해

여성형은 NIH/HuBMAP Human Reference Atlas의 `Skin, Female v1.3` 모델을 사용한다. 원저작자는 Kristen Browne·Heidi Schlehlein이며 Visible Human Female(National Library of Medicine) 자료를 기반으로 한다. [NIH 원본 안내](https://3d.nih.gov/entries/3DPX-020986?version=1), [원본 메타데이터](https://cdn.humanatlas.io/digital-objects/ref-organ/skin-female/v1.3/metadata.json), [DOI](https://doi.org/10.48539/HBM466.LKPQ.876)를 보존했다. 여성형 원본과 파생 이미지·윤곽은 CC BY 4.0이며, 남성형 Z-Anatomy의 CC BY-SA 4.0과 구분한다.

`node scripts/render-anatomy.mjs --female`로 동일한 조명·2000×2000 투명 PNG·1000×1000 등록면에 렌더링한다. 원본 자세와 표면을 유지하며 `body-map-v3-female-silhouette.json`에서 별도의 실제 alpha 윤곽을 사용한다. 기존 남성형 발목 좌표를 여성형에 그대로 대입하지 않는다. 원본 GLB·메타데이터와 female-manifest.json에 출처·라이선스·변경·체크섬을 기록한다.

## 세로 화면

화면 폭 하나로 구분하지 않고 화면 방향을 기준으로 세로 작업면을 구성한다. 834×1194·820×1180·1024×1366에서 환자 이름·방문 당시 나이·성별·회차·주소증을 상단에 두고, 대부분의 높이를 인체 캔버스에 사용한다. 도구·기록·저장은 하단에 고정한다. 후보와 기록은 하단 시트로 표시하며 시트 개폐로 캔버스 위치·크기를 바꾸지 않는다.

기본 세로 viewBox는 `230 0 540 1000`이다. 저장 좌표는 계속 원본 1000면의 normalized 0~1을 사용한다. 과거 기록은 원본 여백까지 보도록 전체 `0 0 1000 1000`을 사용하며, 현재 도해의 여백 필기도 전체 보기로 확인할 수 있다.

## 기존 필기 보존

저장 좌표는 계속 normalized 0~1이고, 각 annotation ID의 coordinate_version은 변경할 수 없다. 현재 화면은 환자의 저장된 성별에 따라 여성형 v3 또는 남성형 v2를 선택한다. 기존 v1/v2 필기는 삭제하거나 새 그림에 겹치지 않고 `이전 도해 기록`에서 원래 그림·전체 캔버스로 읽기 전용 표시한다.

하나의 방문 안에 서로 다른 버전의 문서가 별도 ID로 존재할 수 있다. 같은 버전·시술·면의 레이어는 하나이며, 버전이 다른 필기는 같은 표시 면에 섞지 않는다. 여성형의 새 필기를 저장해도 기존 annotation ID·좌표·원문은 그대로 보존한다.

원본 좌표 보류 이력은 AcuAtlas의 경혈 좌표에 대한 기록으로 유지한다. 이번에 채택한 것은 피부 모델의 정면·후면 그림이며, 원본의 경혈 점을 새 그림에 투영하지 않는다. 정밀 경혈 배치와 실제 iPad·Apple Pencil의 품질 검수는 별도다.
