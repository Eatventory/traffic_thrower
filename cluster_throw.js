// simulate_launcher_cluster.js - 멀티코어 병렬 고성능 트래픽 발사기 (Fire-and-Forget)

import cluster from "cluster";
import os from "os";
import https from "https";
import http from "http";
import { Agent as HttpsAgent } from "https";
import { Agent as HttpAgent } from "http";
import seedrandom from "seedrandom";

const ENDPOINT =
  process.argv[2] ||
  "https://33fwwdhuz3.execute-api.ap-northeast-2.amazonaws.com/api/analytics/collect";
const TOTAL = parseInt(process.argv[3]) || 100000;
const BATCH_SIZE = 150;
const CONCURRENT_BATCHES = 4;

// 시드값: YYYYMMDDHHmmss
const now = new Date();
const seed = `${now.getFullYear()}${(now.getMonth() + 1)
  .toString()
  .padStart(2, "0")}${now.getDate().toString().padStart(2, "0")}${now
  .getHours()
  .toString()
  .padStart(2, "0")}${now.getMinutes().toString().padStart(2, "0")}${now
  .getSeconds()
  .toString()
  .padStart(2, "0")}`;
const rng = seedrandom(seed);

const osList = ["Android", "iOS", "Windows", "macOS"];
const genderList = ["male", "female"];
const eventNames = ["auto_click"];

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
  return arr[Math.floor(rng() * arr.length)];
}

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (rng() * 16) | 0;
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
    user_id: Math.floor(rng() * 100000), // 0~99999
    session_id: `sess_${Date.now()}_${uuidVal.slice(0, 6)}`,
    device_type: /Android|iOS/.test(os) ? "mobile" : "desktop",
    traffic_medium: "direct",
    traffic_source: "cli_simulator",
    properties: {
      page_path: "/cli",
      page_title: "CLI Simulate",
      is_button: true,
      target_text: `button ${Math.floor(rng() * 8)}`,
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
    user_age: Math.floor(rng() * 40 + 10),
  };
}

function sendOneFireAndForget(eventData) {
  const body = JSON.stringify(eventData);
  const req = requestModule.request(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
    agent: agent,
  });
  req.on("error", () => {}); // 에러 무시
  req.write(body);
  req.end(); // 바로 전송
}

function sendBatchFireAndForget(size) {
  for (let i = 0; i < size; i++) {
    sendOneFireAndForget(createEvent());
  }
}

async function launcher(workerId) {
  const perWorker = Math.floor(TOTAL / 12);
  console.log(`🧵 워커 ${workerId} 시작 | 요청 수: ${perWorker}`);

  let sent = 0;
  const start = Date.now();

  while (sent < perWorker) {
    for (let i = 0; i < CONCURRENT_BATCHES && sent < perWorker; i++) {
      const batchSize = Math.min(BATCH_SIZE, perWorker - sent);
      sent += batchSize;
      sendBatchFireAndForget(batchSize);
    }
    await new Promise((r) => setTimeout(r, 1)); // CPU 점유율 분산
  }

  const duration = Date.now() - start;
  console.log(
    `🎯 워커 ${workerId} 완료 | 총 요청 수: ${sent}, 평균 RPS: ${Math.round(
      sent / (duration / 1000)
    )}`
  );
}

if (cluster.isPrimary) {
  const cpuCount = 12;
  console.log(`💡 멀티코어 클러스터 시작: ${cpuCount} 워커`);
  for (let i = 0; i < cpuCount; i++) cluster.fork();
} else {
  launcher(cluster.worker.id);
}
