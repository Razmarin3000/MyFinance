'use strict';

const STORAGE_KEY = 'mf-transactions-v1';

function loadTxs() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch (_) { return []; }
}

function saveTxs(txs) { localStorage.setItem(STORAGE_KEY, JSON.stringify(txs)); }

function nextId(txs) {
  return txs.length ? Math.max.apply(null, txs.map(function(t) { return t.id || 0; })) + 1 : 1;
}

function parseCSVLine(line) {
  var out = []; var cur = ''; var inQ = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else { cur += c; }
    } else {
      if (c === ';') { out.push(cur); cur = ''; }
      else if (c === '"' && cur === '') inQ = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function getTransactions(txs, month) {
  if (!month) {
    var now = new Date();
    month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }
  var filtered = txs.filter(function(t) { return t.date && t.date.startsWith(month); });
  filtered.sort(function(a, b) {
    if (a.date < b.date) return 1;
    if (a.date > b.date) return -1;
    return (b.id || 0) - (a.id || 0);
  });
  return filtered;
}

function validateTx(body) {
  if (!body.type || (body.type !== 'income' && body.type !== 'expense')) {
    throw new Error("Тип должен быть 'income' или 'expense'");
  }
  var amount = parseFloat(body.amount);
  if (!amount || amount <= 0) throw new Error('Сумма должна быть больше 0');
  var validCats = ['food', 'transport', 'entertainment', 'study', 'other'];
  if (validCats.indexOf(body.category) === -1) throw new Error('Недопустимая категория');
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) throw new Error('Дата должна быть в формате YYYY-MM-DD');
}

function createTransaction(txs, body) {
  validateTx(body);
  var tx = {
    id: nextId(txs), type: body.type, amount: parseFloat(body.amount),
    category: body.category, date: body.date, comment: body.comment || null,
    created_at: new Date().toISOString()
  };
  txs.push(tx); saveTxs(txs);
  return tx;
}

function updateTransaction(txs, id, body) {
  var idx = txs.findIndex(function(t) { return t.id === id; });
  if (idx === -1) throw new Error('Transaction not found');
  validateTx(body);
  var tx = txs[idx];
  tx.type = body.type; tx.amount = parseFloat(body.amount);
  tx.category = body.category; tx.date = body.date;
  tx.comment = body.comment || null;
  saveTxs(txs);
  return tx;
}

function deleteTransaction(txs, id) {
  var idx = txs.findIndex(function(t) { return t.id === id; });
  if (idx === -1) throw new Error('Transaction not found');
  txs.splice(idx, 1); saveTxs(txs);
  return { ok: true };
}

function computeStats(txs, month) {
  var now = new Date();
  if (!month) {
    month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }
  var year = parseInt(month.slice(0, 4), 10);
  var monthNum = parseInt(month.slice(5, 7), 10);
  var totalIncome = 0, totalExpenses = 0;
  txs.forEach(function(t) {
    if (t.type === 'income') totalIncome += t.amount;
    else if (t.type === 'expense') totalExpenses += t.amount;
  });
  var balance = totalIncome - totalExpenses;
  var monthTxs = txs.filter(function(t) { return t.date && t.date.startsWith(month); });
  var monthIncome = 0, monthExpenses = 0;
  monthTxs.forEach(function(t) {
    if (t.type === 'income') monthIncome += t.amount;
    else if (t.type === 'expense') monthExpenses += t.amount;
  });
  var CATS = ['food', 'transport', 'entertainment', 'study', 'other'];
  var byCategory = CATS.map(function(cat) {
    var amount = 0;
    monthTxs.forEach(function(t) {
      if (t.type === 'expense' && t.category === cat) amount += t.amount;
    });
    return { category: cat, amount: amount };
  });
  byCategory.sort(function(a, b) { return b.amount - a.amount; });
  var topCategory = null;
  if (monthExpenses > 0) topCategory = byCategory[0].category;
  var daysInMonth = new Date(year, monthNum, 0).getDate();
  var passedDays, daysLeft;
  if (year === now.getFullYear() && monthNum === (now.getMonth() + 1)) {
    passedDays = now.getDate(); daysLeft = daysInMonth - now.getDate();
  } else {
    passedDays = daysInMonth; daysLeft = 0;
  }
  passedDays = Math.min(passedDays, daysInMonth);
  var projected = passedDays > 0 ? Math.round(monthExpenses / passedDays * daysInMonth * 100) / 100 : 0;
  var prevMonthNum = monthNum - 1;
  var prevYear = year;
  if (prevMonthNum === 0) { prevMonthNum = 12; prevYear -= 1; }
  var prevMonthStr = String(prevYear).padStart(4, '0') + '-' + String(prevMonthNum).padStart(2, '0');
  var prevMonthExpenses = 0;
  txs.forEach(function(t) {
    if (t.type === 'expense' && t.date && t.date.startsWith(prevMonthStr)) prevMonthExpenses += t.amount;
  });
  var trend = 'flat';
  if (prevMonthExpenses > 0) {
    var delta = (projected - prevMonthExpenses) / prevMonthExpenses;
    if (delta > 0.05) trend = 'up';
    else if (delta < -0.05) trend = 'down';
    else trend = 'flat';
  }
  return {
    balance: balance, month_income: monthIncome, month_expenses: monthExpenses,
    by_category: byCategory, top_category: topCategory,
    forecast: { days_left: daysLeft, projected_month_expenses: projected, trend_vs_prev_month: trend }
  };
}

