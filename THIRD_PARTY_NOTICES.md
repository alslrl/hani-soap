# 라이선스 적용 범위와 외부 자료

확인일: 2026-10-21. 아래 내용은 보관된 출처 기록과 원천 제공자의 공개 조건에 근거한 기술 점검입니다. 모든 역사적 권리 관계에 대한 법률 보증이나 임상 검증은 아닙니다.

## 자체 코드와 문서: MIT

루트 LICENSE는 HaniSOAP 기여자가 권리를 가진 원본 애플리케이션 코드와 자체 기술 문서에 적용합니다. 외부 자료·기존 개별 라이선스·타인의 권리를 변경하지 않습니다. data/와 public/demo/의 전체 내용, 외부 도해를 포함한 docs/verification/ 산출물에 MIT를 일괄 적용하지 않습니다. 의존성은 각 패키지의 라이선스를 따릅니다. [NOTICE](NOTICE)를 함께 읽어 주세요.

## 인체 도해·모델과 파생 좌표

- **남성형:** public/demo/anatomy/source/body-skin.glb, body-*-v2.png, data/anatomy/body-map-v2-silhouette.json 및 남성형 참고점 등록 자료는 Z-Anatomy 피부 모델과 그 파생물입니다. Z-Anatomy의 **CC BY-SA 4.0**과 저자·변경 고지를 유지합니다. [앱 출처 고지](public/demo/anatomy/ATTRIBUTION.html), [원본 고지](public/demo/anatomy/source/LICENSE.txt), [Z-Anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy), [배포 출처](https://acupointatlas.com/3d-atlas/)를 확인하세요. 검사한 GLB에는 Z_skin 노드 하나, 피부 메시 하나와 skin 재질 하나가 있으며 별도 신장·내이 노드는 없습니다. 전체 원본 아틀라스의 비상업 조건 구성 요소가 이 피부 파일에도 들어 있다고 단정하지 않습니다. 전체 모델의 역사적 계보를 독립 재구성한 것은 아닙니다.
- BodyParts3D의 [현재 공식 조건](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)은 2025-02-27 갱신 후 CC BY 4.0을 표시합니다. 이 사실로 수령한 Z-Anatomy 파생물의 ShareAlike 조건을 지우지 않습니다.
- **여성형:** public/demo/anatomy/source/body-female.glb, body-*-v3-female.png, 여성형 실루엣·등록 자료는 Human Reference Atlas 피부 모델 기반이며 **CC BY 4.0** 저자·출처·변경 고지를 유지합니다. [원본 고지](public/demo/anatomy/source/FEMALE-LICENSE.txt)를 확인하세요.
- 남성형과 여성형이 함께 든 acupoint-reference-overlay.json은 각 registrations 항목의 적용 조건을 구분합니다. 파생 도해에 SA 조건이 있다는 이유로 독립 애플리케이션 코드 전체를 SA라고 표시하거나, 반대로 도해를 MIT로 바꾸지 않습니다.

## 경혈 자료와 검수 화면

- AcuAtlas의 원본 데이터·도해와 자체 작성 영문 위치 설명은 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 고지를 유지합니다. 원천: [atlas](https://acupointatlas.com/atlas/), [about](https://acupointatlas.com/about/). 그림의 실제 URL·체크섬은 data/acupoints/도해_출처.json에 있습니다.
- 361종 선택 카탈로그에는 코드·명칭·경맥·부위·외부 링크를 남깁니다. KM-Agent와 KMCRIC의 명칭 대조·코드 보정 출처도 유지합니다. [자료 설명](data/acupoints/자료조사_및_데이터설명.md)과 [앱 출처 고지](public/demo/acupoints/ATTRIBUTION.html)를 확인하세요.
- KM-Agent는 CC BY 4.0을 표시합니다. [KMCRIC 약관](https://www.kmcric.com/ref/policy_agreement.ref) 제11조 제3항은 센터가 권리를 보유한 콘텐츠에 출처 표시 또는 사전 동의를 규정하며, 무조건 비상업 이용만 허용하거나 항상 사전 동의를 요구하는 조항으로 해석하지 않습니다. 제1항의 별도 원저작권자 자료와 WHO 문구의 정확한 배분까지 이 조사에서 확정하지는 못했습니다.
- 따라서 공개용 경혈 연구 JSON에서 location_ko, location_ko_source, location_en_source, body_region_hint.source_phrase를 제외했습니다. 검수 JSON·HTML도 AcuAtlas 자체 영문 설명으로 교체했습니다. 임의의 새 한국어 설명을 원문으로 둔갑시키지 않았습니다.
- docs/verification/atlas-review/와 관련 발목 검수 그림·표시좌표·템플릿은 외부 도해·데이터의 파생 자료입니다. AcuAtlas 출처·변경 고지와 해당 CC 조건을 유지하며 MIT 문서로 일괄 분류하지 않습니다. 코드·점·좌우 선택 기능은 임상 취혈 정확성의 승인이 아닙니다.

## 명칭 사전: 원천 공공데이터 이용조건

- 변증명: 재배포 권한을 확정하지 못한 개인 PDF·NCKM 출처는 제외했습니다. [KTKP 용어사전 원천](https://www.data.go.kr/data/15002133/openapi.do)이 이용허락범위를 ‘제한 없음’으로 표시하는 명칭 자료 624행·573종을 남겼습니다. [실제 취득 경로와 선별 범위](data/변증명_출처및정리기준.md)를 확인하세요.
- 처방명: KTKP와 KIOM의 실제 원천 6개 계열이 모두 이용허락범위 ‘제한 없음’을 표시하는 것을 확인했습니다. 23,214개 출처 기록과 11,123개 고유 명칭을 유지합니다. [계열별 원천 URL·행수·이용조건](data/처방명_출처및정리기준.md)을 확인하세요.
- 실제 취득은 의방성도 공개 스냅샷을 거쳤습니다. 직접 공식 API에서 다시 내려받았다고 설명하지 않습니다. 포함한 범위는 명칭·한자·원천 식별 정보이며, 중간 제공자의 창작 해설문·계산된 관계·UI를 이용할 권리까지 주장하지 않습니다. 코드 MIT가 공공 원자료의 이용조건을 대체하지 않습니다.

## 가상 데모 자료

가상 프로필·합성 이력·생성 인물 사진은 프로젝트 데모 자료이며 실제 환자의 신원이나 치료 성과를 뜻하지 않습니다. 사진의 기본 2명과 추가 10명의 생성 기록은 data/demo/의 각 portrait-assets.json에 있습니다. 기록은 기본 image_gen 도구 사용과 실제 인물 참고 이미지 미사용을 표시합니다. 이 고지는 AI 산출물의 독점 저작권, 실제 인물과의 비유사성 또는 모든 관할권의 권리 보증이 아닙니다. 기여자가 가진 범위의 권리만 공유하며, 실제 환자 자료를 새로 추가할 허락이 아닙니다.

공개 seed에서 비공개 원문을 가리키던 ID·인용은 가렸습니다. [공개 사본에서 대조할 수 없는 근거](docs/demo-data-provenance.md)를 확인하세요. 기존 팀의 모의 시나리오를 완전히 독립 생성한 새 자료라고 설명하지 않습니다.

## 이번 정리의 경계

권리 미확인 출처의 명칭·복제 위치 설명은 보수적으로 제외하거나 대체했습니다. 모든 외부 자료를 MIT로 바꾸거나 법률 검토가 끝났다고 주장하지 않습니다. 새로운 외부 데이터·원문·실제 환자 자료를 추가하려면 출처와 이용조건을 다시 확인해야 합니다.
