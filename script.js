/* ==========================================================
   Body Scent — shared script
   Runs on every page; each section only activates when its
   elements exist on the page.
     product.html : #filter-bar, #product-list
     order.html   : #orderForm, #customerName, #contact, #items, #total, #note
     admin.html   : #ordersTable tbody
   ========================================================== */

(function () {
  "use strict";

  /* ---------- Config ---------- */
  var ORDER_ENDPOINT =
    "https://script.google.com/macros/s/AKfycbxNuiGcJwl8RNSTg7dEqafOz2p0BFru1WvbzAVfwaN790O5s0kOzPeggoXV7zGyLF55/exec";

  var ORDERS_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTtWyx3rcW_Z1y70Jtr3T-U-Eqza2lkz_SS2zGXVwRdbvg6ieuN-acVGJJ4O9OXhq5a2r4sQLniYceK/pub?gid=0&single=true&output=csv";

  var MOODS = [
    { key: "all", label: "ทั้งหมด" },
    { key: "fresh", label: "Fresh" },
    { key: "sweet", label: "Sweet" },
    { key: "confident", label: "Confident" },
    { key: "romance", label: "Romance" }
  ];

  var TYPE_LABELS = { spray: "น้ำหอมฉีดตัว", rollon: "โรลออน" };

  /* ---------- Helpers ---------- */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function formatPrice(value) {
    var n = Number(value);
    return isNaN(n) ? String(value) : n.toLocaleString("th-TH") + " บาท";
  }

  /* ==========================================================
     1) product.html — product cards + mood filter
     ========================================================== */
  function initProducts() {
    var list = document.getElementById("product-list");
    var bar = document.getElementById("filter-bar");
    if (!list || !bar) return;

    var products = [];
    var currentMood = "all";

    function isValidMood(mood) {
      return MOODS.some(function (m) {
        return m.key === mood;
      });
    }

    function buildCard(p) {
      var card = el("article", "product-card");
      card.setAttribute("data-mood", p.mood);

      var imgWrap = el("div", "product-card__image");
      var img = document.createElement("img");
      img.src = p.image;
      img.alt = p.name;
      img.loading = "lazy";
      imgWrap.appendChild(img);

      var body = el("div", "product-card__body");

      var tag = el("span", "mood-tag");
      var dot = el("span", "mood-dot");
      dot.setAttribute("aria-hidden", "true");
      tag.appendChild(dot);
      var moodInfo = MOODS.filter(function (m) {
        return m.key === p.mood;
      })[0];
      tag.appendChild(document.createTextNode(moodInfo ? moodInfo.label : p.mood));

      var title = el("h3", "product-card__title", p.name);

      var sizeText = p.size || TYPE_LABELS[p.type] || "";
      var size = el("p", "muted", sizeText);

      var foot = el("div", "product-card__foot");
      foot.appendChild(el("span", "price", formatPrice(p.price)));

      var orderUrl =
        "order.html?item=" +
        encodeURIComponent(p.name) +
        "&price=" +
        encodeURIComponent(p.price);
      var btn = el("a", "btn btn--small", "สั่งซื้อ");
      btn.href = orderUrl;
      foot.appendChild(btn);

      body.appendChild(tag);
      body.appendChild(title);
      body.appendChild(size);
      body.appendChild(foot);

      card.appendChild(imgWrap);
      card.appendChild(body);
      return card;
    }

    function render() {
      list.textContent = "";
      var shown = products.filter(function (p) {
        return currentMood === "all" || p.mood === currentMood;
      });

      if (!shown.length) {
        list.appendChild(el("p", "muted", "ยังไม่มีสินค้าในหมวดนี้"));
        return;
      }
      shown.forEach(function (p) {
        list.appendChild(buildCard(p));
      });
    }

    function updateButtons() {
      var buttons = bar.querySelectorAll("button");
      Array.prototype.forEach.call(buttons, function (b) {
        b.setAttribute(
          "aria-pressed",
          b.getAttribute("data-mood") === currentMood ? "true" : "false"
        );
      });
    }

    function setMood(mood) {
      currentMood = mood;
      updateButtons();
      render();

      // keep ?mood= in the address bar so refresh/share keeps the filter
      try {
        var url = new URL(window.location.href);
        if (mood === "all") url.searchParams.delete("mood");
        else url.searchParams.set("mood", mood);
        window.history.replaceState(null, "", url);
      } catch (e) {
        /* ignore */
      }
    }

    function buildFilterBar() {
      bar.textContent = "";
      bar.classList.add("filters");
      MOODS.forEach(function (m) {
        var b = el("button", "chip", m.label);
        b.type = "button";
        b.setAttribute("data-mood", m.key);
        b.setAttribute("aria-pressed", "false");
        b.addEventListener("click", function () {
          setMood(m.key);
        });
        bar.appendChild(b);
      });
    }

    buildFilterBar();

    var paramMood = new URLSearchParams(window.location.search).get("mood");
    if (paramMood) {
      paramMood = paramMood.toLowerCase();
      if (isValidMood(paramMood)) currentMood = paramMood;
    }

    fetch("products.json")
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        products = data;
        updateButtons();
        render();
      })
      .catch(function (error) {
        console.error(error);
        list.textContent = "";
        list.appendChild(
          el("p", "form-message form-message--error", "โหลดรายการสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
        );
      });
  }

  /* ==========================================================
     2) order.html — prefill from URL + submit to Apps Script
     ========================================================== */
  function initOrder() {
    var form = document.getElementById("orderForm");
    if (!form) return;

    var itemsInput = document.getElementById("items");
    var totalInput = document.getElementById("total");

    // Prefill from ?item=...&price=...
    var params = new URLSearchParams(window.location.search);
    var item = params.get("item");
    var price = params.get("price");
    if (itemsInput && item) itemsInput.value = item;
    if (totalInput && price) totalInput.value = price;

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var submitBtn = form.querySelector('[type="submit"]');

      var payload = {
        customerName: document.getElementById("customerName").value.trim(),
        contact: document.getElementById("contact").value.trim(),
        items: document.getElementById("items").value.trim(),
        total: document.getElementById("total").value.trim(),
        note: document.getElementById("note").value.trim()
      };

      if (submitBtn) submitBtn.disabled = true;

      fetch(ORDER_ENDPOINT, {
        method: "POST",
        body: JSON.stringify(payload)
      })
        .then(function () {
          window.location.href = "thankyou.html";
        })
        .catch(function (error) {
          console.error(error);
          alert("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }

  /* ==========================================================
     3) admin.html — read published Google Sheet CSV
     ========================================================== */

  // Minimal CSV parser: handles quoted fields, commas and line breaks
  // inside quotes, "" escapes, CRLF/LF, and a leading BOM.
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    var i = 0;

    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    while (i < text.length) {
      var c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i++;
          continue;
        }
        field += c;
        i++;
        continue;
      }

      if (c === '"') {
        inQuotes = true;
        i++;
      } else if (c === ",") {
        row.push(field);
        field = "";
        i++;
      } else if (c === "\r" || c === "\n") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        i++;
      } else {
        field += c;
        i++;
      }
    }

    // last field / row without trailing newline
    if (field !== "" || row.length) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  function initAdmin() {
    var tbody = document.querySelector("#ordersTable tbody");
    if (!tbody) return;

    var COLUMNS = 6;

    function messageRow(text) {
      tbody.textContent = "";
      var tr = document.createElement("tr");
      var td = el("td", "muted", text);
      td.colSpan = COLUMNS;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    messageRow("กำลังโหลดข้อมูล...");

    fetch(ORDERS_CSV_URL, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (text) {
        var rows = parseCSV(text).filter(function (r) {
          return r.some(function (cell) {
            return cell.trim() !== "";
          });
        });

        // Skip a header row if present (a date in column A always contains digits)
        if (rows.length && !/\d/.test(rows[0][0])) rows.shift();

        if (!rows.length) {
          messageRow("ยังไม่มีรายการสั่งซื้อ");
          return;
        }

        // Rows are appended in time order, so reverse = newest first
        rows.reverse();

        tbody.textContent = "";
        rows.forEach(function (r) {
          var tr = document.createElement("tr");
          for (var i = 0; i < COLUMNS; i++) {
            tr.appendChild(el("td", "", r[i] !== undefined ? r[i] : ""));
          }
          tbody.appendChild(tr);
        });
      })
      .catch(function (error) {
        console.error(error);
        messageRow("โหลดข้อมูลไม่สำเร็จ กรุณาลองรีเฟรชอีกครั้ง");
      });
  }

  /* ---------- Init ---------- */
  function init() {
    initProducts();
    initOrder();
    initAdmin();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