function computeAnalytics(txs, month, type) {
  type = type || 'expense';
  var now = new Date();
  if (!month) {
    month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }
  var year = parseInt(month.slice(0, 4), 10);
  var monthNum = parseInt(month.slice(5, 7), 10);
  var RU_MONTHS_FULL = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  var monthLabel = RU_MONTHS_FULL[monthNum - 1] + ' ' + year;
  var prevMonthNum = monthNum - 1;
  var prevYear = year;
  if (prevMonthNum === 0) { prevMonthNum = 12; prevYear -= 1; }
  var prevMonthStr = String(prevYear).padStart(4, '0') + '-' + String(prevMonthNum).padStart(2, '0');
  var prevMonthLabel = RU_MONTHS_FULL[prevMonthNum - 1] + ' ' + prevYear;
  var GEN = { food: 'еды', transport: 'транспорта', entertainment: 'развлечений', study: 'учёбы', other: 'прочего' };
  var monthTxs = txs.filter(function(t) { return t.date && t.date.startsWith(month); });
  var prevTxs = txs.filter(function(t) { return t.date && t.date.startsWith(prevMonthStr); });
  var totalAmount = 0;
  monthTxs.forEach(function(t) {
    if (t.type === type) totalAmount += t.amount;
  });
  totalAmount = Math.round(totalAmount * 100) / 100;
  var CATS = ['food', 'transport', 'entertainment', 'study', 'other'];
  var byCategoryList = CATS.map(function(cat) {
    var amount = 0;
    monthTxs.forEach(function(t) {
      if (t.type === type && t.category === cat) amount += t.amount;
    });
    var prevAmount = 0;
    prevTxs.forEach(function(t) {
      if (t.type === type && t.category === cat) prevAmount += t.amount;
    });
    var txCount = monthTxs.filter(function(t) {
      return t.type === type && t.category === cat;
    }).length;
    amount = Math.round(amount * 100) / 100;
    prevAmount = Math.round(prevAmount * 100) / 100;
    var sharePct = totalAmount > 0 ? Math.round(amount / totalAmount * 1000) / 10 : 0;
    var deltaPct = null;
    var deltaLabel = '';
    var trend = 'flat';
    if (prevAmount === 0) {
      if (amount > 0) { deltaPct = null; deltaLabel = 'новая категория'; trend = 'up'; }
      else { deltaPct = 0; deltaLabel = 'без изменений'; trend = 'flat'; }
    } else {
      deltaPct = Math.round((amount - prevAmount) / prevAmount * 1000) / 10;
      if (Math.abs(deltaPct) > 5) {
        if (deltaPct > 0) { deltaLabel = 'больше на ' + Math.round(Math.abs(deltaPct)) + '%'; trend = 'up'; }
        else { deltaLabel = 'меньше на ' + Math.round(Math.abs(deltaPct)) + '%'; trend = 'down'; }
      } else { deltaLabel = 'примерно столько же'; trend = 'flat'; }
    }
    return { category: cat, amount: amount, share_pct: sharePct, prev_amount: prevAmount, delta_pct: deltaPct, delta_label: deltaLabel, trend: trend, tx_count: txCount };
  });
  byCategoryList.sort(function(a, b) { return b.amount - a.amount; });
  function fmtInt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0'); }
  var actionWord = type === 'expense' ? 'потратили' : 'заработали';
  var summaryLine = 'В этом месяце вы ' + actionWord + ' ' + fmtInt(totalAmount) + ' ₽';
  var candidates = byCategoryList.filter(function(c) { return c.prev_amount > 0 && c.amount > 0 && c.delta_pct !== null; });
  candidates.sort(function(a, b) { return Math.abs(b.delta_pct) - Math.abs(a.delta_pct); });
  if (candidates.length > 0) {
    var mentions = candidates.slice(0, 2).map(function(c) {
      var absD = Math.round(Math.abs(c.delta_pct));
      if (c.delta_pct > 0) return 'на ' + absD + '% больше ' + GEN[c.category];
      else return 'на ' + absD + '% меньше ' + GEN[c.category];
    });
    summaryLine += ' — ' + mentions.join(' и ') + ' чем в ' + prevMonthLabel + '.';
  } else { summaryLine += '.'; }
  return { month: month, month_label: monthLabel, total_amount: totalAmount, by_category: byCategoryList, summary_line: summaryLine, type: type };
}

