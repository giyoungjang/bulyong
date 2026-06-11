/* 불용재고 바코드 입력 앱 */
(function () {
  "use strict";

  // ---------- 데이터 ----------
  var DATA = window.PRODUCT_DATA || { cols: [], rows: [], index: {} };
  var COL = {};
  DATA.cols.forEach(function (c, i) { COL[c] = i; });
  var BLUE = window.BLUE_CODES || {}; // 청색 출력명 표준코드 집합

  function lookup(barcode) {
    var bc = String(barcode || "").replace(/\s+/g, "").trim();
    if (!bc) return null;
    var idx = DATA.index[bc];
    if (idx === undefined || idx === null) return null;
    var row = DATA.rows[idx];
    var rec = { _raw: bc };
    DATA.cols.forEach(function (c, i) { rec[c] = row[i]; });
    return rec;
  }

  // 13/14자리, 앞 0 보정 등 여러 형태로 조회 시도
  function lookupSmart(code) {
    var c = String(code == null ? "" : code).replace(/\D/g, "");
    if (!c) return null;
    var tries = [c];
    if (c.length >= 13) tries.push(c.slice(-13));   // GTIN-14 -> EAN-13
    if (c.length === 13) tries.push("0" + c);
    for (var k = 0; k < tries.length; k++) {
      var idx = DATA.index[tries[k]];
      if (idx !== undefined && idx !== null) return { bc: tries[k], rec: lookup(tries[k]) };
    }
    return null;
  }

  // 의약품 2D(DataMatrix/QR) GS1 코드 파싱: (01)GTIN (17)유효기간 (10)로트 (21)일련번호
  // 구분자(FNC1)가 없는 코드도 처리: 가변필드는 다음 날짜AI(유효한 날짜)에서 끊음
  var GS_FIXEDLEN = { "00": 18, "01": 14, "02": 14, "11": 6, "12": 6, "13": 6, "15": 6, "16": 6, "17": 6, "20": 2 };
  var GS_DATEAI = { "11": 1, "12": 1, "13": 1, "15": 1, "16": 1, "17": 1 };
  var GS_KNOWN = { "00": 1, "01": 1, "02": 1, "10": 1, "11": 1, "12": 1, "13": 1, "15": 1, "16": 1, "17": 1, "20": 1, "21": 1, "22": 1, "30": 1, "37": 1, "90": 1, "91": 1, "92": 1, "93": 1, "99": 1 };
  function gsValidDate(d) {
    if (!/^\d{6}$/.test(d || "")) return false;
    var mm = +d.substr(2, 2), dd = +d.substr(4, 2);
    return mm >= 1 && mm <= 12 && dd >= 0 && dd <= 31;
  }
  function parseGS1(raw) {
    if (raw == null) return null;
    var GS = String.fromCharCode(29);
    var s = String(raw).replace(/^\][A-Za-z0-9]{2}/, "");     // ]d2 / ]Q1 등 심볼로지 식별자 제거
    var out = {}, i = 0, guard = 0;
    if (/^\d{2}/.test(s)) {
      while (i < s.length && guard++ < 80) {
        if (s.charAt(i) === GS) { i++; continue; }
        var ai = s.substr(i, 2);
        if (!GS_KNOWN[ai]) break;
        if (GS_FIXEDLEN[ai] !== undefined) {
          out[ai] = s.substr(i + 2, GS_FIXEDLEN[ai]);
          i += 2 + GS_FIXEDLEN[ai];
        } else { // 가변길이(10,21,...)
          var st = i + 2, j = st, end = -1;
          while (j < s.length) {
            if (s.charAt(j) === GS) { end = j; break; }
            var a2 = s.substr(j, 2);
            if (j > st && GS_DATEAI[a2] && gsValidDate(s.substr(j + 2, 6))) { end = j; break; }
            j++;
          }
          if (end < 0) end = s.length;
          out[ai] = s.substring(st, end);
          i = (end < s.length && s.charAt(end) === GS) ? end + 1 : end;
          if (end >= s.length) break;
        }
      }
    }
    var gtin = out["01"], exp = out["17"], lot = out["10"], ser = out["21"];
    // 폴백: 괄호( (01).. )·공백·구분자 제거 후 정규식으로 GTIN/유효기간 직접 추출
    if (gtin === undefined || exp === undefined) {
      var clean = s.replace(/\D/g, ""); // 구분자·괄호·제어문자 무엇이든 제거, 숫자만
      if (gtin === undefined) {
        if (/^01\d{14}/.test(clean)) gtin = clean.substr(2, 14);
        else { var mg = /01(\d{14})/.exec(clean); if (mg) gtin = mg[1]; }
      }
      if (exp === undefined) {
        var re = /17(\d{6})/g, mm;
        while ((mm = re.exec(clean))) { if (gsValidDate(mm[1])) { exp = mm[1]; break; } }
      }
    }
    if (gtin === undefined) return null;
    var res = { gtin: gtin, lot: lot, serial: ser };
    if (exp && gsValidDate(exp)) {
      var dd = exp.substr(4, 2);
      res.expiry = "20" + exp.substr(0, 2) + "-" + exp.substr(2, 2) + "-" + (dd === "00" ? "01" : dd);
    }
    return res;
  }

  var APP_VERSION = "v18";
  var badge = document.getElementById("dataBadge");
  badge.textContent = DATA.rows.length.toLocaleString() + "품목 · " + APP_VERSION;

  // ---------- 상태 (localStorage) ----------
  var LSK = "bulyong_items_v1";
  var LSS = "bulyong_settings_v1";
  var items = load(LSK, []);
  var settings = load(LSS, {});

  function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function save() { localStorage.setItem(LSK, JSON.stringify(items)); }
  function saveSettings() { localStorage.setItem(LSS, JSON.stringify(settings)); }

  // 설정 입력 바인딩
  var setMap = { setWorker: "worker", setDate: "date", setPharm: "pharm", setClient: "client" };
  Object.keys(setMap).forEach(function (id) {
    var el = document.getElementById(id);
    var key = setMap[id];
    if (settings[key]) el.value = settings[key];
    el.addEventListener("input", function () { settings[key] = el.value; saveSettings(); });
  });
  if (!settings.date) {
    var t = new Date();
    var ds = t.getFullYear() + "-" + pad(t.getMonth() + 1) + "-" + pad(t.getDate());
    document.getElementById("setDate").value = ds;
    settings.date = ds; saveSettings();
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // ---------- 유효기간 판정 ----------
  function expiryStatus(ym) { // ym = "YYYY-MM"
    if (!ym) return "empty";
    var m = /^(\d{4})-(\d{2})/.exec(ym);
    if (!m) return "empty";
    var v = parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
    if (v >= 202001 && v <= 202606) return "ok";
    return "bad";
  }

  // 유효기간을 엑셀/표시용 "YYYY.MM.DD" 형식으로 (일이 없으면 01)
  function fmtExp(e) {
    if (!e) return "";
    var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(e);
    if (!m) return e;
    return m[1] + "." + m[2] + "." + (m[3] || "01");
  }

  // ---------- 화면 요소 ----------
  var resultBox = document.getElementById("resultBox");
  var listEl = document.getElementById("list");
  var emptyHint = document.getElementById("emptyHint");
  var toastEl = document.getElementById("toast");
  var pending = null; // 현재 조회된 품목 {rec}

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.remove("show"); }, 1600);
  }

  function beep(ok) {
    try {
      var ac = beep._ac || (beep._ac = new (window.AudioContext || window.webkitAudioContext)());
      var o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.frequency.value = ok ? 880 : 220;
      g.gain.value = 0.08;
      o.start(); o.stop(ac.currentTime + (ok ? 0.09 : 0.22));
    } catch (e) {}
  }

  // ---------- 조회 결과 표시 ----------
  function showResult(barcode) {
    pending = null;
    // 2D(DataMatrix) GS1 코드면 GTIN/유효기간 추출, 아니면 그대로 바코드로 사용
    var g = parseGS1(barcode);
    var codeForLookup = g && g.gtin ? g.gtin : barcode;
    var autoExp = g && g.expiry ? g.expiry : "";
    var match = lookupSmart(codeForLookup);
    var shownCode = String(codeForLookup).replace(/\D/g, "") || String(barcode);

    if (!match) {
      beep(false);
      if (navigator.vibrate) navigator.vibrate(200);
      resultBox.innerHTML =
        '<div class="result no"><div class="tag">✕ 받지 않는 품목</div>' +
        '<div class="name">파일에 없는 제품입니다</div>' +
        '<div class="sub">이 바코드는 받는 품목 목록에 없습니다.</div>' +
        '<div class="code">조회코드: ' + esc(shownCode) + '</div>' +
        '<div class="code" style="font-size:11px;word-break:break-all;opacity:.8">스캔원문(' + String(barcode).length + '자): ' + esc(String(barcode)) + '</div>' +
        '</div>';
      return;
    }
    beep(true);
    if (navigator.vibrate) navigator.vibrate(60);
    renderMatch(match.rec, { autoExp: autoExp });
  }

  // 받는 품목 카드 렌더(수량·유효기간 입력) — 스캔/검색/수정 공용
  // opts: { autoExp:"YYYY-MM-DD", editIdx:번호(수정시), qty:기존수량 }
  function renderMatch(rec, opts) {
    opts = opts || {};
    var editIdx = (opts.editIdx == null) ? null : opts.editIdx;
    var editing = editIdx != null;
    pending = rec;
    var name = rec["출 력 명"] || rec["제품명"] || "(이름없음)";
    var price = rec["기준단가"] ? (Number(rec["기준단가"]).toLocaleString() + "원") : "-";
    resultBox.innerHTML =
      '<div class="result ok"><div class="tag">' + (editing ? "✏ 항목 수정" : "✓ 받는 품목") + '</div>' +
      '<div class="name">' + esc(name) + '</div>' +
      '<div class="sub">' + esc(rec["규  격"] || "") + ' · ' + esc(rec["제 조 사"] || "") + ' · 단가 ' + price + '</div>' +
      '<div class="code">' + esc(rec["표준코드"]) + '</div>' +
      '<div class="fields">' +
        '<label>소분수량<input id="inQty" type="number" inputmode="numeric" min="1" placeholder="수량 입력"></label>' +
        '<label>유효기간<input id="inExp" type="text" inputmode="numeric" placeholder="예: 27.02.01"></label>' +
      '</div>' +
      '<div class="warnmsg hide" id="expWarn">⚠ 유효기간이 2020~2026.06 범위를 벗어납니다. 받지 않는 제품일 수 있어요.</div>' +
      '<button class="addbtn" id="btnAdd">' + (editing ? "✔ 수정 저장" : "＋ 목록에 추가") + '</button>' +
      '</div>';

    var inQty = document.getElementById("inQty");
    var inExp = document.getElementById("inExp");
    var warn = document.getElementById("expWarn");

    function expVal() { return parseExpText(inExp.value); }
    function refreshExp() {
      var bad = expiryStatus(expVal()) === "bad";
      inExp.classList.toggle("warn", bad);
      warn.classList.toggle("hide", !bad);
    }
    inExp.addEventListener("input", refreshExp);

    function commit() { addItem(rec, inQty.value, expVal(), editIdx); }
    document.getElementById("btnAdd").addEventListener("click", commit);
    inQty.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); inExp.focus(); } // 수량 → 유효기간으로
    });
    inExp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
    });
    inQty.addEventListener("focus", function () { inQty.select(); });
    inExp.addEventListener("focus", function () { inExp.select(); });

    // 유효기간 미리 채우기(2D코드 자동 / 수정 시 기존값) → "YY.MM.DD"
    if (opts.autoExp) {
      inExp.value = toExpText(opts.autoExp);
      refreshExp();
      if (!editing && inExp.value) toast("유효기간 자동입력: " + fmtExp(opts.autoExp));
    }
    if (opts.qty != null) inQty.value = opts.qty;
    inQty.focus();
  }

  // "27.02.01"·"2027.2.1"·"270201" 등 → "YYYY-MM-DD" (일 없으면 01)
  function parseExpText(s) {
    s = String(s == null ? "" : s).trim();
    if (!s) return "";
    var m = /^(\d{2}|\d{4})[.\-/ ](\d{1,2})(?:[.\-/ ](\d{1,2}))?$/.exec(s);
    if (!m) {
      var only = s.replace(/\D/g, "");
      if (only.length === 6) m = [s, only.slice(0, 2), only.slice(2, 4), only.slice(4, 6)];
      else if (only.length === 8) m = [s, only.slice(0, 4), only.slice(4, 6), only.slice(6, 8)];
      else return "";
    }
    var y = m[1].length === 2 ? "20" + m[1] : m[1];
    var mo = ("0" + m[2]).slice(-2);
    var da = m[3] ? ("0" + m[3]).slice(-2) : "01";
    return y + "-" + mo + "-" + da;
  }

  // "YYYY-MM-DD" → 입력창 표시용 "YY.MM.DD"
  function toExpText(iso) {
    var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(iso || ""));
    if (!m) return "";
    return m[1].slice(2) + "." + m[2] + "." + (m[3] || "01");
  }

  function addItem(rec, qtyRaw, exp, editIdx) {
    var qty = parseInt(qtyRaw, 10);
    if (!qty || qty < 1) { toast("수량을 입력하세요"); return; }
    var bc = rec["표준코드"];
    if (editIdx != null && items[editIdx]) {
      // 수정: 해당 항목의 수량·유효기간만 갱신
      items[editIdx].qty = qty;
      items[editIdx].exp = exp || "";
      toast("수정되었습니다");
    } else {
      // 같은 바코드+유효기간이면 수량 합산
      var found = null;
      for (var i = 0; i < items.length; i++) {
        if (items[i].barcode === bc && (items[i].exp || "") === (exp || "")) { found = items[i]; break; }
      }
      if (found) {
        found.qty += qty;
        toast("기존 항목에 합산 (+" + qty + ")");
      } else {
        var rowdata = {};
        DATA.cols.forEach(function (c) { rowdata[c] = rec[c]; });
        items.push({ barcode: bc, qty: qty, exp: exp || "", data: rowdata });
        toast("추가됨");
      }
    }
    save();
    render();
    resultBox.innerHTML = "";
    pending = null;
    var mi = document.getElementById("manualInput"); if (mi) mi.value = "";
  }

  // 목록 항목 클릭 → 수정 카드 열기
  function editItem(i) {
    var it = items[i];
    if (!it) return;
    renderMatch(it.data || {}, { autoExp: it.exp, editIdx: i, qty: it.qty });
    resultBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------- 목록 렌더 ----------
  function render() {
    listEl.innerHTML = "";
    emptyHint.classList.toggle("hide", items.length > 0);
    var totAmount = 0;
    items.forEach(function (it, i) {
      var d = it.data || {};
      totAmount += it.qty * num(d["기준단가"]);
      var name = d["출 력 명"] || d["제품명"] || it.barcode;
      var st = expiryStatus(it.exp);
      var expTxt = it.exp ? fmtExp(it.exp) : "유효기간 미입력";
      var badClass = (st === "bad" || st === "empty") ? " bad" : "";
      var div = document.createElement("div");
      div.className = "item";
      div.innerHTML =
        '<div class="seq">' + (i + 1) + '</div>' +
        '<div class="info" title="클릭하면 수량·유효기간 수정"><div class="t">' + esc(name) + '</div>' +
        '<div class="d">' + esc(d["규  격"] || "") + ' · ' + esc(it.barcode) + '</div>' +
        '<div class="d' + badClass + '">유효기간 ' + esc(expTxt) + (st === "bad" ? " (범위밖)" : "") + ' ✏</div></div>' +
        '<div class="qty">' + it.qty + '</div>' +
        '<button class="x" data-i="' + i + '">✕</button>';
      div.querySelector(".info").addEventListener("click", function () { editItem(i); });
      div.querySelector(".x").addEventListener("click", function () {
        if (confirm("삭제할까요?\n" + name)) { items.splice(i, 1); save(); render(); }
      });
      listEl.appendChild(div);
    });
    document.getElementById("totAmount").textContent = Math.round(totAmount).toLocaleString();
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // ---------- 수동 입력 / 스캐너건 ----------
  var manualInput = document.getElementById("manualInput");
  document.getElementById("btnManual").addEventListener("click", function () { showResult(manualInput.value); });
  manualInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); showResult(manualInput.value); }
  });

  // ---------- 제품명 검색 (바코드 없는 경우) ----------
  var searchInput = document.getElementById("searchInput");
  var searchResults = document.getElementById("searchResults");
  var CI_NAME = COL["출 력 명"], CI_PNAME = COL["제품명"], CI_SPEC = COL["규  격"],
      CI_MAKER = COL["제 조 사"], CI_STD = COL["표준코드"];

  function searchProducts(q) {
    q = String(q || "").trim();
    if (q.length < 1) return [];
    var terms = q.split(/\s+/);
    var rows = DATA.rows, out = [];
    for (var i = 0; i < rows.length && out.length < 40; i++) {
      var row = rows[i];
      var hay = (row[CI_NAME] || "") + " " + (row[CI_PNAME] || "") + " " +
                (row[CI_SPEC] || "") + " " + (row[CI_MAKER] || "");
      var ok = true;
      for (var t = 0; t < terms.length; t++) {
        if (hay.indexOf(terms[t]) < 0) { ok = false; break; }
      }
      if (ok) out.push(i);
    }
    return out;
  }

  function recFromRow(idx) {
    var row = DATA.rows[idx], rec = {};
    DATA.cols.forEach(function (c, i) { rec[c] = row[i]; });
    return rec;
  }

  function runSearch() {
    var q = String(searchInput.value || "").trim();
    if (q.length < 1) { searchResults.innerHTML = ""; return; }
    var hits = searchProducts(q);
    if (!hits.length) {
      searchResults.innerHTML = '<div class="srempty">검색 결과가 없습니다. (이름·규격·제조사로 검색)</div>';
      return;
    }
    var html = "";
    hits.forEach(function (idx) {
      var row = DATA.rows[idx];
      var nm = row[CI_NAME] || row[CI_PNAME] || "(이름없음)";
      var sub = (row[CI_SPEC] || "") + " · " + (row[CI_MAKER] || "");
      html += '<div class="srrow" data-idx="' + idx + '">' +
              '<div class="srname">' + esc(nm) + '</div>' +
              '<div class="srsub">' + esc(sub) + '</div></div>';
    });
    searchResults.innerHTML = html;
    Array.prototype.forEach.call(searchResults.querySelectorAll(".srrow"), function (el) {
      el.addEventListener("click", function () {
        var idx = parseInt(el.getAttribute("data-idx"), 10);
        searchResults.innerHTML = "";
        searchInput.value = "";
        beep(true);
        renderMatch(recFromRow(idx), "");
        resultBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    });
  }

  if (searchInput) {
    var srTimer = null;
    searchInput.addEventListener("input", function () {
      clearTimeout(srTimer);
      srTimer = setTimeout(runSearch, 200);
    });
    searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); clearTimeout(srTimer); runSearch(); }
    });
    var btnSearch = document.getElementById("btnSearch");
    if (btnSearch) btnSearch.addEventListener("click", runSearch);
  }

  // ---------- 카메라 스캔 ----------
  var scanner = null, scanning = false, lastCode = "", lastTime = 0;
  var btnScan = document.getElementById("btnScan");
  var readerEl = document.getElementById("reader");

  btnScan.addEventListener("click", function () {
    if (scanning) { stopScan(); } else { startScan(); }
  });

  function startScan() {
    if (!window.Html5Qrcode) { toast("스캐너 로딩 실패 (인터넷 확인)"); return; }
    readerEl.classList.remove("hide");
    scanner = new Html5Qrcode("reader", {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.DATA_MATRIX,  // 의약품 일련번호 2D코드
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.AZTEC,
        Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.ITF
      ],
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      verbose: false
    });
    var config = {
      fps: 10,
      // 2D(네모) 코드와 1D 바코드 모두 잡히도록 큰 정사각 인식영역
      qrbox: function (w, h) {
        var s = Math.floor(Math.min(w, h) * 0.75);
        return { width: Math.max(180, Math.min(s, 300)), height: Math.max(180, Math.min(s, 300)) };
      },
      aspectRatio: 1.0
    };
    scanner.start({ facingMode: "environment" }, config, onScan, function () {})
      .then(function () { scanning = true; btnScan.textContent = "■ 스캔 중지"; btnScan.classList.add("sec"); })
      .catch(function (err) {
        toast("카메라를 열 수 없습니다");
        readerEl.classList.add("hide");
        console.error(err);
      });
  }

  function stopScan() {
    if (scanner) {
      scanner.stop().then(function () { scanner.clear(); }).catch(function () {});
    }
    scanning = false;
    readerEl.classList.add("hide");
    btnScan.textContent = "📷 카메라 스캔 시작";
    btnScan.classList.remove("sec");
  }

  function onScan(text) {
    var now = Date.now();
    if (text === lastCode && now - lastTime < 2500) return; // 같은 코드 연속 무시
    lastCode = text; lastTime = now;
    showResult(text);
    resultBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------- 전체 비우기 ----------
  document.getElementById("btnClear").addEventListener("click", function () {
    if (!items.length) return;
    if (confirm("입력한 " + items.length + "품목을 모두 지울까요?")) { items = []; save(); render(); }
  });

  // ---------- 엑셀 내보내기 (시트1 양식) ----------
  document.getElementById("btnExport").addEventListener("click", exportXlsx);

  function num(v) { var n = Number(String(v).replace(/,/g, "")); return isFinite(n) ? n : 0; }

  // base64 -> ArrayBuffer
  function b64ToBuf(b64) {
    var bin = atob(b64), len = bin.length, bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  function downloadBlob(blob, fname) {
    var a = document.createElement("a"), url = URL.createObjectURL(blob);
    a.href = url; a.download = fname; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
  }
  // 파일명: 담당자.약국.거래처코드.작업일자 (빈 항목은 건너뜀)
  function buildFilename() {
    function clean(x) { return String(x == null ? "" : x).replace(/[\/:*?"<>|.]+/g, " ").replace(/\s+/g, " ").trim(); }
    var parts = [clean(settings.worker), clean(settings.pharm), clean(settings.client), clean(settings.date)]
      .filter(function (x) { return x; });
    return (parts.join(".") || "불용재고") + ".xlsx";
  }
  var MARK_RGB = "FF254771"; // 표시 대상 행 글씨색
  // 표시 글씨 스타일(원본 서식 복제 후 굵게 + 지정색)
  function cloneBlue(st) {
    var s = st ? JSON.parse(JSON.stringify(st)) : {};
    s.font = Object.assign({}, s.font || {}, { bold: true, color: { argb: MARK_RGB } });
    return s;
  }

  // 원본 양식의 정확한 열 너비(엑셀 문자단위). ExcelJS가 일부 너비를 떨어뜨려도 강제로 맞춤
  var COLW = {
    s1: [5.89, 6.89, 8.78, 9.22, 22.55, 5.78, 8.22, 9.89, 11.44, 9.22, 11.0, 7.22, 9.0, 7.78, 9.55, 8.33, 9.22, 26.22, 8.33, 5.44, 8.78, 8.33, 8.33, 8.89, 14.0, 6.78, 7.0],
    s2: [4.11, 5.33, 9.78, 17.22, 25.66, 6.33, 6.22, 8.11, 11.44, 9.33, 10.11, 0, 0, 8, 16.33, 10.22, 8.89, 8, 8, 8, 8, 4.78, 4.33, 8, 8, 8],
    s3: [7.33, 15.33, 7.33, 10.78, 1.55, 1.78, 7.33, 15.33, 7.33, 10.78]
  };
  function applyColWidths(ws, arr) {
    for (var i = 0; i < arr.length; i++) {
      var w = arr[i];
      if (w == null) continue;            // 기본값 유지
      var col = ws.getColumn(i + 1);
      if (w === 0) { col.hidden = true; col.width = 8.43; } // 숨김열
      else { col.width = w; col.hidden = false; }
    }
  }

  // 엑셀 유효기간 표기 "YYYY-MM-DD" (일 없으면 01)
  function excelExp(e) {
    var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(e || ""));
    if (!m) return "";
    return m[1] + "-" + m[2] + "-" + (m[3] || "01");
  }

  // 시트1(상세) 행값 — 27열. 8열(금액)은 수식 별도 처리
  function rowValues(it, idx) {
    var d = it.data || {};
    return {
      1: idx + 1, 2: d["제품코드"] || "", 3: d["제 조 사"] || "", 4: d["발  주  처"] || "",
      5: d["출 력 명"] || "", 6: d["규  격"] || "", 7: it.qty, 9: excelExp(it.exp),
      10: settings.client || "", 11: settings.pharm || "", 12: settings.worker || "", 13: settings.date || "",
      14: num(d["기준단가"]), 15: d["거래처도매"] || "", 16: d["기준가격×계산단위"] || "", 17: d["보험코드"] || "",
      18: d["제품명"] || "", 19: d["제품구분"] || "", 20: d["단위"] || "", 21: d["성분분류"] || "",
      22: d["제형구분"] || "", 23: d["제품그룹"] || "", 24: d["성 분"] || "", 25: d["표준코드"] || "",
      26: d["신고계산단위"] || "", 27: d["비고"] || ""
    };
  }

  // 시트2(32품목 스티커) 행값 — 26열. 8열(금액)은 수식 별도 처리
  function rowValues2(it, idx) {
    var d = it.data || {};
    return {
      1: idx + 1, 2: d["제품코드"] || "", 3: d["제 조 사"] || "", 4: d["발  주  처"] || "",
      5: d["출 력 명"] || "", 6: d["규  격"] || "", 7: it.qty, 9: excelExp(it.exp),
      10: settings.client || "", 11: settings.pharm || "", 12: settings.worker || "", 13: settings.date || "",
      14: num(d["기준단가"]), 15: d["거래처도매"] || "", 16: d["기준가격×계산단위"] || "", 17: d["보험코드"] || "",
      18: d["제품명"] || "", 19: d["제품구분"] || "", 20: d["단위"] || "", 21: d["성분분류"] || "",
      22: d["제형구분"] || "", 23: d["제품그룹"] || "", 24: d["성 분"] || "", 25: d["신고계산단위"] || "",
      26: d["표준코드"] || ""
    };
  }

  // 시트1 채우기 (10행부터, 27열). 표시 대상이면 행 전체 굵게+색상
  function fillSheet1(ws) {
    var DR = 10, sample = ws.getRow(DR), styles = [], blues = [], h = sample.height, c;
    for (c = 1; c <= 27; c++) { styles[c] = sample.getCell(c).style; blues[c] = cloneBlue(styles[c]); }
    items.forEach(function (it, idx) {
      var r = DR + idx, row = ws.getRow(r), vals = rowValues(it, idx), isBlue = !!BLUE[it.barcode];
      for (var c = 1; c <= 27; c++) {
        var cell = row.getCell(c);
        if (c === 8) cell.value = { formula: "G" + r + "*N" + r };
        else cell.value = (vals[c] === undefined || vals[c] === "") ? null : vals[c];
        cell.style = isBlue ? blues[c] : styles[c];
      }
      if (h) row.height = h;
    });
  }

  // 시트2 채우기 — 2행부터 값 채움. 표시 대상이면 행 전체 굵게+색상. 남는 원본 행(빈칸)은 삭제
  function fillSheet2(ws) {
    var DR = 2, LAST = 33, sample = ws.getRow(DR), styles = [], blues = [], h = sample.height, c;
    for (c = 1; c <= 26; c++) { styles[c] = sample.getCell(c).style; blues[c] = cloneBlue(styles[c]); }
    var n = items.length;
    items.forEach(function (it, i) {
      var r = DR + i, row = ws.getRow(r), vals = rowValues2(it, i), isBlue = !!BLUE[it.barcode];
      for (var c = 1; c <= 26; c++) {
        var cell = row.getCell(c);
        if (c === 8) cell.value = { formula: "G" + r + "*N" + r };
        else cell.value = (vals[c] === undefined || vals[c] === "") ? null : vals[c];
        cell.style = isBlue ? blues[c] : styles[c];
      }
      if (h) row.height = h;
    });
    // 원본 샘플 행이 데이터보다 많으면 남는 빈 행 삭제
    if (n < LAST - DR + 1) ws.spliceRows(DR + n, (LAST - DR + 1) - n);
  }

  // 시트3 스티커 — 원본 양식(셀크기·테두리·페이지나눔) 그대로. 32개 슬롯에 값만 채움/비움
  // 슬롯 순서 = 시트2 행순서(2~33). 블록 16개(좌·우 2장), 페이지당 8블록
  var STK_TOPS = [1, 8, 15, 22, 29, 36, 43, 50, 58, 65, 72, 79, 86, 93, 100, 107];
  function stkPos(s) { // 슬롯 s(0~31) -> {top, bc(1=좌,7=우)}
    var page = s < 16 ? 0 : 1, ps = s % 16, right = ps >= 8;
    return { top: STK_TOPS[page * 8 + (ps % 8)], bc: right ? 7 : 1 };
  }
  function fillSheet3(ws) {
    function setVal(top, bc, rr, cofs, val) {
      ws.getCell(top + rr, bc + cofs).value = (val === "" || val == null) ? null : val;
    }
    for (var s = 0; s < 32; s++) {
      var p = stkPos(s), it = items[s];
      if (!it) { // 빈 슬롯: 스티커 전체(6행×4열) 비우고 테두리·라벨 제거 → 빈칸 자체를 없앰
        for (var rr = 0; rr < 6; rr++) {
          for (var co = 0; co < 4; co++) {
            var ce = ws.getCell(p.top + rr, p.bc + co);
            ce.value = null; ce.style = {};
          }
        }
        continue;
      }
      var d = it.data || {}, qty = it.qty, price = num(d["기준단가"]);
      setVal(p.top, p.bc, 0, 3, d["제품코드"] || "");                  // 분류번호
      setVal(p.top, p.bc, 1, 1, d["출 력 명"] || d["제품명"] || "");    // 약품명
      setVal(p.top, p.bc, 1, 3, price || "");                          // 단가
      setVal(p.top, p.bc, 2, 1, d["발  주  처"] || d["제 조 사"] || ""); // 제약회사
      setVal(p.top, p.bc, 2, 3, (qty * price) || "");                  // 반품금액
      setVal(p.top, p.bc, 3, 1, settings.client || "");                // 거래처
      setVal(p.top, p.bc, 3, 3, settings.pharm || "");                 // 약국명
      setVal(p.top, p.bc, 4, 1, excelExp(it.exp));                      // 유효기간
      setVal(p.top, p.bc, 5, 1, qty);                                  // 반품수량
      // 표시 대상이면 스티커 전체 굵게+색상
      if (BLUE[it.barcode]) {
        for (var rr = 0; rr < 6; rr++) for (var co = 0; co < 4; co++) {
          var cc = ws.getCell(p.top + rr, p.bc + co);
          cc.style = cloneBlue(cc.style);
        }
      }
    }
  }

  // 원본 3개 시트(상세/스티커목록/스티커) 양식에 데이터를 채워 한 엑셀로 내보내기
  function exportXlsx() {
    if (!items.length) { toast("입력된 품목이 없습니다"); return; }
    if (!window.ExcelJS || !window.TEMPLATE_B64) { toast("엑셀 모듈 로딩 실패 (인터넷 확인)"); return; }
    toast("엑셀 만드는 중…");
    var wb = new ExcelJS.Workbook();
    wb.xlsx.load(b64ToBuf(window.TEMPLATE_B64)).then(function () {
      fillSheet1(wb.worksheets[0]);
      fillSheet2(wb.worksheets[1]);
      fillSheet3(wb.worksheets[2]);
      applyColWidths(wb.worksheets[0], COLW.s1);
      applyColWidths(wb.worksheets[1], COLW.s2);
      applyColWidths(wb.worksheets[2], COLW.s3);
      return wb.xlsx.writeBuffer();
    }).then(function (buf) {
      var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      var fname = buildFilename();
      downloadBlob(blob, fname);
      toast(items.length > 32 ? "엑셀 저장(스티커는 32개까지): " + fname : "엑셀 저장: " + fname);
    }).catch(function (e) { toast("엑셀 생성 오류"); console.error(e); });
  }

  // ---------- 시작 ----------
  render();

  // PWA 서비스워커 (새 버전 배포 시 자동 갱신)
  if ("serviceWorker" in navigator) {
    var refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (refreshing) return; refreshing = true; location.reload();
    });
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(function (reg) {
      reg.update();
      reg.addEventListener("updatefound", function () {
        var nw = reg.installing;
        if (nw) nw.addEventListener("statechange", function () {
          if (nw.state === "installed" && navigator.serviceWorker.controller) toast("새 버전으로 갱신 중…");
        });
      });
    }).catch(function () {});
  }
})();
