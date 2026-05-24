# Lectures

강의 자료를 위한 정적 사이트. Org-mode export HTML과 인터랙티브 HTML을 한 곳에서 관리합니다.

- **메인 사이트**: `/` — 사이드바 + iframe 본문, 검색, 다크모드, 키보드 단축키
- **관리 페이지**: `/admin/` — zip drag&drop으로 자료 업로드, 삭제, 수정, 순서 변경

---

## 한 번만 하는 세팅

### 1. GitHub 레포 생성
1. GitHub에서 새 레포 생성 (예: `lectures`). public 권장 (private이면 Pro 필요).
2. 이 폴더의 파일들을 push.
3. **Settings → Pages** → Source: `Deploy from a branch` → Branch: `main` / `(root)` 선택 → Save.
4. 1~2분 후 `https://<your-id>.github.io/lectures/` 에서 접속 가능.

### 2. Personal Access Token 발급
관리 페이지에서 자료를 자동 업로드하려면 Fine-grained PAT가 필요합니다.

1. <https://github.com/settings/tokens?type=beta> 접속.
2. **Generate new token** 클릭.
3. 설정:
   - **Token name**: `lectures-admin` (자유)
   - **Expiration**: 1년 권장
   - **Repository access**: `Only select repositories` → 이 레포 선택
   - **Permissions → Repository permissions → Contents**: `Read and write`
4. **Generate token** → 토큰 복사 (`github_pat_...`).

### 3. 관리 페이지 첫 접속
1. `https://<your-id>.github.io/lectures/admin/` 접속.
2. 우상단 ⚙ 클릭 → 소유자/레포명/토큰 입력 → **연결 테스트** → **저장**.
3. 끝. 이제 zip을 끌어다 놓으면 됩니다.

---

## 매주 자료 올리기

### Org-mode export 자료
1. Emacs에서 `C-c C-e h h` (readthedoc 테마 등)로 HTML export.
2. 결과 폴더(HTML + 이미지)를 zip 압축.
3. 관리 페이지에서 zip을 drag&drop.
4. 과목 선택, 챕터 제목 입력, 태그 입력.
5. **업로드** 클릭.

### 단일 HTML (Claude 생성 시각화 등)
1. HTML 파일을 그대로 drag&drop (zip 안 해도 됨).
2. 과목·제목·태그 입력 후 업로드.

### 새 과목 추가
업로드 시 과목 드롭다운에서 **+ 새 과목 만들기** 선택 → 과목명 입력하면 즉석 생성됩니다.

---

## 키보드 단축키

### 메인 사이트
- `[` 또는 `\` — 사이드바 토글
- `/` — 검색창 포커스
- `Esc` — 검색 해제
- `t` — 테마 전환

### 관리 페이지
- `s` — 설정 열기
- `t` — 테마 전환
- `Esc` — 모달 닫기

---

## 구조

```
lectures/
├── index.html              메인 사이트
├── assets/
│   ├── style.css
│   └── app.js
├── data/
│   └── toc.json            목차 (자동 관리)
├── admin/
│   ├── index.html          관리 페이지
│   ├── admin.css
│   └── admin.js
└── courses/                강의 자료 (자동 배치)
    └── <course-slug>/
        └── <chapter-slug>/
            ├── index.html
            └── images/
```

---

## 보안 주의

- 토큰은 **본인 브라우저 localStorage에만** 저장됩니다. 서버로 전송되지 않습니다.
- **공용 PC에서는 절대** 토큰을 입력하지 마세요.
- 정기적으로 토큰을 회전(재발급)하는 게 안전합니다.
- 토큰 권한은 해당 레포 `Contents: Read and write` 만으로 충분합니다.

---

## 트러블슈팅

- **toc.json을 불러올 수 없습니다**: GitHub Pages 배포가 끝났는지 확인. Settings → Pages에서 마지막 배포 시각 체크.
- **연결 실패**: 토큰 만료 가능성. 설정에서 다시 발급 후 입력.
- **업로드는 됐는데 사이트에 안 보임**: GitHub Pages 빌드에 1~2분 걸립니다. 새로고침 후 재확인.
- **이미지가 안 보임**: HTML 안의 이미지 경로가 자동 정리되지만, 이상한 경로는 놓칠 수 있습니다. zip 안의 폴더 구조를 단순하게 (`*_images/` 또는 `images/`) 유지하면 안전.
- **로컬에서 fetch가 막힘**: `python3 -m http.server`로 띄워서 테스트하세요. `file://`로 직접 열면 안 됩니다.
