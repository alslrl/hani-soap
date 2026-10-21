# 라이선스 적용 범위와 외부 자료

점검일: 2026-10-21. 아래 내용은 저장소의 고지·출처 기록에 근거한 기술 점검이며 법률 검토를 대신하지 않습니다.

## MIT가 적용되는 범위

루트 LICENSE는 HaniSOAP 기여자가 권리를 가진 원본 애플리케이션 코드와 자체 기술 문서에 적용합니다. 외부 자료·기존 개별 라이선스·타인의 권리를 변경하지 않습니다. data/와 public/demo/는 이 MIT 허락의 일괄 적용 대상에서 제외합니다. 패키지 의존성은 각 패키지의 라이선스를 따릅니다.

## 외부 도해와 데이터

- **남성형 인체 도해·모델:** public/demo/anatomy/body-*-v2.png, source/body-skin.glb와 파생 실루엣·참고점은 Z-Anatomy/BodyParts3D 계열 자료입니다. 보관된 고지는 CC BY-SA 4.0을 명시합니다. 원본 LICENSE.txt에는 일부 다른 구성 요소의 비상업 조건도 기재되어 있어 실제 피부 모델 포함 범위 확인이 남아 있습니다. MIT로 재허락하지 않습니다. [기존 출처 고지](public/demo/anatomy/ATTRIBUTION.html)와 [원본 고지](public/demo/anatomy/source/LICENSE.txt)를 보존합니다.
- **여성형 인체 도해·모델:** public/demo/anatomy/body-*-v3-female.png, source/body-female.glb와 파생 실루엣은 Human Reference Atlas 계열 자료이며 보관된 FEMALE-LICENSE.txt는 CC BY 4.0을 명시합니다. 해당 저자·출처·변경 고지를 유지해야 합니다. [원본 고지](public/demo/anatomy/source/FEMALE-LICENSE.txt)를 확인하세요.
- **경혈 그림·좌표·설명:** data/acupoints/와 data/anatomy/acupoint-reference-overlay.json에는 AcuAtlas, KM-Agent, KMCRIC 등 서로 다른 출처가 연결됩니다. AcuAtlas의 CC BY 4.0 표기만으로 모든 한국어 설명의 재배포 권리가 확인되는 것은 아닙니다. 출처 파일은 상위 원문 권리 확인 필요 항목과 외부 링크 전용 항목을 포함합니다. [출처 기록](data/acupoints/자료조사_및_데이터설명.md)과 [앱의 출처 고지](public/demo/acupoints/ATTRIBUTION.html)를 유지합니다.
- **변증명·처방명 자료:** data/변증명_*와 data/처방명_*는 여러 웹·교재·공공 자료에서 수집한 목록과 출처 기록입니다. 출처별 재배포 허락이 이 점검에서 확인되지 않았습니다. MIT 자료로 간주하거나 원문 전체를 임의로 재배포하지 마세요.
- **데모 환자 데이터·사진:** data/demo/와 public/demo/portraits/는 가상 프로필·합성 이력·생성 이미지로 기록되어 있습니다. 기본 2명과 추가 10명의 이미지 생성 기록은 각 portrait-assets.json에 있습니다. 생성 서비스의 당시 조건과 진료 시나리오 원문의 공개 범위는 별도 확인해야 하며, 개인정보가 전혀 없다는 보증은 아닙니다.

- **Atlas 검수 산출물:** docs/verification/atlas-review/의 HTML·PNG·좌표 JSON, docs/verification/atlas_발목_데모_검수.png와 표시좌표 JSON, 검수용 템플릿에는 외부 도해·설명 또는 그 파생 자료가 포함됩니다. 이 디렉터리는 자체 기술 문서 MIT 적용 범위가 아닙니다. AcuAtlas 출처·변경 고지와 상위 한국어 설명의 권리 확인 조건을 동일하게 적용하며, 미확인 자료를 포함한 검수 묶음도 릴리스 차단 대상입니다.

## 릴리스 차단 항목

재배포 권리가 확인되지 않은 항목은 허락을 확인하거나, 권리가 명확한 대체 자료로 바꾸거나, 해당 자료가 없어도 동작하도록 분리해야 합니다. 고지에 ‘확인 필요’라고 쓰는 것만으로 재배포 허락을 얻는 것은 아닙니다. 그 전에는 전체 자산을 묶은 상용·일괄 MIT 배포판을 만들지 않습니다.

앱은 현재 도해·용어 사전·경혈 카탈로그에 의존합니다. 이번 공개 파일 정리에서 무작정 삭제해 기능을 깨뜨리지 않았으며, 미해결 자료를 승인한 것으로도 취급하지 않습니다. 후속 정리의 우선순위와 검증 기준은 [유지관리 계획](docs/maintenance.md)에 기록합니다.
