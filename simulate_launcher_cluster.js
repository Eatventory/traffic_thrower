// simulate_launcher_cluster.js - 멀티코어 병렬 고성능 트래픽 발사기 (Cluster)
// 엔드포인트 간단하게 수정

import cluster from "cluster";
import os from "os";
import http from "http";
import { Agent } from "http";

const ENDPOINT = process.argv[2] || "http://localhost:8080/";
const TOTAL_REQUESTS = parseInt(process.argv[3]) || 100000;
const BATCH_SIZE = 150; // 동시 요청 그룹의 크기
const CONCURRENT_BATCHES = 4; // 몇개의 그룹을 보낼지

// 여기서 테스트하고 싶은 API 엔드포인트 목록을 자유롭게 추가/수정
const TARGETS = [
  { method: 'GET', path: '/' },
  { method: 'GET', path: `/users/${Math.floor(Math.random() * 1000) + 1}` },
  // 만약 POST 요청을 테스트하고 싶다면 아래와 같이 추가
  // { method: 'POST', path: '/items', body: JSON.stringify({ name: 'new_item' }) }
];

// 고성능 http 요청을 위한 설정
const httpAgent = new Agent({
  keepAlive: true,
  maxSockets: 1500,
  maxFreeSockets: 1000,
  timeout: 30000,
  freeSocketTimeout: 15000,
});

// TARGETS 배열에서 무작위로 요청 하나를 선택하는 함수
function selectRandomTarget() {
  return TARGETS[Math.floor(Math.random() * TARGETS.length)];
}

// 요청 보내는 함수
function sendOne(retry = 0) {
  return new Promise((resolve) => {
    const target = selectRandomTarget();
    const url = new URL(target.path, ENDPOINT);

    const options = {
      method: target.method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      agent: httpAgent,
      headers: {},
    };

    if (target.body) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(target.body);
    }
    
    const req = http.request(options, (res) => {
      res.on("data", () => {}); // 응답 바디는 사용하지 않고 흘려보냄
      res.on("end", () => {
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      });
    });

    req.on("error", (err) => {
      console.error(`🚨 요청 실패: ${err.code || err.message}`);
      if (retry < 2) {
        setTimeout(() => resolve(sendOne(retry + 1)), 10);
      } else {
        resolve(false);
      }
    });

    if (target.body) {
      req.write(target.body);
    }
    req.end();
  });
}

// BATCH_SIZE 만큼의 요청을 한 묶음으로 보내는 함수
async function sendBatch(size) {
  const promises = Array.from({ length: size }, () => sendOne());
  const results = await Promise.all(promises);
  return results.filter(Boolean).length; // 성공한 요청 수만 반환
}

// --- 5. 워커 프로세스 실행 로직 ---

async function launcher(workerId) {
  const cpuCount = os.cpus().length;
  const perWorker = Math.floor(TOTAL_REQUESTS / cpuCount);
  console.log(`🧵 워커 ${workerId} 시작 | 목표 요청 수: ${perWorker}`);

  let sent = 0, ok = 0;
  const start = Date.now();

  while (sent < perWorker) {
    const batchGroupPromises = [];
    for (let i = 0; i < CONCURRENT_BATCHES && sent < perWorker; i++) {
      const batchSize = Math.min(BATCH_SIZE, perWorker - sent);
      if (batchSize <= 0) break;
      sent += batchSize;
      batchGroupPromises.push(sendBatch(batchSize));
    }
    const results = await Promise.all(batchGroupPromises);
    ok += results.reduce((a, b) => a + b, 0);
    const elapsed = (Date.now() - start) / 1000;
    if (elapsed > 0) {
        console.log(
            `📤 워커 ${workerId} 진행: ${sent}/${perWorker}, 현재 RPS: ${(ok / elapsed).toFixed(0)}`
        );
    }
  }

  const duration = (Date.now() - start) / 1000;
  console.log(
    `🎯 워커 ${workerId} 완료 | 성공: ${ok}, 평균 RPS: ${Math.round(ok / duration)}`
  );
  // 메인 프로세스에 작업 완료 알림
  process.send({ type: 'done', ok, duration });
}

// --- 6. 클러스터 실행 ---

if (cluster.isPrimary) {
  const cpuCount = os.cpus().length;
  console.log(`💡 멀티코어 클러스터 시작: ${cpuCount} 워커 | 목표: ${TOTAL_REQUESTS} 요청`);
  
  let totalOk = 0;
  let completedWorkers = 0;
  const startTime = Date.now();

  for (let i = 0; i < cpuCount; i++) {
    const worker = cluster.fork();
    worker.on('message', (msg) => {
        if (msg.type === 'done') {
            totalOk += msg.ok;
            completedWorkers++;
            if (completedWorkers === cpuCount) {
                const totalDuration = (Date.now() - startTime) / 1000;
                console.log("\n======================================");
                console.log("✅ 모든 워커 작업 완료!");
                console.log(`총 성공 요청: ${totalOk} / ${TOTAL_REQUESTS}`);
                console.log(`총 소요 시간: ${totalDuration.toFixed(2)}초`);
                console.log(`종합 평균 RPS: ${(totalOk / totalDuration).toFixed(0)}`);
                console.log("======================================");
                process.exit(0);
            }
        }
    });
  }
} else {
  launcher(cluster.worker.id);
}
