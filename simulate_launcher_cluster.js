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
const eventNames = [
  "page_view",
  "button_click",
  "add_to_cart",
  "purchase",
  "wishlist_add",
];

// ShoppingMall 페이지 경로들
const pagePaths = [
  "/", // 메인 페이지
  "/products", // 상품 목록
  "/products/1", // 상품 상세
  "/products/2",
  "/products/3",
  "/products/4",
  "/products/5",
  "/products/6",
  "/cart", // 장바구니
  "/checkout", // 결제
  "/checkout/success", // 결제 성공
  "/wishlist", // 찜 목록
  "/orders", // 주문 내역
  "/login", // 로그인
  "/register", // 회원가입
];

// ShoppingMall 상품 카테고리
const productCategories = [
  "전자제품",
  "의류",
  "스포츠",
  "홈&리빙",
  "뷰티",
  "도서",
  "식품",
  "가구",
];

// ShoppingMall 상품명들
const productNames = [
  "무선 블루투스 이어폰",
  "스마트폰 케이스",
  "면 티셔츠",
  "운동화",
  "커피머신",
  "요가매트",
  "노트북",
  "스마트워치",
  "헤드폰",
  "태블릿",
  "청바지",
  "후드티",
  "운동복",
  "정장",
  "원피스",
  "가방",
  "신발",
  "커피",
  "차",
  "과일",
  "견과류",
  "화장품",
  "향수",
  "스킨케어",
];

// ShoppingMall 버튼/요소들
const buttonElements = [
  "상품보기",
  "장바구니담기",
  "바로구매",
  "찜하기",
  "리뷰보기",
  "쿠폰받기",
  "회원가입",
  "로그인",
  "결제하기",
  "주문확인",
  "배송조회",
  "환불신청",
  "상품문의",
  "리뷰작성",
  "평점주기",
];

// ShoppingMall 트래픽 소스
const trafficSources = [
  "google",
  "naver",
  "kakao",
  "facebook",
  "instagram",
  "youtube",
  "direct",
];

// ShoppingMall UTM 캠페인
const utmCampaigns = [
  "summer_sale_2024",
  "new_user_welcome",
  "black_friday",
  "christmas_sale",
  "spring_collection",
  "electronics_deal",
  "fashion_week",
  "beauty_campaign",
];

// 클라이언트 풀 (같은 사용자가 여러 세션을 만들도록)
const clientPool = [];
const sessionPool = [];

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

// 클라이언트 풀 초기화 (seededRandom 초기화 후에 실행)
for (let i = 0; i < 1000; i++) {
  clientPool.push(uuid());
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
  const eventName = random(eventNames);

  // 클라이언트 ID 선택 (70% 확률로 기존 클라이언트 재사용)
  const useExistingClient = seededRandom.random() < 0.7;
  const clientId = useExistingClient ? random(clientPool) : uuid();

  // 세션 ID 생성 (같은 클라이언트라도 다른 세션 가능)
  const sessionId = `sess_${Date.now()}_${clientId.slice(0, 6)}`;

  const currentPage = random(pagePaths);
  const trafficSource = random(trafficSources);
  const utmCampaign = random(utmCampaigns);

  // 이벤트별 특별한 속성들
  let properties = {
    page_path: currentPage,
    page_title: getPageTitle(currentPage),
    referrer: getReferrer(trafficSource),
  };

  // 이벤트별 추가 속성
  switch (eventName) {
    case "page_view":
      properties = {
        ...properties,
        page_load_time: seededRandom.randomInt(500, 3000),
        user_agent: getUserAgent(os),
      };
      break;
    case "button_click":
      properties = {
        ...properties,
        button_text: random(buttonElements),
        button_id: `btn_${seededRandom.randomInt(1, 100)}`,
        click_position: {
          x: seededRandom.randomInt(0, 1200),
          y: seededRandom.randomInt(0, 800),
        },
      };
      break;
    case "add_to_cart":
      const productName = random(productNames);
      properties = {
        ...properties,
        product_id: seededRandom.randomInt(1, 1000),
        product_name: productName,
        product_category: random(productCategories),
        product_price: seededRandom.randomInt(10000, 500000),
        quantity: seededRandom.randomInt(1, 5),
        cart_total: seededRandom.randomInt(50000, 1000000),
      };
      break;
    case "purchase":
      properties = {
        ...properties,
        order_id: `ORD_${Date.now()}_${seededRandom.randomInt(1000, 9999)}`,
        total_amount: seededRandom.randomInt(50000, 500000),
        payment_method: random([
          "card",
          "kakao_pay",
          "naver_pay",
          "bank_transfer",
        ]),
        shipping_address: random([
          "서울시 강남구",
          "서울시 서초구",
          "서울시 마포구",
          "부산시 해운대구",
        ]),
        coupon_used: seededRandom.random() > 0.7,
        discount_amount: seededRandom.randomInt(0, 50000),
      };
      break;
    case "wishlist_add":
      properties = {
        ...properties,
        product_id: seededRandom.randomInt(1, 1000),
        product_name: random(productNames),
        product_price: seededRandom.randomInt(10000, 500000),
        wishlist_count: seededRandom.randomInt(1, 20),
      };
      break;
  }

  return {
    event_name: eventName,
    timestamp: formatLocalDateTime(new Date()),
    client_id: clientId,
    // user_id: seededRandom.randomInt(1, 10000),
    user_id: 123456,
    session_id: sessionId,
    device_type: /Android|iOS/.test(os) ? "mobile" : "desktop",
    traffic_medium: getTrafficMedium(trafficSource),
    traffic_source: trafficSource,
    properties: properties,
    context: {
      geo: {
        country: "KR",
        city: random([
          "Seoul",
          "Busan",
          "Incheon",
          "Daegu",
          "Daejeon",
          "Gwangju",
        ]),
        timezone: "Asia/Seoul",
      },
      device: {
        device_type: /Android|iOS/.test(os) ? "mobile" : "desktop",
        os: os,
        browser: getBrowser(os),
        language: "ko-KR",
        timezone: "Asia/Seoul",
      },
      traffic_source: {
        medium: getTrafficMedium(trafficSource),
        source: trafficSource,
        campaign: utmCampaign,
      },
      user_agent: getUserAgent(os),
      screen_resolution: getScreenResolution(os),
      viewport_size: getViewportSize(os),
      utm_params: {
        utm_source: trafficSource,
        utm_medium: getTrafficMedium(trafficSource),
        utm_campaign: utmCampaign,
        utm_content: random(["banner", "text", "image", "video"]),
      },
    },
    user_gender: gender,
    user_age: seededRandom.randomInt(18, 65),
  };
}

