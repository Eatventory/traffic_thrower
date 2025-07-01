// simulate.js

import fetch from "node-fetch";

const ENDPOINT = "http://3.39.230.90:3000/api/analytics/collect"; // or your public IP
// "http://13.125.232.111:3000/api/analytics/collect"  주영이형
//"http://3.39.230.90:3000/api/analytics/collect". 현재형
const osList = ["Android", "iOS", "Windows", "macOS"];
const genderList = ["male", "female"];
const eventNames = ["auto_click"];

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

// 🧪 N개 요청 보내기
const TOTAL = process.argv[2] || 5;
(async () => {
  for (let i = 0; i < TOTAL; i++) {
    const event = createEvent();
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });

      if (res.ok) {
        console.log(`✅ ${i + 1} / ${TOTAL} 전송 완료`);
      } else {
        console.warn(`❌ ${i + 1} / ${TOTAL} 실패 - ${res.status}`);
      }
    } catch (err) {
      console.error(`🚫 ${i + 1} / ${TOTAL} 오류`, err.message);
    }
  }
})();
