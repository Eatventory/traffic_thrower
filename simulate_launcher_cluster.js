// simulate_launcher_cluster.js - 멀티코어 병렬 고성능 트래픽 발사기 (Cluster)

import cluster from "cluster";
import os from "os";
import https from "https";
import http from "http";
import { Agent as HttpsAgent } from "https";
import { Agent as HttpAgent } from "http";

// 사용법: node simulate_launcher_cluster.js [ENDPOINT] [TOTAL_REQUESTS] [DURATION_SECONDS]
// 예시:
// - 10만개 요청: node simulate_launcher_cluster.js
// - 5분간 트래픽: node simulate_launcher_cluster.js http://example.com 0 300
// - 1시간 트래픽: node simulate_launcher_cluster.js http://example.com 0 3600

const ENDPOINT =
  process.argv[2] ||
  "http://klicklab-nlb-0f6efee8fd967688.elb.ap-northeast-2.amazonaws.com/api/analytics/collect";
const TOTAL = parseInt(process.argv[3]) || 100000;
const BATCH_SIZE = 150;
const CONCURRENT_BATCHES = 4;
const DURATION_SEC = parseInt(process.argv[4]) || 0; // 0이면 미사용

// 시간 기반 모드인지 확인
const isTimeBased = DURATION_SEC > 0;

if (isTimeBased) {
  console.log(`⏰ 시간 기반 트래픽 발사 모드`);
  console.log(
    `🎯 목표 시간: ${DURATION_SEC}초 (${(DURATION_SEC / 60).toFixed(1)}분)`
  );
  console.log(`📡 엔드포인트: ${ENDPOINT}`);
} else {
  console.log(`📊 요청 수 기반 트래픽 발사 모드`);
  console.log(`🎯 목표 요청 수: ${TOTAL.toLocaleString()}개`);
  console.log(`📡 엔드포인트: ${ENDPOINT}`);
}

const osList = ["Android", "iOS", "Windows", "macOS"];
const genderList = ["male", "female"];
const eventNames = ["auto_click"];

// 시드 기반 랜덤 생성기 (Xorshift 알고리즘)
class SeededRandom {
  constructor(seed) {
    this.seed = seed || Date.now();
  }

  next() {
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >> 17;
    this.seed ^= this.seed << 5;
    return (this.seed >>> 0) / 4294967296; // 0~1 사이 값으로 정규화
  }

  random() {
    return this.next();
  }

  randomInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  randomChoice(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

// 워커별로 다른 시드를 가진 랜덤 생성기 생성
let seededRandom;
if (cluster.isPrimary) {
  // 마스터 프로세스용 랜덤 생성기
  seededRandom = new SeededRandom(Date.now());
} else {
  // 워커 프로세스용 랜덤 생성기 (워커 ID를 시드에 포함)
  seededRandom = new SeededRandom(Date.now() + cluster.worker.id);
}

// 시드 기반 랜덤 테스트 (디버깅용)
if (!cluster.isPrimary) {
  console.log(`🎲 워커 ${cluster.worker.id} 시드: ${seededRandom.seed}`);
}

// 프로토콜에 따라 http/https 모듈과 Agent 선택
const isHttps = ENDPOINT.startsWith("https://");
const requestModule = isHttps ? https : http;
const agent = isHttps
  ? new HttpsAgent({
      keepAlive: true,
      maxSockets: 1500,
      maxFreeSockets: 1000,
      timeout: 30000,
      freeSocketTimeout: 15000,
    })
  : new HttpAgent({
      keepAlive: true,
      maxSockets: 1500,
      maxFreeSockets: 1000,
      timeout: 30000,
      freeSocketTimeout: 15000,
    });

function random(arr) {
  return seededRandom.randomChoice(arr);
}

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (seededRandom.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function formatLocalDateTime(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function createEvent() {
  const os = random(osList);
  const gender = random(genderList);
  const uuidVal = uuid();
  return {
    event_name: random(eventNames),
    timestamp: formatLocalDateTime(new Date()),
    client_id: uuidVal,
    user_id: seededRandom.randomInt(0, 9999),
    session_id: `sess_${Date.now()}_${uuidVal.slice(0, 6)}`,
    device_type: /Android|iOS/.test(os) ? "mobile" : "desktop",
    traffic_medium: "direct",
    traffic_source: "cli_simulator",
    properties: {
      page_path: "/cli",
      page_title: "CLI Simulate",
      is_button: true,
      target_text: `button ${seededRandom.randomInt(0, 7)}`,
      referrer: "",
    },
    context: {
      geo: { country: "KR", city: "Seoul", timezone: "Asia/Seoul" },
      device: {
        device_type: /Android|iOS/.test(os) ? "mobile" : "desktop",
        os,
        browser: "Chrome",
        language: "ko-KR",
        timezone: "Asia/Seoul",
      },
      traffic_source: { medium: "cli", source: "simulated", campaign: null },
      user_agent: "Simulator/CLI",
      screen_resolution: "1920x1080",
      viewport_size: "1200x800",
      utm_params: {},
    },
    user_gender: gender,
    user_age: seededRandom.randomInt(10, 49),
  };
}

function sendOne(eventData, retry = 0) {
  return new Promise((resolve) => {
    const body = JSON.stringify(eventData);
    const req = requestModule.request(
      ENDPOINT,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        agent: agent,
      },
      (res) => {
        res
          .on("data", () => {})
          .on("end", () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(true);
            } else {
              console.error(`❌ 실패 응답: ${res.statusCode}`);
              resolve(false);
            }
          });
      }
    );
    req.on("error", (err) => {
      console.error(`🚨 요청 실패: ${err.code || err.message}`);
      if (retry < 2) {
        setTimeout(() => resolve(sendOne(eventData, retry + 1)), 10);
      } else {
        resolve(false);
      }
    });
    req.write(body);
    req.end();
  });
}

async function sendBatch(size) {
  const promises = [];
  for (let i = 0; i < size; i++) {
    promises.push(sendOne(createEvent()));
  }
  const results = await Promise.all(promises);
  // 성공/실패 모두 반환
  return {
    success: results.filter(Boolean).length,
    fail: results.filter((x) => !x).length,
  };
}

async function launcher(workerId) {
  const cpuCount = 12;

  if (isTimeBased) {
    console.log(
      `🧵 워커 ${workerId} 시작 | 시간 기반 모드 | 목표 시간: ${DURATION_SEC}초`
    );
  } else {
    const perWorker = Math.floor(TOTAL / cpuCount);
    console.log(
      `🧵 워커 ${workerId} 시작 | 요청 수 기반 모드 | 목표 요청 수: ${perWorker}`
    );
  }

  let sent = 0,
    ok = 0,
    fail = 0;
  const start = Date.now();

  if (DURATION_SEC > 0) {
    // 시간 기반 트래픽 발사
    while (true) {
      const now = Date.now();
      const elapsed = (now - start) / 1000;
      if (elapsed >= DURATION_SEC) break;
      const batchGroup = [];
      for (let i = 0; i < CONCURRENT_BATCHES; i++) {
        batchGroup.push(sendBatch(BATCH_SIZE));
      }
      const results = await Promise.all(batchGroup);
      ok += results.reduce((a, b) => a + b.success, 0);
      fail += results.reduce((a, b) => a + b.fail, 0);
      sent += BATCH_SIZE * CONCURRENT_BATCHES;
      const totalElapsed = (Date.now() - start) / 1000;
      const remainingTime = DURATION_SEC - totalElapsed;
      console.log(
        `📤 워커 ${workerId} 진행(시간): ${sent}개 전송, 성공: ${ok}, 실패: ${fail}, RPS: ${(
          (ok + fail) /
          totalElapsed
        ).toFixed(0)}, 남은시간: ${remainingTime.toFixed(1)}초`
      );
    }
  } else {
    // 기존 요청 수 기반 트래픽 발사
    const perWorker = Math.floor(TOTAL / 12); // cpuCount는 12로 고정
    while (sent < perWorker) {
      const batchGroup = [];
      let batchTotal = 0;
      for (let i = 0; i < CONCURRENT_BATCHES && sent < perWorker; i++) {
        const batchSize = Math.min(BATCH_SIZE, perWorker - sent);
        sent += batchSize;
        batchTotal += batchSize;
        batchGroup.push(sendBatch(batchSize));
      }
      const results = await Promise.all(batchGroup);
      ok += results.reduce((a, b) => a + b.success, 0);
      fail += results.reduce((a, b) => a + b.fail, 0);
      const totalElapsed = (Date.now() - start) / 1000;
      console.log(
        `📤 워커 ${workerId} 진행: ${sent}/${perWorker}, 성공: ${ok}, 실패: ${fail}, RPS: ${(
          (ok + fail) /
          totalElapsed
        ).toFixed(0)}`
      );
    }
  }

  const duration = Date.now() - start;
  const totalTried = ok + fail;
  const avgRps = Math.round(totalTried / (duration / 1000));

  if (isTimeBased) {
    console.log(
      `🎯 워커 ${workerId} 완료 | ${DURATION_SEC}초 동안 실행 | 성공률: ${(
        (ok / totalTried) *
        100
      ).toFixed(2)}%, 성공: ${ok}, 실패: ${fail}, 평균 RPS: ${avgRps}`
    );
  } else {
    console.log(
      `🎯 워커 ${workerId} 완료 | 성공률: ${((ok / totalTried) * 100).toFixed(
        2
      )}%, 성공: ${ok}, 실패: ${fail}, 평균 RPS: ${avgRps}`
    );
  }
  // 워커가 성공/실패 개수를 마스터에 전송
  if (process.send) {
    process.send({ type: "successCount", ok, fail });
  }
}

if (cluster.isPrimary) {
  const cpuCount = 12;
  let totalOk = 0;
  let totalFail = 0;
  let finished = 0;
  console.log(`💡 멀티코어 클러스터 시작: ${cpuCount} 워커`);
  for (let i = 0; i < cpuCount; i++) {
    const worker = cluster.fork();
    worker.on("message", (msg) => {
      if (msg && msg.type === "successCount") {
        totalOk += msg.ok;
        totalFail += msg.fail;
        finished++;
        if (finished === cpuCount) {
          const totalTried = totalOk + totalFail;
          console.log(`✅ 전체 성공 요청 개수: ${totalOk}`);
          console.log(`❌ 전체 실패 요청 개수: ${totalFail}`);
          console.log(
            `🎯 전체 성공률: ${((totalOk / totalTried) * 100).toFixed(2)}%`
          );
        }
      }
    });
  }
} else {
  launcher(cluster.worker.id);
}
