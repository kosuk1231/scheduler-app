# 언제모여

여러 명의 가능 시간을 취합해 최적 일정을 찾고 구글 캘린더에 등록하는 앱.
데이터는 Google Apps Script 웹 앱을 통해 구글 스프레드시트에 저장됩니다.

## 백엔드
- 웹 앱 URL은 `src/App.jsx` 상단 `GAS_URL_DEFAULT` 에 이미 들어 있습니다.
- 바꾸려면 그 값만 수정하세요.

## Vercel에 바로 배포 (GitHub 불필요)
```bash
npm i -g vercel        # 최초 1회
vercel login           # 최초 1회
vercel                 # 미리보기 배포 (질문은 전부 기본값 Enter)
vercel --prod          # 운영 배포 → 공유용 URL 생성
```
Vite 프로젝트로 자동 인식되어 빌드 설정은 건드릴 필요 없습니다.

## 로컬 실행
```bash
npm install
npm run dev
```
