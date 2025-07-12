# 트래픽 발사대 (Traffic Launcher)

멀티코어 병렬 고성능 트래픽 발사기입니다. 12개 CPU 코어를 활용하여 대용량 트래픽을 생성할 수 있습니다.

## 기능

- 🚀 **멀티코어 병렬 처리**: 12개 CPU 코어 동시 활용
- ⏰ **시간 기반 트래픽**: 원하는 시간동안 지속적인 트래픽 생성
- 📊 **요청 수 기반 트래픽**: 원하는 개수만큼 트래픽 생성
- 🔄 **자동 재시도**: 실패한 요청 자동 재시도
- 📈 **실시간 모니터링**: RPS, 성공률 등 실시간 통계

## 사용법

### 기본 사용법

```bash
node simulate_launcher_cluster.js [ENDPOINT] [TOTAL_REQUESTS] [DURATION_SECONDS]
```

### 예시

#### 1. 요청 수 기반 트래픽 (기본)

```bash
# 10만개 요청 발사 (기본값)
node simulate_launcher_cluster.js

# 50만개 요청 발사
node simulate_launcher_cluster.js http://example.com 500000

# 100만개 요청 발사
node simulate_launcher_cluster.js http://example.com 1000000
```

#### 2. 시간 기반 트래픽

```bash
# 5분간 트래픽 발사
node simulate_launcher_cluster.js http://example.com 0 300

# 10분간 트래픽 발사
node simulate_launcher_cluster.js http://example.com 0 600

# 1시간 트래픽 발사
node simulate_launcher_cluster.js http://example.com 0 3600

# 30초간 트래픽 발사
node simulate_launcher_cluster.js http://example.com 0 30
```

## 매개변수

- `ENDPOINT`: 트래픽을 보낼 URL (기본값: KlickLab 엔드포인트)
- `TOTAL_REQUESTS`: 총 요청 수 (시간 기반 모드에서는 0으로 설정)
- `DURATION_SECONDS`: 트래픽 발사 시간(초) (0이면 요청 수 기반 모드)

## 설정

### 배치 크기 조정

```javascript
const BATCH_SIZE = 150; // 한 번에 보낼 요청 수
const CONCURRENT_BATCHES = 4; // 동시 실행 배치 수
```

### CPU 코어 수 조정

```javascript
const cpuCount = 12; // 사용할 CPU 코어 수
```

## 출력 예시

### 시간 기반 모드

```
⏰ 시간 기반 트래픽 발사 모드
🎯 목표 시간: 300초 (5.0분)
📡 엔드포인트: http://example.com
💡 멀티코어 클러스터 시작: 12 워커
🧵 워커 1 시작 | 시간 기반 모드 | 목표 시간: 300초
📤 워커 1 진행(시간): 600개 전송, 성공: 598, 실패: 2, RPS: 120, 남은시간: 295.2초
🎯 워커 1 완료 | 300초 동안 실행 | 성공률: 99.67%, 성공: 35940, 실패: 120, 평균 RPS: 120
```

### 요청 수 기반 모드

```
📊 요청 수 기반 트래픽 발사 모드
🎯 목표 요청 수: 100,000개
📡 엔드포인트: http://example.com
💡 멀티코어 클러스터 시작: 12 워커
🧵 워커 1 시작 | 요청 수 기반 모드 | 목표 요청 수: 8333
📤 워커 1 진행: 600/8333, 성공: 598, 실패: 2, RPS: 120
🎯 워커 1 완료 | 성공률: 99.67%, 성공: 8300, 실패: 33, 평균 RPS: 120
```

## 성능 최적화

- **Keep-Alive**: HTTP 연결 재사용으로 성능 향상
- **Connection Pooling**: 최대 1500개 동시 연결 지원
- **배치 처리**: 150개씩 묶어서 처리하여 효율성 증대
- **멀티코어**: 12개 CPU 코어 동시 활용

## 주의사항

⚠️ **주의**: 이 도구는 테스트 목적으로만 사용하세요. 실제 서비스에 과도한 트래픽을 보내지 마세요.

- 서버 부하 테스트 시에는 점진적으로 트래픽을 증가시키세요
- 대상 서버의 용량을 고려하여 적절한 트래픽을 설정하세요
- 법적/윤리적 문제가 없는 환경에서만 사용하세요
