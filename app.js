/* 불용재고 바코드 입력 앱 */
(function () {
  "use strict";

  // ---------- 데이터 ----------
  var DATA = window.PRODUCT_DATA || { cols: [], rows: [], index: {} };
  var COL = {};
  DATA.cols.forEach(function (c, i) { COL[c] = i; });

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

  var APP_VERSION = "v7";
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
    var rec = match.rec;
    beep(true);
    if (navigator.vibrate) navigator.vibrate(60);
    pending = rec;
    var name = rec["출 력 명"] || rec["제품명"] || "(이름없음)";
    var price = rec["기준단가"] ? (Number(rec["기준단가"]).toLocaleString() + "원") : "-";
    resultBox.innerHTML =
      '<div class="result ok"><div class="tag">✓ 받는 품목</div>' +
      '<div class="name">' + esc(name) + '</div>' +
      '<div class="sub">' + esc(rec["규  격"] || "") + ' · ' + esc(rec["제 조 사"] || "") + ' · 단가 ' + price + '</div>' +
      '<div class="code">' + esc(rec["표준코드"]) + '</div>' +
      '<div class="fields">' +
        '<label>소분수량<input id="inQty" type="number" inputmode="numeric" min="1" value="1"></label>' +
        '<label>유효기간<input id="inExp" type="date"></label>' +
      '</div>' +
      '<div class="warnmsg hide" id="expWarn">⚠ 유효기간이 2020~2026.06 범위를 벗어납니다. 받지 않는 제품일 수 있어요.</div>' +
      '<button class="addbtn" id="btnAdd">＋ 목록에 추가</button>' +
      '</div>';

    var inExp = document.getElementById("inExp");
    var inQty = document.getElementById("inQty");
    var warn = document.getElementById("expWarn");
    inExp.addEventListener("input", function () {
      var st = expiryStatus(inExp.value);
      inExp.classList.toggle("warn", st === "bad");
      warn.classList.toggle("hide", st !== "bad");
    });
    document.getElementById("btnAdd").addEventListener("click", function () {
      addItem(rec, inQty.value, inExp.value);
    });
    // 2D코드에서 유효기간을 읽었으면 자동 입력
    if (autoExp) {
      inExp.value = autoExp;
      var st0 = expiryStatus(autoExp);
      inExp.classList.toggle("warn", st0 === "bad");
      warn.classList.toggle("hide", st0 !== "bad");
      toast("유효기간 자동입력: " + autoExp);
    }
    inQty.focus();
  }

  function addItem(rec, qtyRaw, exp) {
    var qty = parseInt(qtyRaw, 10);
    if (!qty || qty < 1) { toast("수량을 입력하세요"); return; }
    var bc = rec["표준코드"];
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
    save();
    render();
    resultBox.innerHTML = "";
    pending = null;
    var mi = document.getElementById("manualInput"); if (mi) mi.value = "";
  }

  // ---------- 목록 렌더 ----------
  function render() {
    listEl.innerHTML = "";
    emptyHint.classList.toggle("hide", items.length > 0);
    var totQty = 0;
    items.forEach(function (it, i) {
      totQty += it.qty;
      var d = it.data || {};
      var name = d["출 력 명"] || d["제품명"] || it.barcode;
      var st = expiryStatus(it.exp);
      var expTxt = it.exp ? fmtExp(it.exp) : "유효기간 미입력";
      var badClass = (st === "bad" || st === "empty") ? " bad" : "";
      var div = document.createElement("div");
      div.className = "item";
      div.innerHTML =
        '<div class="seq">' + (i + 1) + '</div>' +
        '<div class="info"><div class="t">' + esc(name) + '</div>' +
        '<div class="d">' + esc(d["규  격"] || "") + ' · ' + esc(it.barcode) + '</div>' +
        '<div class="d' + badClass + '">유효기간 ' + esc(expTxt) + (st === "bad" ? " (범위밖)" : "") + '</div></div>' +
        '<div class="qty">' + it.qty + '</div>' +
        '<button class="x" data-i="' + i + '">✕</button>';
      div.querySelector(".x").addEventListener("click", function () {
        if (confirm("삭제할까요?\n" + name)) { items.splice(i, 1); save(); render(); }
      });
      listEl.appendChild(div);
    });
    document.getElementById("totLines").textContent = items.length;
    document.getElementById("totQty").textContent = totQty;
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

  // 시트1 27개 컬럼 (양식 순서)
  var OUT_COLS = ["순번","제품코드","제 조 사","발  주  처","출 력 명","규  격","소분수량","금액","유효기간",
    "거래처코드","약국명","담당자","작업일자","기준단가","거래처도매","기준가격×계산단위","보험코드","제품명",
    "제품구분","단위","성분분류","제형구분","제품그룹","성 분","표준코드","신고계산단위","비고"];

  function num(v) { var n = Number(String(v).replace(/,/g, "")); return isFinite(n) ? n : 0; }

  function exportXlsx() {
    if (!items.length) { toast("입력된 품목이 없습니다"); return; }
    if (!window.XLSX) { toast("엑셀 모듈 로딩 실패"); return; }

    var date = settings.date || "";
    var ym = "";
    var mD = /^(\d{4})-(\d{2})/.exec(date);
    if (mD) ym = mD[1] + " " + mD[2] + " 월";

    var aoa = [];
    function blank() { return new Array(27).fill(""); }
    // 상단 안내 (원본 양식 재현)
    var r2 = blank(); r2[5] = "파일에 포함된 제품만 가능하고 **유효기간 2020년부터 2026년 06월** 이전제품만가능 /제품은 원제품 포장에 있는것 만 가능합니다.";
    var r3 = blank(); r3[1] = "%%불용재고 품목 명세서  " + ym + "$$";
    var r5 = blank(); r5[5] = "*포는 1포기준 /점안액30A은 1A /ml 통안약은 1통기준 등록";
    var r6 = blank(); r6[5] = "*점안액 % & ml 확인철저히 할것";
    var r7 = blank(); r7[5] = "하원제약 테라젠 이텍스는 출하건만 가능";
    aoa.push(blank(), r2, r3, blank(), r5, r6, r7, blank());
    aoa.push(OUT_COLS.slice());

    items.forEach(function (it, i) {
      var d = it.data || {};
      var price = num(d["기준단가"]);
      var amount = price * it.qty;
      var row = [
        i + 1,
        d["제품코드"] || "",
        d["제 조 사"] || "",
        d["발  주  처"] || "",
        d["출 력 명"] || "",
        d["규  격"] || "",
        it.qty,
        amount,
        fmtExp(it.exp),
        settings.client || "",
        settings.pharm || "",
        settings.worker || "",
        date,
        price,
        d["거래처도매"] || "",
        d["기준가격×계산단위"] || "",
        d["보험코드"] || "",
        d["제품명"] || "",
        d["제품구분"] || "",
        d["단위"] || "",
        d["성분분류"] || "",
        d["제형구분"] || "",
        d["제품그룹"] || "",
        d["성 분"] || "",
        d["표준코드"] || "",
        d["신고계산단위"] || "",
        d["비고"] || ""
      ];
      aoa.push(row);
    });

    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = OUT_COLS.map(function (c) {
      if (c === "출 력 명" || c === "제품명" || c === "성 분") return { wch: 26 };
      if (c === "표준코드" || c === "성분분류" || c === "보험코드") return { wch: 16 };
      return { wch: 10 };
    });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "시트1");
    var fname = "불용재고_" + (date || "출력") + ".xlsx";
    XLSX.writeFile(wb, fname);
    toast("엑셀 저장: " + fname);
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
