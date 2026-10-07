# 매수 시그널 사이트 — 설치 가이드

> **v4 업데이트(2026-10-07):** 실제 일봉 검증, 학습/시간순 검증 분리, 다음 거래일 시가 진입, 비용 가정, 수집 캐시와 실행 제한을 적용했습니다. [변경 사항](../docs/v4-changes.md)을 확인하세요. 이전 `range=max` 요청은 월봉·분기봉으로 응답되는 문제가 확인되어 제거했습니다. 이전 통계와 직접 비교하지 마세요.

저장소 루트에서 실행: `node stock-signal-site/scripts/build.mjs`. 테스트: `node --test stock-signal-site/scripts/*.test.mjs`. 합성 테스트는 별도 `selftest-data.json`에 저장됩니다. 종목 목록은 이제 `scripts/universe.mjs`에서 관리합니다. 실제 사이트 파일은 `/stock-signal-site/index.html`에 있습니다.

매일 아침 **7:30(한국시간)** GitHub 서버가 자동으로 주가를 수집·계산해 `data.json`을 만들고,
사이트에 접속하면 **0초로 즉시** 오늘자 추세추종/계절성 매수 시그널을 보여줍니다.
내 컴퓨터가 꺼져 있어도 GitHub가 대신 돌려주고, **비용은 0원**입니다.

> 작동 원리: GitHub Actions(서버)가 데이터를 직접 받아오므로 브라우저의 CORS/프록시 문제가 없습니다. → 안정적.

---

## 준비물
- GitHub 계정 (무료) — 없으면 https://github.com/signup 에서 가입
- 이 폴더(`stock-signal-site`)의 파일들

폴더 구성:
```
stock-signal-site/
├─ index.html                 ← 사이트 화면
├─ data.json                  ← (자동 생성) 오늘자 데이터
├─ scripts/build.mjs          ← 매일 데이터 만드는 스크립트
├─ .github/workflows/update.yml ← 매일 7:30 자동 실행 설정
└─ README.md                  ← 이 안내문
```

---

## 설치 (한 번만, 약 10분)

### 1) 새 저장소(repository) 만들기
1. https://github.com/new 접속
2. **Repository name**: `stock-signal` (아무 이름 가능)
3. **Public** 선택  ← 공개로 해야 Actions가 무료 무제한입니다
4. **Create repository** 클릭

### 2) 파일 업로드
1. 만든 저장소 화면에서 **Add file → Upload files** 클릭
2. `stock-signal-site` 폴더 안의 **모든 것**을 통째로 드래그&드롭
   - 중요: `index.html`, `scripts` 폴더, `.github` 폴더가 모두 포함돼야 합니다
   - (`.github` 폴더가 안 보이면 숨김파일 표시를 켜거나, 폴더째 드래그하세요)
3. 맨 아래 **Commit changes** 클릭

> 폴더 구조가 유지되도록 **폴더째** 올리는 게 가장 확실합니다.

### 3) 자동 실행 권한 켜기
1. 저장소 상단 **Settings → Actions → General**
2. 아래쪽 **Workflow permissions** → **Read and write permissions** 선택 → **Save**
   - (서버가 `data.json`을 저장하려면 필요합니다)

### 4) 웹사이트 켜기 (GitHub Pages)
1. **Settings → Pages**
2. **Source**: *Deploy from a branch*
3. **Branch**: `main` / `(root)` → **Save**
4. 잠시 뒤 주소가 생성됩니다: `https://<내아이디>.github.io/stock-signal/`

### 5) 첫 데이터 만들기 (수동 1회)
1. 저장소 상단 **Actions** 탭
2. 왼쪽 **Update signals** 클릭 → 오른쪽 **Run workflow** → **Run workflow**
3. 1~3분 뒤 초록 체크 ✓ 가 뜨면 완료 (data.json이 채워짐)

### 6) 접속
- 4)에서 받은 주소로 접속하면 오늘자 시그널이 보입니다.
- **폰에서도** 같은 주소로 접속 → 브라우저 메뉴의 *홈 화면에 추가*를 하면 앱처럼 쓸 수 있어요.

이후부터는 **매일 아침 7:30(KST)** 자동으로 갱신됩니다. 끝!

---

## 자주 묻는 것

**"데이터 준비 전" 화면이 떠요**
→ 5)의 Run workflow가 아직 안 끝났거나 안 돌았습니다. Actions 탭에서 실행/완료를 확인하세요.

**Actions가 빨간 X로 실패해요**
→ 대부분 3)의 권한(Read and write) 누락입니다. 켜고 다시 Run workflow.

**아침에 안 바뀌었어요**
→ GitHub 무료 cron은 몇 분~수십 분 지연될 수 있습니다. 또 앱(GitHub)이 아주 한산할 때 가끔 건너뛰니, 그럴 땐 Run workflow로 수동 갱신하면 됩니다.

**한 곳(Stooq)이 막히면요?**
→ 종목마다 Stooq → Yahoo 순서로 두 곳을 시도합니다. 한 곳이 막혀도 다른 곳에서 받아옵니다.

---

## 종목 추가/변경
`scripts/build.mjs` 상단의 `KR`, `US` 목록을 편집하면 됩니다.
- 한국: `"종목코드.kr": ["이름","섹터","stock"]`  예) `"247540.kr": ["에코프로비엠","2차전지","stock"]`
- 미국: `"티커.us": ["이름","섹터","stock"]`  예) `"smr.us": ["NuScale","에너지","stock"]`
수정 후 저장(commit)하면 다음 실행부터 반영됩니다.

---

## 안내
일봉 종가 기준 백테스트이며 **최신편향(반감기 3년)**이 반영돼 실제 기대수익보다 부풀려질 수 있습니다.
특정 종목 매수 추천이 아니라 정보 제공용이며, 모든 투자 판단과 책임은 본인에게 있습니다.
