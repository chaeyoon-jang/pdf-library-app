# 📚 PDF Library — 설정 가이드

단일 HTML 파일 논문 관리 툴. GitHub private 저장소를 데이터베이스로 사용하므로 **어느 컴퓨터에서든 같은 라이브러리**(PDF + 형광펜 + 메모 + bibtex)에 접근할 수 있습니다.

## 동작 원리

```
index.html (정적 앱, 서버 불필요)
        │  GitHub REST API (CORS 전면 허용)
        ▼
private repo
 ├── library.json          ← 테이블 메타데이터 (제목/요약/bibtex)
 ├── papers/<id>.pdf       ← PDF 원본
 └── annotations/<id>.json ← 형광펜·메모 (페이지 좌표를 비율로 저장 → 줌 무관)
```

- 모든 변경이 git 커밋 → 어노테이션 히스토리가 버전 관리됨
- 쓰기 충돌은 sha 기반 optimistic locking으로 감지, 자동 재시도/병합
- 형광펜 좌표는 페이지 크기 대비 비율(fraction)로 정규화 → 기기/줌 수준이 달라도 동일 위치

## 최초 설정 (5분, 1회)

1. **저장소 생성**: github.com → New repository → 이름 예: `paper-library` → **Private** 선택
2. **토큰 발급**: [Settings → Fine-grained tokens → Generate new token](https://github.com/settings/personal-access-tokens/new)
   - Repository access: **Only select repositories** → 방금 만든 repo만 선택
   - Permissions → Repository permissions → **Contents: Read and write** (이것만)
   - Expiration은 1년 권장 (만료 시 재발급해 다시 입력)
3. `index.html`을 브라우저로 열고 사용자명 / repo 이름 / 토큰 입력 → 연결

토큰은 각 브라우저의 localStorage에만 저장됩니다. 새 컴퓨터에서는 같은 토큰(또는 새 토큰)을 한 번만 입력하면 됩니다.

## 어디서나 열기 (선택: GitHub Pages 호스팅)

매번 파일을 복사하기 싫다면 앱 자체를 호스팅하세요:

1. **public** repo 하나 더 생성 (예: `pdf-library-app`) — 앱 코드에는 토큰이 없으므로 public이어도 안전
2. `index.html` 업로드
3. repo Settings → Pages → Branch: `main` → Save
4. `https://<username>.github.io/pdf-library-app/` 접속 → 어느 기기든 URL만 열면 됨

데이터 repo는 계속 private — Pages는 앱 셸만 서빙하고, 데이터는 브라우저→GitHub API 직접 통신.

## 사용법

| 동작 | 방법 |
|---|---|
| PDF 추가 | 테이블 화면 「＋ PDF 추가」 (여러 개 동시 가능) |
| 제목/요약/bibtex 편집 | 행의 ✎ 버튼 |
| BibTeX 복사 | 행의 ⧉ 버튼 |
| PDF 열기 | 행 클릭 |
| 형광펜 | 뷰어에서 텍스트 드래그 → 색상 선택 |
| 메모 | 형광펜 생성 직후 자동으로 메모창 열림, 이후엔 형광펜 클릭 |
| 메모 목록 | 뷰어 우상단 「메모 목록」 — 클릭하면 해당 위치로 점프 |
| 다른 기기와 동기화 | 자동 (어노테이션은 입력 후 ~1.2초 뒤 커밋), 테이블은 ⟳ 버튼 |

## 제약 사항

- PDF 1개당 GitHub contents API 한계(~100MB)까지. 일반 논문(수 MB)은 전혀 문제없음
- 같은 문서를 두 기기에서 **동시에** 어노테이션하면 마지막 저장이 이김 (last-write-wins)
- 스캔본(텍스트 레이어 없는 PDF)은 텍스트 선택 형광펜 불가 — OCR된 PDF 필요
