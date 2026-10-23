# 1분선불폰 홈페이지 (https://1mintelecom.com)

정적 사이트 파일 저장소입니다. GitHub Pages 로 공개되고, 도메인은 `CNAME` 으로 연결합니다.

- 구조: 루트 HTML(홈·요금제·개통 방법·유심·센터 찾기·소개·약관·개인정보처리방침)과 CSS·JS · `지역/`·`지역.html` 지역별 안내 · `글/`·`글.html` 게시판 · `img/`·`sns/` 사진 · `sitemap*.xml`·`rss.xml`·`robots.txt`
- 배포: `main` 브랜치에 푸시하면 GitHub Pages 가 다시 빌드합니다.
- `.github/workflows/daily-region-release.yml`: 매일 오전 9시(한국 시각)에 아직 공개 안 된 지역 페이지를 하루 최대 5장 공개합니다(noindex 제거 → `sitemap.xml` 추가 → 커밋·푸시 → 실제 페이지 확인 → IndexNow·네이버에 알림). 상태는 `.daily-release.json`·`.release-plan.json` 에 남습니다. 모두 공개되면 스스로 꺼지며, 2026-10-02 남은 지역 페이지를 한꺼번에 공개해 지금은 꺼져 있습니다.
- `_tools/`: 페이지 생성·점검 도구입니다. `.gitignore` 로 빠져 있어 이 저장소에는 올라가지 않습니다(로컬 전용).