async function importTinkoffCSV(txs, formData) {
  var file = formData.get('file');
  if (!file) throw new Error('Файл не найден');
  var buffer = await file.arrayBuffer();
  var bytes = new Uint8Array(buffer);
  var text;
  try { var dec = new TextDecoder('utf-8', { fatal: true }); text = dec.decode(bytes); if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); }
  catch (_) { text = new TextDecoder('windows-1251').decode(bytes); }
  var lines = text.split(/\r?\n/);
  if (lines.length === 0) throw new Error('Файл пуст');
  var headerLine = lines[0];
  var headers = parseCSVLine(headerLine);
  var required = ['Дата операции', 'Статус', 'Сумма операции', 'Валюта операции', 'Категория', 'Описание'];
  for (var ri = 0; ri < required.length; ri++) {
    if (headers.indexOf(required[ri]) === -1) throw new Error('В заголовке отсутствует столбец: ' + required[ri]);
  }
  var colIdx = {};
  headers.forEach(function(h, i) { colIdx[h] = i; });
  var CATEGORY_MAP = [
    ['food', ['супермаркет','продукт','ресторан','кафе','фастфуд','кофе','еда','grocer']],
    ['transport', ['транспорт','такси','taxi','метро','автобус','топливо','азс','парковк','каршеринг']],
    ['entertainment', ['развлечен','кино','игр','музык','концерт','театр','streaming']],
    ['study', ['образован','обучен','книг','курс','учеб','школ']]
  ];
  function mapCategory(raw) {
    if (!raw) return 'other';
    var lower = raw.toLowerCase();
    for (var mi = 0; mi < CATEGORY_MAP.length; mi++) {
      var kws = CATEGORY_MAP[mi][1];
      for (var ki = 0; ki < kws.length; ki++) {
        if (lower.indexOf(kws[ki]) !== -1) return CATEGORY_MAP[mi][0];
      }
    }
    return 'other';
  }
  function parseAmount(s) {
    if (!s) return 0;
    s = s.replace(/\s/g, '').replace(/\u00A0/g, '').replace(',', '.');
    var v = parseFloat(s);
    return isNaN(v) ? 0 : v;
  }
  var imported = 0, skipped = 0, errors = [];
  for (var rowNum = 1; rowNum < lines.length; rowNum++) {
    var line = lines[rowNum];
    if (!line || !line.trim()) continue;
    try {
      var cols = parseCSVLine(line);
      var status = (cols[colIdx['Статус']] || '').trim();
      if (status !== 'OK') { skipped++; continue; }
      var dateStr = (cols[colIdx['Дата операции']] || '').trim();
      if (!dateStr || dateStr.length < 10) { skipped++; continue; }
      var dateParts = dateStr.slice(0, 10).split('.');
      if (dateParts.length !== 3) { skipped++; continue; }
      var dateISO = dateParts[2] + '-' + dateParts[1] + '-' + dateParts[0];
      var currency = (cols[colIdx['Валюта операции']] || '').trim();
      if (currency && currency !== 'RUB' && currency !== 'Руб' && currency !== '₽') { skipped++; continue; }
      var amountRaw = (cols[colIdx['Сумма операции']] || '').trim();
      var amount = parseAmount(amountRaw);
      if (amount === 0) { skipped++; continue; }
      var txType = amount < 0 ? 'expense' : 'income';
      amount = Math.abs(amount);
      var rawCategory = cols[colIdx['Категория']] || '';
      var category = mapCategory(rawCategory);
      var comment = (cols[colIdx['Описание']] || '').trim();
      if (comment.length > 200) comment = comment.slice(0, 200);
      txs.push({ id: nextId(txs), type: txType, amount: amount, category: category, date: dateISO, comment: comment || null, created_at: new Date().toISOString() });
      imported++;
    } catch (e) {
      skipped++;
      if (errors.length < 5) errors.push('Строка ' + (rowNum + 1) + ': ' + String(e.message || e).slice(0, 100));
    }
  }
  saveTxs(txs);
  return { imported: imported, skipped: skipped, errors: errors };
}

async function apiFetch(path, opts) {
  opts = opts || {};
  var method = (opts.method || 'GET').toUpperCase();
  var qIdx = path.indexOf('?');
  var pathname = qIdx === -1 ? path : path.slice(0, qIdx);
  var params = new URLSearchParams(qIdx === -1 ? '' : path.slice(qIdx + 1));
  var body = null;
  if (opts.body && typeof opts.body === 'string') body = JSON.parse(opts.body);
  else if (opts.body instanceof FormData) body = opts.body;
  await new Promise(function(r) { setTimeout(r, 0); });
  var txs = loadTxs();
  if (pathname === '/api/transactions' && method === 'GET') return getTransactions(txs, params.get('month'));
  if (pathname === '/api/transactions' && method === 'POST') return createTransaction(txs, body);
  if (pathname.startsWith('/api/transactions/') && method === 'PUT') return updateTransaction(txs, parseInt(pathname.split('/').pop(), 10), body);
  if (pathname.startsWith('/api/transactions/') && method === 'DELETE') return deleteTransaction(txs, parseInt(pathname.split('/').pop(), 10));
  if (pathname === '/api/stats' && method === 'GET') return computeStats(txs, params.get('month'));
  if (pathname === '/api/analytics' && method === 'GET') return computeAnalytics(txs, params.get('month'), params.get('type'));
  if (pathname === '/api/import' && method === 'POST') return importTinkoffCSV(txs, body);
  throw new Error('Unknown endpoint: ' + method + ' ' + pathname);
}
