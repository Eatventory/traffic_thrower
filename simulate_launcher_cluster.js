// simulate_launcher_cluster.js - 멀티코어 병렬 고성능 트래픽 발사기 (Cluster)

import cluster from "cluster";
import os from "os";
import http from "http";
import { Agent } from "http";

const ENDPOINT = process.argv[2] || "http://localhost:3000/test";
const TOTAL = parseInt(process.argv[3]) || 100000;
const BATCH_SIZE = 150;
const CONCURRENT_BATCHES = 4;

const osList = ["Android", "iOS", "Windows", "macOS"];
const genderList = ["male", "female"];
const eventNames = ["auto_click"];

const httpAgent = new Agent({
  keepAlive: true,
  maxSockets: 1500,
  maxFreeSockets: 1000,
  timeout: 30000,
  freeSocketTimeout: 15000,
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
  return {
    event_name: random(eventNames),
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
    user_age: Math.floor(Math.random() * 40 + 10),
  };
}

function sendOne(eventData, retry = 0) {
  return new Promise((resolve) => {
    const body = JSON.stringify(eventData);
    const req = http.request(
      ENDPOINT,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        agent: httpAgent,
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
  return results.filter(Boolean).length;
}

async function launcher(workerId) {
  const perWorker = Math.floor(TOTAL / 12);
  console.log(`🧵 워커 ${workerId} 시작 | 요청 수: ${perWorker}`);

  let sent = 0,
    ok = 0;
  const start = Date.now();

  while (sent < perWorker) {
    const batchGroup = [];
    for (let i = 0; i < CONCURRENT_BATCHES && sent < perWorker; i++) {
      const batchSize = Math.min(BATCH_SIZE, perWorker - sent);
      sent += batchSize;
      batchGroup.push(sendBatch(batchSize));
    }
    const results = await Promise.all(batchGroup);
    ok += results.reduce((a, b) => a + b, 0);
    const elapsed = (Date.now() - start) / 1000;
    console.log(
      `📤 워커 ${workerId} 진행: ${sent}/${perWorker}, RPS: ${(
        ok / elapsed
      ).toFixed(0)}`
    );
  }

  const duration = Date.now() - start;
  console.log(
    `🎯 워커 ${workerId} 완료 | 성공률: ${((ok / perWorker) * 100).toFixed(
      2
    )}%, 평균 RPS: ${Math.round(ok / (duration / 1000))}`
  );
}

if (cluster.isPrimary) {
  const cpuCount = 12;
  console.log(`💡 멀티코어 클러스터 시작: ${cpuCount} 워커`);
  for (let i = 0; i < cpuCount; i++) cluster.fork();
} else {
  launcher(cluster.worker.id);
}
