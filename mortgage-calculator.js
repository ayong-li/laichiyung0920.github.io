/* 房貸試算器
 * 用法：在頁面放 <div data-mortgage-calc data-mode="compact" data-price="2500" data-name="松山新城甲區"></div>
 * data-mode：full（完整版，給 mortgage.html）或 compact（精簡版，嵌入社區頁面）
 * data-price：預設房價（萬元），可省略
 * 完整版也會讀網址參數：mortgage.html?price=2500&ltv=80&rate=2.2&years=30&grace=0&name=松山新城甲區
 */
(function () {
  'use strict';

  var COLOR_PRINCIPAL = '#1f6fa8';
  var COLOR_INTEREST = '#b8862a';

  var DEFAULTS = { price: 2500, ltv: 80, rate: 2.2, years: 30, grace: 0, method: 'equal', income: 0 };

  // ---------- 計算 ----------

  // 回傳每月明細：[{month, payment, principal, interest, balance}]
  function schedule(loan, annualRate, years, graceYears, method) {
    var n = Math.round(years * 12);
    var g = Math.min(Math.round(graceYears * 12), n - 1);
    var r = annualRate / 100 / 12;
    var rows = [];
    var balance = loan;
    var m = n - g;
    var fixedPayment = r === 0 ? loan / m : loan * r * Math.pow(1 + r, m) / (Math.pow(1 + r, m) - 1);

    for (var i = 1; i <= n; i++) {
      var interest = balance * r;
      var principal;
      if (i <= g) {
        principal = 0;
      } else if (method === 'principal') {
        principal = loan / m;
      } else {
        principal = fixedPayment - interest;
      }
      if (i === n) principal = balance;
      balance -= principal;
      rows.push({ month: i, payment: principal + interest, principal: principal, interest: interest, balance: Math.max(balance, 0) });
    }
    return rows;
  }

  function summarize(p) {
    var loan = p.price * 10000 * p.ltv / 100;
    var rows = schedule(loan, p.rate, p.years, p.grace, p.method);
    var g = Math.min(Math.round(p.grace * 12), rows.length - 1);
    var totalInterest = 0;
    rows.forEach(function (row) { totalInterest += row.interest; });
    return {
      loan: loan,
      down: p.price * 10000 - loan,
      rows: rows,
      gracePayment: g > 0 ? rows[0].payment : null,
      firstPayment: rows[g].payment,
      lastPayment: rows[rows.length - 1].payment,
      totalInterest: totalInterest,
      total: loan + totalInterest
    };
  }

  // 依每月可負擔金額反推可貸金額（本息均攤、無寬限期）
  function maxLoanFor(monthly, annualRate, years) {
    var n = years * 12;
    var r = annualRate / 100 / 12;
    if (r === 0) return monthly * n;
    return monthly * (Math.pow(1 + r, n) - 1) / (r * Math.pow(1 + r, n));
  }

  // ---------- 格式 ----------

  function money(v) { return Math.round(v).toLocaleString('zh-TW') + ' 元'; }
  function wan(v) {
    var w = v / 10000;
    return (Math.abs(w) >= 100 ? Math.round(w).toLocaleString('zh-TW') : (Math.round(w * 10) / 10).toLocaleString('zh-TW')) + ' 萬';
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(el, fallback) {
    var v = parseFloat(el && el.value);
    return isFinite(v) ? v : fallback;
  }

  // ---------- 畫面 ----------

  function field(id, label, value, attrs, unit) {
    return '<label class="mc-field"><span>' + label + '</span><span class="mc-input">' +
      '<input type="number" inputmode="decimal" data-k="' + id + '" value="' + value + '" ' + attrs + '>' +
      (unit ? '<em>' + unit + '</em>' : '') + '</span></label>';
  }

  function select(id, label, value, options) {
    var html = '<label class="mc-field"><span>' + label + '</span><select data-k="' + id + '">';
    options.forEach(function (o) {
      html += '<option value="' + o[0] + '"' + (String(o[0]) === String(value) ? ' selected' : '') + '>' + o[1] + '</option>';
    });
    return html + '</select></label>';
  }

  function inputsHtml(p, full) {
    var html = '<div class="mc-grid">' +
      field('price', '房屋總價', p.price, 'min="0" step="10"', '萬') +
      field('ltv', '貸款成數', p.ltv, 'min="0" max="100" step="5"', '%') +
      field('rate', '年利率', p.rate, 'min="0" max="20" step="0.01"', '%') +
      select('years', '貸款年限', p.years, [[20, '20 年'], [30, '30 年'], [40, '40 年']]) +
      select('grace', '寬限期', p.grace, [[0, '無'], [1, '1 年'], [2, '2 年'], [3, '3 年'], [4, '4 年'], [5, '5 年']]);
    if (full) {
      html += select('method', '還款方式', p.method, [['equal', '本息平均攤還'], ['principal', '本金平均攤還']]) +
        field('income', '家庭月收入（選填）', p.income || '', 'min="0" step="1000" placeholder="例如 120000"', '元');
    }
    return html + '</div>';
  }

  function stat(label, value, note) {
    return '<div class="mc-stat"><div class="mc-stat-label">' + label + '</div><div class="mc-stat-value">' + value + '</div>' +
      (note ? '<div class="mc-stat-note">' + note + '</div>' : '') + '</div>';
  }

  function resultsHtml(p, s) {
    var html = '<div class="mc-stats">';
    if (s.gracePayment !== null) {
      html += stat('寬限期內月付（只繳利息）', money(s.gracePayment), '前 ' + p.grace + ' 年');
      html += stat('寬限期後月付', money(s.firstPayment), p.method === 'principal' ? '首月，之後逐月遞減' : '第 ' + (p.grace + 1) + ' 年起');
    } else {
      html += stat('每月還款', money(s.firstPayment), p.method === 'principal' ? '首月，最後一期約 ' + money(s.lastPayment) : '每月固定');
    }
    html += stat('貸款金額', wan(s.loan)) + stat('自備款（頭期款）', wan(s.down));
    if (p.full) html += stat('總利息', wan(s.totalInterest)) + stat('本息總還款', wan(s.total));
    html += '</div>';
    if (s.gracePayment !== null) {
      html += '<p class="mc-alert">⚠️ 寬限期結束後，月付會從 ' + money(s.gracePayment) + ' 增加到 ' + money(s.firstPayment) +
        '（多 ' + money(s.firstPayment - s.gracePayment) + '），而且總利息會比不用寬限期多。</p>';
    }
    return html;
  }

  function incomeHtml(p, s) {
    if (!p.income) return '';
    var payment = s.firstPayment;
    var ratio = payment / p.income * 100;
    var level = ratio <= 33 ? '在一般建議的 1/3 以內，負擔相對安全' : ratio <= 50 ? '超過 1/3，生活預算會比較吃緊' : '超過收入一半，銀行核貸可能有困難';
    var affordLoan = maxLoanFor(p.income / 3, p.rate, p.years);
    var affordPrice = p.ltv > 0 ? affordLoan / (p.ltv / 100) : 0;
    return '<div class="mc-box"><h3>收入負擔檢查</h3>' +
      '<p>最高月付約佔家庭月收入 <strong>' + ratio.toFixed(1) + '%</strong>，' + level + '。</p>' +
      '<p>以月付不超過收入 1/3（' + money(p.income / 3) + '）反推：在目前利率、年限與 ' + p.ltv + ' 成貸款條件下，' +
      '約可貸 <strong>' + wan(affordLoan) + '</strong>，可考慮總價約 <strong>' + wan(affordPrice) + '</strong> 以內的房子。</p></div>';
  }

  function scenariosHtml(p, base) {
    var html = '<div class="mc-box"><h3>升息情境比較</h3><div class="mc-table-wrap"><table class="mc-table"><thead><tr>' +
      '<th>利率</th><th>' + (p.grace > 0 ? '寬限期後月付' : '每月還款') + '</th><th>月付增加</th><th>總利息</th></tr></thead><tbody>';
    [0, 0.25, 0.5, 1].forEach(function (d) {
      var s = summarize(Object.assign({}, p, { rate: p.rate + d }));
      html += '<tr' + (d === 0 ? ' class="mc-current"' : '') + '><td>' + (p.rate + d).toFixed(2) + '%' + (d === 0 ? '（目前）' : '（+' + d + '%）') + '</td>' +
        '<td>' + money(s.firstPayment) + '</td><td>' + (d === 0 ? '—' : '+' + money(s.firstPayment - base.firstPayment)) + '</td>' +
        '<td>' + wan(s.totalInterest) + '</td></tr>';
    });
    return html + '</tbody></table></div></div>';
  }

  function yearly(rows) {
    var out = [];
    rows.forEach(function (row, i) {
      var y = Math.floor(i / 12);
      if (!out[y]) out[y] = { year: y + 1, payment: 0, principal: 0, interest: 0, balance: 0 };
      out[y].payment += row.payment;
      out[y].principal += row.principal;
      out[y].interest += row.interest;
      out[y].balance = row.balance;
    });
    return out;
  }

  function chartHtml(years) {
    var W = 720, H = 260, padL = 56, padR = 8, padT = 12, padB = 28;
    var max = 0;
    years.forEach(function (y) { max = Math.max(max, y.payment); });
    max = max || 1;
    var step = Math.pow(10, Math.floor(Math.log(max / 4) / Math.LN10));
    var tick = [1, 2, 2.5, 5, 10].map(function (k) { return k * step; }).filter(function (t) { return max / t <= 5; })[0] || step * 10;
    var top = Math.ceil(max / tick) * tick;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var slot = plotW / years.length;
    var bw = Math.max(Math.min(slot - 2, 18), 2);
    var yOf = function (v) { return padT + plotH - v / top * plotH; };

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="mc-chart" role="img" aria-label="每年還款的本金與利息組成">';
    for (var t = 0; t <= top + 1e-6; t += tick) {
      svg += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + yOf(t) + '" y2="' + yOf(t) + '" class="mc-grid-line"/>' +
        '<text x="' + (padL - 6) + '" y="' + (yOf(t) + 4) + '" text-anchor="end" class="mc-axis">' + wan(t) + '</text>';
    }
    years.forEach(function (y, i) {
      var x = padL + i * slot + (slot - bw) / 2;
      var hI = y.interest / top * plotH, hP = y.principal / top * plotH;
      var base = padT + plotH;
      var gap = hI > 0 && hP > 0 ? 2 : 0;
      if (hP > 0) svg += '<rect x="' + x + '" y="' + (base - hP) + '" width="' + bw + '" height="' + hP + '" fill="' + COLOR_PRINCIPAL + '"/>';
      if (hI > 0) svg += '<rect x="' + x + '" y="' + (base - hP - hI) + '" width="' + bw + '" height="' + Math.max(hI - gap, 0) + '" rx="2" fill="' + COLOR_INTEREST + '"/>';
      svg += '<rect x="' + (padL + i * slot) + '" y="' + padT + '" width="' + slot + '" height="' + plotH + '" class="mc-hit" data-i="' + i + '"/>';
      if ((i + 1) % 5 === 0 || i === 0) {
        svg += '<text x="' + (padL + i * slot + slot / 2) + '" y="' + (H - 8) + '" text-anchor="middle" class="mc-axis">第' + (i + 1) + '年</text>';
      }
    });
    svg += '</svg>';
    return '<div class="mc-box"><h3>每年還款組成</h3>' +
      '<div class="mc-legend"><span><i style="background:' + COLOR_PRINCIPAL + '"></i>本金</span><span><i style="background:' + COLOR_INTEREST + '"></i>利息</span></div>' +
      '<div class="mc-chart-wrap">' + svg + '<div class="mc-tip" hidden></div></div></div>';
  }

  function tableHtml(years) {
    var html = '<div class="mc-box"><div class="mc-box-head"><h3>逐年還款明細</h3>' +
      '<button type="button" class="mc-btn mc-download">下載明細（Excel 可開啟）</button></div>' +
      '<div class="mc-table-wrap mc-scroll"><table class="mc-table"><thead><tr><th>年度</th><th>全年繳款</th><th>本金</th><th>利息</th><th>年底剩餘本金</th></tr></thead><tbody>';
    years.forEach(function (y) {
      html += '<tr><td>第 ' + y.year + ' 年</td><td>' + money(y.payment) + '</td><td>' + money(y.principal) + '</td><td>' + money(y.interest) + '</td><td>' + money(y.balance) + '</td></tr>';
    });
    return html + '</tbody></table></div></div>';
  }

  var COST_ITEMS = [
    ['agent', '仲介服務費', '% 房價', 2],
    ['scrivener', '代書費、登記規費', '萬', 3],
    ['tax', '契稅、印花稅等稅費', '萬', 5],
    ['bank', '貸款手續費、鑑價費', '萬', 1],
    ['other', '其他（搬家、裝修等）', '萬', 0]
  ];

  function budgetHtml() {
    var html = '<div class="mc-box"><h3>買房總預算（頭期款以外的費用）</h3>' +
      '<p class="mc-note">以下為概估預設值，實際金額依物件與合約不同，請以代書及銀行報價為準，可直接修改。</p><div class="mc-grid">';
    COST_ITEMS.forEach(function (c) {
      html += '<label class="mc-field"><span>' + c[1] + '</span><span class="mc-input"><input type="number" inputmode="decimal" min="0" step="0.5" data-cost="' + c[0] + '" value="' + c[3] + '"><em>' + c[2] + '</em></span></label>';
    });
    return html + '</div><div class="mc-budget-result"></div></div>';
  }

  function updateBudget(root, p, s) {
    var out = root.querySelector('.mc-budget-result');
    if (!out) return;
    var fees = 0;
    COST_ITEMS.forEach(function (c) {
      var v = num(root.querySelector('[data-cost="' + c[0] + '"]'), 0);
      fees += c[0] === 'agent' ? p.price * 10000 * v / 100 : v * 10000;
    });
    out.innerHTML = '<div class="mc-stats">' + stat('自備款', wan(s.down)) + stat('其他費用合計', wan(fees)) +
      stat('買房需準備現金', wan(s.down + fees), '自備款＋其他費用') + '</div>';
  }

  function bindChart(root, years) {
    var wrap = root.querySelector('.mc-chart-wrap');
    if (!wrap) return;
    var tip = wrap.querySelector('.mc-tip');
    var show = function (e) {
      var i = e.target.getAttribute('data-i');
      if (i === null) return;
      var y = years[+i];
      tip.innerHTML = '<strong>第 ' + y.year + ' 年</strong><br>本金 ' + wan(y.principal) + '<br>利息 ' + wan(y.interest) + '<br>剩餘本金 ' + wan(y.balance);
      tip.hidden = false;
      var box = wrap.getBoundingClientRect();
      var r = e.target.getBoundingClientRect();
      var left = r.left - box.left + r.width / 2;
      tip.style.left = Math.min(Math.max(left, 70), box.width - 70) + 'px';
      wrap.querySelectorAll('.mc-hit').forEach(function (h) { h.classList.toggle('mc-hover', h === e.target); });
    };
    wrap.addEventListener('mousemove', show);
    wrap.addEventListener('click', show);
    wrap.addEventListener('mouseleave', function () {
      tip.hidden = true;
      wrap.querySelectorAll('.mc-hit').forEach(function (h) { h.classList.remove('mc-hover'); });
    });
  }

  function download(p, s) {
    var lines = ['期數,月付金,本金,利息,剩餘本金'];
    s.rows.forEach(function (r) {
      lines.push([r.month, Math.round(r.payment), Math.round(r.principal), Math.round(r.interest), Math.round(r.balance)].join(','));
    });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '房貸還款明細_' + p.price + '萬_' + p.rate + '%_' + p.years + '年.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function readParams(root) {
    var get = function (k) {
      var el = root.querySelector('[data-k="' + k + '"]');
      return el ? el.value : undefined;
    };
    return {
      price: Math.max(num({ value: get('price') }, 0), 0),
      ltv: Math.min(Math.max(num({ value: get('ltv') }, 0), 0), 100),
      rate: Math.max(num({ value: get('rate') }, 0), 0),
      years: num({ value: get('years') }, DEFAULTS.years),
      grace: num({ value: get('grace') }, 0),
      method: get('method') || 'equal',
      income: Math.max(num({ value: get('income') }, 0), 0)
    };
  }

  function init(root) {
    var full = root.getAttribute('data-mode') === 'full';
    var p = Object.assign({}, DEFAULTS);
    var name = root.getAttribute('data-name') || '';
    if (root.getAttribute('data-price')) p.price = num({ value: root.getAttribute('data-price') }, p.price);

    if (full) {
      var q = new URLSearchParams(location.search);
      ['price', 'ltv', 'rate', 'years', 'grace', 'income'].forEach(function (k) {
        if (q.has(k)) p[k] = num({ value: q.get(k) }, p[k]);
      });
      if (q.get('method') === 'principal') p.method = 'principal';
      if (q.get('name')) name = q.get('name');
    }

    root.classList.add('mc', full ? 'mc-full' : 'mc-compact');
    root.innerHTML =
      (name ? '<p class="mc-name">試算物件：' + esc(name) + '</p>' : '') +
      inputsHtml(p, full) +
      '<div class="mc-results"></div>' +
      (full ? '<div class="mc-income"></div><div class="mc-scenarios"></div><div class="mc-chart-slot"></div>' + budgetHtml() + '<div class="mc-table-slot"></div>' : '<a class="mc-btn mc-more" href="mortgage.html">看完整試算（升息比較、還款明細、買房總預算）→</a>') +
      '<p class="mc-disclaimer">※ 本試算僅供參考，實際貸款成數、利率與年限依銀行核貸及政府最新政策為準。</p>';

    var current;
    var render = function () {
      var params = readParams(root);
      params.full = full;
      current = { p: params, s: summarize(params) };
      root.querySelector('.mc-results').innerHTML = resultsHtml(params, current.s);
      if (full) {
        var years = yearly(current.s.rows);
        root.querySelector('.mc-income').innerHTML = incomeHtml(params, current.s);
        root.querySelector('.mc-scenarios').innerHTML = scenariosHtml(params, current.s);
        root.querySelector('.mc-chart-slot').innerHTML = chartHtml(years);
        root.querySelector('.mc-table-slot').innerHTML = tableHtml(years);
        bindChart(root, years);
        updateBudget(root, params, current.s);
      } else {
        var link = root.querySelector('.mc-more');
        var qs = new URLSearchParams({ price: params.price, ltv: params.ltv, rate: params.rate, years: params.years, grace: params.grace });
        if (name) qs.set('name', name);
        link.href = 'mortgage.html?' + qs.toString();
      }
    };

    root.addEventListener('input', function (e) {
      if (e.target.hasAttribute('data-cost')) updateBudget(root, current.p, current.s);
      else render();
    });
    root.addEventListener('change', render);
    root.addEventListener('click', function (e) {
      if (e.target.classList.contains('mc-download')) download(current.p, current.s);
    });
    render();
  }

  function start() {
    document.querySelectorAll('[data-mortgage-calc]').forEach(init);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