// 헬퍼 함수들
function getPageTitle(pagePath) {
  const titles = {
    "/": "JUNGLE SHOP - 네이비+민트 감성의 마켓플레이스",
    "/products": "상품 목록 - JUNGLE SHOP",
    "/cart": "장바구니 - JUNGLE SHOP",
    "/checkout": "결제 - JUNGLE SHOP",
    "/checkout/success": "주문 완료 - JUNGLE SHOP",
    "/wishlist": "찜 목록 - JUNGLE SHOP",
    "/orders": "주문 내역 - JUNGLE SHOP",
    "/login": "로그인 - JUNGLE SHOP",
    "/register": "회원가입 - JUNGLE SHOP",
  };
  return titles[pagePath] || "JUNGLE SHOP";
}

function getReferrer(trafficSource) {
  const referrers = {
    google: "https://www.google.com/",
    naver: "https://search.naver.com/",
    kakao: "https://search.kakao.com/",
    facebook: "https://www.facebook.com/",
    instagram: "https://www.instagram.com/",
    youtube: "https://www.youtube.com/",
    direct: "",
  };
  return referrers[trafficSource] || "";
}

function getTrafficMedium(source) {
  const mediums = {
    google: "organic",
    naver: "organic",
    kakao: "organic",
    facebook: "social",
    instagram: "social",
    youtube: "social",
    direct: "direct",
  };
  return mediums[source] || "direct";
}

function getBrowser(os) {
  const browsers = ["Chrome", "Safari", "Firefox", "Edge"];
  return random(browsers);
}

function getUserAgent(os) {
  const userAgents = {
    Windows:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    macOS:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Android:
      "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    iOS: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1.2 Mobile/15E148 Safari/604.1",
  };
  return userAgents[os] || userAgents["Windows"];
}

function getScreenResolution(os) {
  const resolutions = {
    Windows: ["1920x1080", "2560x1440", "1366x768"],
    macOS: ["2560x1600", "1920x1200", "1440x900"],
    Android: ["1080x2400", "720x1600", "1440x3200"],
    iOS: ["1170x2532", "1125x2436", "828x1792"],
  };
  return random(resolutions[os] || resolutions["Windows"]);
}

function getViewportSize(os) {
  const viewports = {
    Windows: ["1200x800", "1600x900", "1024x768"],
    macOS: ["1600x1000", "1200x750", "900x600"],
    Android: ["360x800", "412x915", "384x854"],
    iOS: ["390x844", "375x812", "414x896"],
  };
  return random(viewports[os] || viewports["Windows"]);
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
