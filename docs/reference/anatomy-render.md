# iPad 인체 그림 v2

2026년 10월 9일 사용자가 AcuAtlas의 3D 인체를 정면·후면의 고정 그림으로 사용하는 안을 승인했다. 앱에는 PNG 두 장을 표시하며 WebGL·3D 회전·원본 혈자리 점을 로딩하지 않는다.

## 원본과 재현

- 원본 모델: [AcuAtlas body-skin.glb](https://acupointatlas.com/models/body-skin.glb). [배포 페이지](https://acupointatlas.com/3d-atlas/)가 Z-Anatomy의 CC BY-SA 메시로 표시한다.
- 원저작자·조건: [Z-Anatomy 원본 저장소](https://github.com/Z-Anatomy/Models-of-human-anatomy). 피부 모델과 파생 PNG는 CC BY-SA 4.0으로 배포하고 BodyParts3D 상위 출처도 표시한다.
- 공개 출처 안내: `public/demo/anatomy/ATTRIBUTION.html`. 사용한 원본 GLB와 라이선스 사본도 같은 자산 폴더에 보존한다.
- 재현: `node scripts/render-anatomy.mjs`. 고정한 Three.js와 Playwright Chromium으로 원본 GLB를 렌더링한다. 실제 환자 파일이나 API 키를 읽지 않는다.

렌더러는 인체 밖에 있는 분리된 문자 기하만 제외하고 모든 피부 부품을 보존한다. 작은 얼굴·손가락 부품을 크기 기준으로 삭제하지 않는다. 표면 재질·법선·조명을 조정하며, 카메라는 앞뒤 모두 같은 크기의 직교 투영을 사용한다.

PNG는 투명 2000×2000이고 SVG의 1000×1000 좌표면에 등록한다. 인체의 머리 위는 y=42, 발바닥은 y=963을 기준으로 한다. 실제 PNG alpha에서 추출한 부위 판정용 silhouette은 `data/anatomy/body-map-v2-silhouette.json`에 저장한다. 혈자리 좌표와는 관계없는 화면 입력 영역이다.

## 기존 필기 보존

저장 좌표의 범위는 계속 normalized 0~1이다. 새로운 도해는 `body-map-v2`이며 이전 그림·영역은 `body-map-v1`으로 보존한다. 한 방문에 v1 필기가 있으면 그 방문 전체에서 기존 도해를 사용한다. 필기가 없는 새 방문은 v2를 사용한다. 같은 방문 안에서 좌표 버전을 섞거나 기존 필기의 버전을 조용히 바꾸는 저장은 서버가 거절한다.

원본 좌표 보류 이력은 AcuAtlas의 경혈 좌표에 대한 기록으로 유지한다. 이번에 채택한 것은 피부 모델의 정면·후면 그림이며, 원본의 경혈 점을 새 그림에 투영하지 않는다. 정밀 경혈 배치와 실제 iPad·Apple Pencil의 품질 검수는 별도다.
