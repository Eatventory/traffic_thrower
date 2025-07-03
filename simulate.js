// simulate.js - 고성능 트래픽 발사대

import fetch from "node-fetch";
import { Agent } from "https";
import http from "http";

const ENDPOINT = "http://localhost:3000/test";
const osList = ["Android", "iOS", "Windows", "macOS"];
const genderList = ["male", "female"];
const eventNames = ["auto_click"];

// HTTP Keep-Alive 에이전트 (소켓 재사용)
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 100,
  maxFreeSockets: 10,
  timeout: 60000,
  freeSocketTimeout: 30000,
});

function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function createEvent() {
  const os = random(osList);
  const gender = random(genderList);
  const uuidVal = uuid();
  const eventName = random(eventNames);
  return {
    event_name: eventName,
    timestamp: new Date().toISOString(),
    client_id: uuidVal,
    user_id: Math.floor(Math.random() * 10000),
    session_id: `sess_${Date.now()}_${uuidVal.slice(0, 6)}`,
    device_type: /Android|iOS/.test(os) ? "mobile" : "desktop",
    traffic_medium: "direct",
    traffic_source: "cli_simulator",
    properties: {
      page_path: "/cli",
      page_title: "CLI Simulate",
      is_button: true,
      target_text: `button ${Math.floor(Math.random() * 8)}`,
      referrer: "",
    },
    context: {
      geo: {
        country: "KR",
        city: "Seoul",
        timezone: "Asia/Seoul",
      },
      device: {
        device_type: /Android|iOS/.test(os) ? "mobile" : "desktop",
        os,
        browser: "Chrome",
        language: "ko-KR",
        timezone: "Asia/Seoul",
      },
      traffic_source: {
        medium: "cli",
        source: "simulated",
        campaign: null,
      },
      user_agent: "Simulator/CLI",
      screen_resolution: "1920x1080",
      viewport_size: "1200x800",
      utm_params: {},
    },
    user_gender: gender,
    user_age: Math.floor(Math.random() * 40 + 10),
  };
}

// 🚀 고성능 배치 처리
async function sendBatch(batchSize) {
  const promises = [];
  const startTime = Date.now();

  for (let i = 0; i < batchSize; i++) {
    const event = createEvent();
    const promise = fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      agent: httpAgent, // 소켓 재사용
    });
    promises.push(promise);
  }

  try {
    const results = await Promise.allSettled(promises);
    const successful = results.filter(
      (r) => r.status === "fulfilled" && r.value?.ok
    ).length;
    const failed = results.length - successful;
    const duration = Date.now() - startTime;
    const rps = Math.round((batchSize / duration) * 1000);

    console.log(
      `✅ 배치: ${successful}성공 ${failed}실패 ${duration}ms ${rps}RPS`
    );
    return { successful, failed, duration, rps };
  } catch (error) {
    console.error(`❌ 배치 실패:`, error.message);
    return { successful: 0, failed: batchSize, duration: 0, rps: 0 };
  }
}

// 🧪 메인 실행
const TOTAL = parseInt(process.argv[2]) || 1000;
const BATCH_SIZE = 100; // 100개씩 배치
const CONCURRENT_BATCHES = 4; // 4개 배치 동시 실행

(async () => {
  console.log(`🚀 고성능 트래픽 테스트 시작: ${TOTAL}개 요청`);
  console.log(`📦 배치 크기: ${BATCH_SIZE}, 동시 배치: ${CONCURRENT_BATCHES}`);

  const totalBatches = Math.ceil(TOTAL / BATCH_SIZE);
  let totalSuccessful = 0;
  let totalFailed = 0;
  const testStart = Date.now();

  // 배치를 동시 실행 그룹으로 나누기
  for (let i = 0; i < totalBatches; i += CONCURRENT_BATCHES) {
    const batchPromises = [];

    // 동시 실행할 배치들 생성
    for (let j = 0; j < CONCURRENT_BATCHES && i + j < totalBatches; j++) {
      const remainingRequests = TOTAL - (i + j) * BATCH_SIZE;
      const currentBatchSize = Math.min(BATCH_SIZE, remainingRequests);

      if (currentBatchSize > 0) {
        batchPromises.push(sendBatch(currentBatchSize));
      }
    }

    // 동시 배치 실행
    const batchResults = await Promise.all(batchPromises);

    // 결과 집계
    batchResults.forEach((result) => {
      totalSuccessful += result.successful;
      totalFailed += result.failed;
    });

    console.log(
      `📊 진행률: ${Math.min(
        ((i + CONCURRENT_BATCHES) / totalBatches) * 100,
        100
      ).toFixed(1)}%`
    );

    // 서버 부하 방지 (마지막 그룹이 아닌 경우)
    if (i + CONCURRENT_BATCHES < totalBatches) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  const testEnd = Date.now();
  const overallDuration = testEnd - testStart;
  const overallRPS = Math.round((totalSuccessful / overallDuration) * 1000);

  console.log(`\n🎯 최종 결과:`);
  console.log(`총 요청: ${TOTAL}개`);
  console.log(`성공: ${totalSuccessful}개`);
  console.log(`실패: ${totalFailed}개`);
  console.log(`성공률: ${((totalSuccessful / TOTAL) * 100).toFixed(1)}%`);
  console.log(`전체 소요시간: ${overallDuration}ms`);
  console.log(`평균 RPS: ${overallRPS}`);
  console.log(
    `평균 응답시간: ${
      totalSuccessful > 0 ? Math.round(overallDuration / totalSuccessful) : 0
    }ms`
  );
})().catch(console.error);
