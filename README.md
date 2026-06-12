# 우모가 (우리가 모두 가능한 시간)

여러 명의 가능 시간을 취합해 최적 일정을 찾고, 구글 캘린더에 등록하는 앱.
모임 유형(워크숍·회의·강의·온라인 중계), 참여 코드, 응답 마감, 그리고
카톡 등 일정 논의 스크린샷에서 후보 시간을 자동 추출하는 기능을 포함합니다.
데이터는 Google Apps Script 웹 앱을 통해 구글 스프레드시트에 저장됩니다.

## 백엔드 설정
1. 시트 → 확장 프로그램 → Apps Script 에 `Code.gs` 붙여넣기
2. 배포 → 새 배포 → 웹 앱 / 실행: 나 / 액세스: 모든 사용자
3. 웹 앱 URL은 `src/App.jsx` 상단 `GAS_URL_DEFAULT` 에 이미 들어 있습니다.

## 스크린샷 자동 추출 (선택 기능)
Apps Script → 프로젝트 설정(톱니) → 스크립트 속성 →
`ANTHROPIC_API_KEY` 추가(값: Anthropic API 키). 키가 없으면 직접 입력만 됩니다.
Code.gs를 수정했으면 반드시 "배포 관리 → 편집 → 버전: 새 버전"으로 다시 배포하세요.

## Vercel 배포 (GitHub 연동)
저장소 Import → Vite 자동 인식 → Deploy. 이후 push 시 자동 재배포.

## 로컬 실행
```bash
npm install
npm run dev
```
