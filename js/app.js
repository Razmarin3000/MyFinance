'use strict';

const STATE = {
  currentMonth: new Date(),
  view: 'dashboard',
  analyticsData: null,
  analyticsType: 'expense',
  analyticsView: 'overview',
  analyticsDetailCat: 'all',
  addFlow: {
    active: false, step: null, type: null, category: null,
    amount: '', date: todayISO(), dateLabel: 'сегодня', comment: ''
  },
  editFlow: { tx: null }
};

const CATEGORIES = {
  food: { emoji: '🍔', label: 'Еда' },
  transport: { emoji: '🚌', label: 'Транспорт' },
  entertainment: { emoji: '🎮', label: 'Развлечения' },
  study: { emoji: '📚', label: 'Учёба' },
  other: { emoji: '💡', label: 'Другое' }
};

const CAT_BAR_COLORS = { food: '#F4B860', transport: '#7BA3CF', entertainment: '#B89FCC', study: '#6B9A6E', other: '#94897A' };

const RU_MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

function monthParam(date) { return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0'); }
function todayISO() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function offsetDateISO(daysBack) { var d = new Date(); d.setDate(d.getDate() - daysBack); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function fmtAmount(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
function fmtDate(iso) {
  var today = todayISO(), yesterday = offsetDateISO(1), dayBefore = offsetDateISO(2);
  if (iso === today) return 'Сегодня';
  if (iso === yesterday) return 'Вчера';
  if (iso === dayBefore) return 'Позавчера';
  var parts = iso.split('-'), d = parseInt(parts[2], 10), m = parseInt(parts[1], 10) - 1;
  var months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  return d + ' ' + months[m];
}

async function fetchTransactions() { return apiFetch('/api/transactions?month=' + monthParam(STATE.currentMonth)); }
async function fetchStats() { return apiFetch('/api/stats?month=' + monthParam(STATE.currentMonth)); }
async function fetchAnalytics() { return apiFetch('/api/analytics?month=' + monthParam(STATE.currentMonth) + '&type=' + STATE.analyticsType); }

async function loadAll() {
  STATE.analyticsData = null;
  try {
    var results = await Promise.all([fetchTransactions(), fetchStats()]);
    renderStats(results[1]);
    renderTransactions(results[0]);
  } catch (err) { alert('Ошибка загрузки данных: ' + err.message); }
}

function renderStats(stats) {
  document.getElementById('stat-balance').textContent = fmtAmount(stats.balance || 0) + ' ₽';
  document.getElementById('stat-income').textContent = '+' + fmtAmount(stats.month_income || 0) + ' ₽';
  document.getElementById('stat-expense').textContent = '−' + fmtAmount(stats.month_expenses || 0) + ' ₽';
  var mn = RU_MONTHS[STATE.currentMonth.getMonth()].toLowerCase();
  document.getElementById('stat-income-sub').textContent = 'за ' + mn;
  document.getElementById('stat-expense-sub').textContent = 'за ' + mn;
  renderInsights(stats);
}

function renderInsights(stats) {
  var forecast = stats.forecast || {};
  var trendIcon = document.getElementById('insight-trend-icon');
  trendIcon.className = 'insight-icon';
  var trendArrow = '→';
  if (forecast.trend_vs_prev_month === 'up') { trendIcon.classList.add('trend-up'); trendArrow = '↗'; }
  if (forecast.trend_vs_prev_month === 'down') { trendIcon.classList.add('trend-down'); trendArrow = '↘'; }
  if (forecast.trend_vs_prev_month === 'flat') { trendIcon.classList.add('trend-flat'); trendArrow = '→'; }
  trendIcon.textContent = trendArrow;
  document.getElementById('insight-forecast-text').innerHTML = 'При текущем темпе потратите <strong>~' + fmtAmount(forecast.projected_month_expenses || 0) + ' ₽</strong> к концу месяца, осталось ' + (forecast.days_left || 0) + ' дн.';
  var topCat = stats.top_category, catIcon = document.getElementById('insight-cat-icon'), catText = document.getElementById('insight-cat-text');
  if (topCat && CATEGORIES[topCat]) {
    var catInfo = CATEGORIES[topCat], catAmount = 0;
    var byCatArr = stats.by_category || [];
    for (var ci = 0; ci < byCatArr.length; ci++) { if (byCatArr[ci].category === topCat) { catAmount = byCatArr[ci].amount; break; } }
    var pct = stats.month_expenses > 0 ? Math.round(catAmount / stats.month_expenses * 100) : 0;
    catIcon.textContent = catInfo.emoji; catIcon.style.background = 'var(--bg-muted)';
    catText.innerHTML = 'Главная статья: <strong>' + catInfo.emoji + ' ' + catInfo.label.toLowerCase() + '</strong> — ' + fmtAmount(catAmount) + ' ₽ (' + pct + '% расходов)';
  } else {
    catIcon.textContent = '💡'; catIcon.style.background = 'var(--bg-muted)';
    catText.textContent = 'Нет данных по категориям';
  }
  renderCatBar(stats.by_category || [], stats.month_expenses || 0);
}

function renderCatBar(byCategory, totalExpense) {
  var bar = document.getElementById('cat-bar');
  bar.innerHTML = '';
  if (totalExpense <= 0 || byCategory.length === 0) {
    var seg = document.createElement('div'); seg.style.flex = '1'; seg.style.background = 'var(--bg-muted)';
    bar.appendChild(seg); return;
  }
  for (var i = 0; i < byCategory.length; i++) {
    var item = byCategory[i];
    if (item.amount <= 0) continue;
    var seg = document.createElement('div');
    seg.style.flex = String(item.amount);
    seg.style.background = CAT_BAR_COLORS[item.category] || 'var(--ink-3)';
    bar.appendChild(seg);
  }
}

function renderTransactions(txs) {
  var list = document.getElementById('tx-list'), empty = document.getElementById('empty-state');
  list.innerHTML = '';
  document.getElementById('tx-count').textContent = txs.length + ' ' + pluralOps(txs.length);
  if (txs.length === 0) { empty.hidden = false; return; }
  empty.hidden = true;
  for (var ti = 0; ti < txs.length; ti++) {
    var tx = txs[ti];
    var wrapper = document.createElement('div'); wrapper.className = 'tx-wrapper';
    var delBtn = document.createElement('button'); delBtn.className = 'tx-delete'; delBtn.textContent = 'Удалить';
    delBtn.addEventListener('click', makeDeleteHandler(tx.id));
    var card = document.createElement('div'); card.className = 'tx'; card.dataset.id = tx.id;
    var catInfo = CATEGORIES[tx.category] || { emoji: '💡', label: tx.category };
    var sign = tx.type === 'income' ? '+' : '−', amountClass = tx.type === 'income' ? 'income' : 'expense';
    var commentHtml = tx.comment ? '<div class="tx-comment">' + escHtml(tx.comment) + '</div>' : '';
    card.innerHTML = '<div class="tx-icon ' + tx.category + '">' + catInfo.emoji + '</div><div class="tx-body"><div class="tx-cat">' + catInfo.label + '</div>' + commentHtml + '<div class="tx-date">' + fmtDate(tx.date) + '</div></div><div class="tx-amount ' + amountClass + '">' + sign + fmtAmount(tx.amount) + ' ₽</div>';
    wrapper.appendChild(delBtn); wrapper.appendChild(card); list.appendChild(wrapper);
    setupSwipe(card);
    card.addEventListener('click', (function(card, tx) {
      return function(e) {
        if (e.target.closest('.tx-delete')) return;
        if (card.dataset.swiped === 'true') { card.dataset.swiped = 'false'; return; }
        openEditSheet(tx);
      };
    })(card, tx));
  }
}

function makeDeleteHandler(id) {
  return function() { deleteTxById(id); };
}

function pluralOps(n) {
  if (n % 100 >= 11 && n % 100 <= 19) return 'операций';
  var r = n % 10;
  if (r === 1) return 'операция';
  if (r >= 2 && r <= 4) return 'операции';
  return 'операций';
}

function escHtml(str) { return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function setupSwipe(cardEl) {
  var startX = 0, startY = 0, swiping = false, longPressTimer = null;
  cardEl.addEventListener('touchstart', function(e) {
    startX = e.touches[0].clientX; startY = e.touches[0].clientY; swiping = false;
    longPressTimer = setTimeout(function() { cardEl.dataset.swiped = 'true'; }, 500);
  }, { passive: true });
  cardEl.addEventListener('touchmove', function(e) {
    var dx = e.touches[0].clientX - startX, dy = e.touches[0].clientY - startY;
    if (Math.abs(dy) > Math.abs(dx)) { clearTimeout(longPressTimer); return; }
    swiping = true; clearTimeout(longPressTimer);
    if (dx < -40) cardEl.dataset.swiped = 'true';
    else if (dx > 40 && cardEl.dataset.swiped === 'true') cardEl.dataset.swiped = 'false';
  }, { passive: true });
  cardEl.addEventListener('touchend', function() { clearTimeout(longPressTimer); });
  document.addEventListener('touchstart', function(e) { if (cardEl.dataset.swiped === 'true' && !cardEl.contains(e.target)) cardEl.dataset.swiped = 'false'; }, { passive: true });
}

function openSheet() {
  STATE.addFlow = { active: true, step: null, type: null, category: null, amount: '', date: todayISO(), dateLabel: 'сегодня', comment: '' };
  document.getElementById('sheet-backdrop').classList.add('visible'); document.getElementById('sheet').classList.add('open');
  goToStep('type');
}

function closeSheet() {
  document.getElementById('sheet-backdrop').classList.remove('visible'); document.getElementById('sheet').classList.remove('open');
  STATE.addFlow.active = false; STATE.addFlow.step = null;
  document.getElementById('amount-display').textContent = '0 ₽'; document.getElementById('key-confirm').disabled = true;
  document.getElementById('comment-input').hidden = true; document.getElementById('comment-input').value = '';
  document.getElementById('comment-toggle').textContent = '+ комментарий'; document.getElementById('date-menu').hidden = true;
  document.getElementById('date-label').textContent = 'сегодня'; document.getElementById('date-custom').value = '';
}

function goToStep(name) {
  STATE.addFlow.step = name;
  var steps = ['type', 'category', 'amount'];
  for (var si = 0; si < steps.length; si++) {
    var el = document.getElementById('step-' + steps[si]);
    if (el) el.classList.toggle('active', steps[si] === name);
  }
}

async function submitTransaction() {
  var flow = STATE.addFlow, amount = parseFloat(flow.amount);
  if (!amount || amount <= 0) return;
  try {
    await apiFetch('/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: flow.type, amount: amount, category: flow.category, date: flow.date, comment: flow.comment || null }) });
    closeSheet(); await loadAll();
  } catch (err) { alert('Ошибка: ' + err.message); }
}

async function deleteTxById(id) {
  try { await apiFetch('/api/transactions/' + id, { method: 'DELETE' }); await loadAll(); }
  catch (err) { alert('Ошибка удаления: ' + err.message); }
}

function openEditSheet(tx) {
  STATE.editFlow.tx = Object.assign({}, tx);
  document.getElementById('edit-amount').value = tx.amount;
  document.getElementById('edit-date').value = tx.date;
  document.getElementById('edit-comment').value = tx.comment || '';
  var typeBtns = document.querySelectorAll('.edit-type-btn');
  for (var ti = 0; ti < typeBtns.length; ti++) {
    typeBtns[ti].classList.toggle('active', typeBtns[ti].dataset.type === tx.type);
  }
  var catBtns = document.querySelectorAll('.edit-cat-btn');
  for (var ci = 0; ci < catBtns.length; ci++) {
    catBtns[ci].classList.toggle('active', catBtns[ci].dataset.cat === tx.category);
  }
  document.getElementById('sheet-backdrop').classList.add('visible'); document.getElementById('sheet-edit').classList.add('open');
}

function closeEditSheet() {
  document.getElementById('sheet-edit').classList.remove('open');
  if (!document.getElementById('sheet').classList.contains('open')) document.getElementById('sheet-backdrop').classList.remove('visible');
  STATE.editFlow.tx = null;
}

async function submitEdit() {
  var tx = STATE.editFlow.tx, amount = parseFloat(document.getElementById('edit-amount').value);
  if (!tx || !amount || amount <= 0) { alert('Введите корректную сумму'); return; }
  try {
    await apiFetch('/api/transactions/' + tx.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: tx.type, amount: amount, category: tx.category, date: document.getElementById('edit-date').value, comment: document.getElementById('edit-comment').value || null }) });
    closeEditSheet(); await loadAll();
  } catch (err) { alert('Ошибка: ' + err.message); }
}

async function deleteFromEdit() {
  if (!STATE.editFlow.tx || !confirm('Удалить эту операцию?')) return;
  try { await apiFetch('/api/transactions/' + STATE.editFlow.tx.id, { method: 'DELETE' }); closeEditSheet(); await loadAll(); }
  catch (err) { alert('Ошибка удаления: ' + err.message); }
}

function prevMonthLabel(currentDate) {
  var d = new Date(currentDate); d.setMonth(d.getMonth() - 1);
  return RU_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

function buildPieGradient(byCategory) {
  var acc = 0; var total = 0;
  for (var i = 0; i < byCategory.length; i++) total += byCategory[i].amount;
  if (total <= 0) return 'conic-gradient(var(--bg-muted) 0% 100%)';
  var stops = [];
  for (var i = 0; i < byCategory.length; i++) {
    var c = byCategory[i];
    if (c.amount <= 0) continue;
    var start = (acc / total) * 100; acc += c.amount; var end = (acc / total) * 100;
    stops.push(CAT_BAR_COLORS[c.category] + ' ' + start + '% ' + end + '%');
  }
  return 'conic-gradient(' + stops.join(', ') + ')';
}

function renderAnalytics(data) {
  document.getElementById('analytics-title-type').textContent = data.type === 'expense' ? 'Расходы' : 'Доходы';
  document.getElementById('analytics-month-label').textContent = data.month_label;
  var totalStr = fmtAmount(data.total_amount || 0) + ' ₽';
  document.getElementById('analytics-total').textContent = totalStr;
  document.getElementById('analytics-summary-line').textContent = data.summary_line || '';
  document.getElementById('analytics-pie-total').textContent = totalStr;
  document.getElementById('analytics-pie').style.background = buildPieGradient(data.by_category || []);

  var legendEl = document.getElementById('analytics-legend'); legendEl.innerHTML = '';
  var activeCategories = [];
  for (var i = 0; i < (data.by_category || []).length; i++) {
    if (data.by_category[i].amount > 0) activeCategories.push(data.by_category[i]);
  }
  for (var i = 0; i < activeCategories.length; i++) {
    var c = activeCategories[i];
    var catInfo = CATEGORIES[c.category] || { emoji: '💡', label: c.category };
    var row = document.createElement('div'); row.className = 'legend-row';
    row.innerHTML = '<span class="dot" style="background:' + (CAT_BAR_COLORS[c.category] || 'var(--ink-3)') + '"></span><span class="emoji">' + catInfo.emoji + '</span><span class="label">' + catInfo.label + '</span><span class="amount">' + fmtAmount(c.amount) + ' ₽</span><span class="share">' + c.share_pct + '%</span>';
    legendEl.appendChild(row);
  }

  var cardsEl = document.getElementById('analytics-cards'); cardsEl.innerHTML = '';
  for (var i = 0; i < activeCategories.length; i++) {
    var c = activeCategories[i];
    var catInfo = CATEGORIES[c.category] || { emoji: '💡', label: c.category };
    var trendClass = c.trend === 'up' ? 'delta-up' : c.trend === 'down' ? 'delta-down' : 'delta-flat';
    var card = document.createElement('div'); card.className = 'analytics-card';
    card.innerHTML = '<div class="analytics-card-head"><div class="left">' + catInfo.emoji + ' ' + catInfo.label + '</div><div class="amount">' + fmtAmount(c.amount) + ' ₽</div></div><div class="analytics-card-meta">' + c.tx_count + ' ' + pluralOps(c.tx_count) + ' · ' + c.share_pct + '% ' + (data.type === 'expense' ? 'расходов' : 'доходов') + '</div><div><span class="analytics-delta-badge ' + trendClass + '">' + c.delta_label + '</span><span class="analytics-delta-vs">vs ' + prevMonthLabel(STATE.currentMonth) + '</span></div>';
    cardsEl.appendChild(card);
  }
  document.querySelector('#analytics-empty .empty-text').textContent = data.type === 'expense' ? 'В этом месяце ещё нет расходов' : 'В этом месяце ещё нет доходов';
  document.getElementById('analytics-empty').hidden = activeCategories.length > 0;
}

async function loadAnalytics() {
  try { var data = await fetchAnalytics(); STATE.analyticsData = data; renderAnalytics(data); switchAnalyticsView(STATE.analyticsView); }
  catch (err) { alert('Ошибка загрузки аналитики: ' + err.message); }
}

function switchView(name) {
  STATE.view = name;
  var appBody = document.querySelector('.app-body'), analyticsBody = document.getElementById('analytics-body'), fab = document.getElementById('fab');
  if (name === 'dashboard') {
    appBody.hidden = false; analyticsBody.hidden = true; fab.classList.remove('hidden'); loadAll();
  } else {
    appBody.hidden = true; analyticsBody.hidden = false; fab.classList.add('hidden'); loadAnalytics();
  }
  var tabBtns = document.querySelectorAll('.tab-btn');
  for (var i = 0; i < tabBtns.length; i++) tabBtns[i].classList.toggle('active', tabBtns[i].dataset.view === name);
}

function updateMonthLabel() { document.getElementById('month-label').textContent = RU_MONTHS[STATE.currentMonth.getMonth()] + ' ' + STATE.currentMonth.getFullYear(); }
function shiftMonth(delta) {
  STATE.currentMonth = new Date(STATE.currentMonth.getFullYear(), STATE.currentMonth.getMonth() + delta, 1);
  STATE.analyticsData = null; updateMonthLabel(); STATE.view === 'analytics' ? loadAnalytics() : loadAll();
}

function updateAmountDisplay() {
  var raw = STATE.addFlow.amount, n = parseInt(raw || '0', 10);
  document.getElementById('amount-display').textContent = fmtAmount(n) + ' ₽';
  document.getElementById('key-confirm').disabled = !raw || n <= 0;
}

function handleKey(k) {
  var flow = STATE.addFlow;
  if (k === 'del') { flow.amount = flow.amount.slice(0, -1); }
  else if (k === 'confirm') { submitTransaction(); return; }
  else { if (k === '0' && flow.amount === '') return; if (flow.amount.length >= 9) return; flow.amount += k; }
  updateAmountDisplay();
}

function setDate(iso, label) { STATE.addFlow.date = iso; STATE.addFlow.dateLabel = label; document.getElementById('date-label').textContent = label; document.getElementById('date-menu').hidden = true; }

function computeDailyBreakdown(month, type, category) {
  var txs = loadTxs();
  var year = parseInt(month.slice(0, 4), 10);
  var monthNum = parseInt(month.slice(5, 7), 10);
  var daysInMonth = new Date(year, monthNum, 0).getDate();
  var daily = [];
  for (var d = 0; d < daysInMonth; d++) daily.push(0);
  txs.forEach(function(t) {
    if (!t.date || !t.date.startsWith(month)) return;
    if (t.type !== type) return;
    if (category !== 'all' && t.category !== category) return;
    var day = parseInt(t.date.slice(8, 10), 10);
    if (day >= 1 && day <= daysInMonth) daily[day - 1] += t.amount;
  });
  return { daily: daily, daysInMonth: daysInMonth };
}

function renderDetailed() {
  var month = monthParam(STATE.currentMonth);
  var type = STATE.analyticsType;
  var category = STATE.analyticsDetailCat || 'all';
  var data = computeDailyBreakdown(month, type, category);
  var daily = data.daily;
  var daysInMonth = data.daysInMonth;
  var total = 0, maxVal = 0;
  for (var i = 0; i < daily.length; i++) {
    total += daily[i];
    if (daily[i] > maxVal) maxVal = daily[i];
  }
  var chartEl = document.getElementById('histogram');
  chartEl.innerHTML = '';
  if (maxVal <= 0) {
    chartEl.innerHTML = '<div class="hist-empty">Нет данных за этот месяц</div>';
    document.getElementById('detail-avg-day').textContent = '0 ₽';
    document.getElementById('detail-avg-week').textContent = '0 ₽';
    document.getElementById('detail-avg-month').textContent = '0 ₽';
    return;
  }
  var maxLabel = document.createElement('div');
  maxLabel.className = 'hist-max';
  maxLabel.textContent = fmtAmount(Math.round(maxVal)) + ' ₽';
  chartEl.appendChild(maxLabel);
  var barsWrap = document.createElement('div');
  barsWrap.className = 'hist-bars';
  var barClass = type === 'income' ? 'hist-bar income' : 'hist-bar';
  for (var d = 0; d < daily.length; d++) {
    var col = document.createElement('div');
    col.className = 'hist-col';
    var bar = document.createElement('div');
    bar.className = barClass;
    if (daily[d] > 0) {
      var pct = (daily[d] / maxVal) * 100;
      if (pct < 2) pct = 2;
      bar.style.height = pct + '%';
      bar.title = fmtAmount(Math.round(daily[d])) + ' ₽';
    }
    var lbl = document.createElement('div');
    lbl.className = 'hist-day';
    lbl.textContent = d + 1;
    col.appendChild(bar);
    col.appendChild(lbl);
    barsWrap.appendChild(col);
  }
  chartEl.appendChild(barsWrap);
  var avgDay = Math.round(total / daysInMonth);
  var avgWeek = Math.round(avgDay * 7);
  document.getElementById('detail-avg-day').textContent = fmtAmount(avgDay) + ' ₽';
  document.getElementById('detail-avg-week').textContent = fmtAmount(avgWeek) + ' ₽';
  document.getElementById('detail-avg-month').textContent = fmtAmount(Math.round(total)) + ' ₽';
}

function switchAnalyticsView(name) {
  STATE.analyticsView = name;
  document.getElementById('analytics-overview').hidden = name !== 'overview';
  document.getElementById('analytics-detailed').hidden = name !== 'detailed';
  var btns = document.querySelectorAll('.view-toggle-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.aview === name);
  if (name === 'detailed') renderDetailed();
}

function generateAnalysisPrompt() {
  var month = monthParam(STATE.currentMonth);
  var txs = loadTxs();
  var monthTxs = txs.filter(function(t) { return t.date && t.date.startsWith(month) && t.type === 'expense'; });
  var total = 0, byCat = {}, daily = {};
  monthTxs.forEach(function(t) {
    total += t.amount;
    byCat[t.category] = (byCat[t.category] || 0) + t.amount;
    var day = parseInt(t.date.slice(8, 10), 10);
    daily[day] = (daily[day] || 0) + t.amount;
  });
  var year = parseInt(month.slice(0, 4), 10);
  var monthNum = parseInt(month.slice(5, 7), 10);
  var daysInMonth = new Date(year, monthNum, 0).getDate();
  var now = new Date();
  var passedDays = Math.min(now.getDate(), daysInMonth);
  var projected = passedDays > 0 ? Math.round(total / passedDays * daysInMonth) : total;
  var catNames = { food: 'Еда', transport: 'Транспорт', entertainment: 'Развлечения', study: 'Учёба', other: 'Другое' };
  var cats = Object.keys(byCat).sort(function(a, b) { return byCat[b] - byCat[a]; });
  var catLines = cats.map(function(c) { return '- ' + (catNames[c] || c) + ': ' + fmtAmount(Math.round(byCat[c])) + ' ₽'; }).join('\n');
  var mn = RU_MONTHS[STATE.currentMonth.getMonth()] + ' ' + STATE.currentMonth.getFullYear();
  return 'Проанализируй мои расходы за ' + mn + ':\n\n' +
    'Общий расход: ' + fmtAmount(Math.round(total)) + ' ₽\n' +
    'Средний в день: ' + fmtAmount(Math.round(total / daysInMonth)) + ' ₽\n' +
    'Прогноз на конец месяца: ' + fmtAmount(projected) + ' ₽\n\n' +
    'По категориям:\n' + catLines + '\n\n' +
    'Дай анализ: на что уходит больше всего, где можно сэкономить, здоровый ли бюджет. Напиши по-русски, коротко и по делу.';
}


function closePromptSheet() {
  document.getElementById('sheet-backdrop').classList.remove('visible');
  document.getElementById('prompt-sheet').classList.remove('open');
}

function initTheme() {
  var btn = document.getElementById('theme-toggle');
  var docEl = document.documentElement;
  if (docEl.getAttribute('data-theme') === 'dark') btn.textContent = '☀️';
  btn.addEventListener('click', function() {
    if (docEl.getAttribute('data-theme') === 'dark') {
      docEl.removeAttribute('data-theme'); localStorage.setItem('mf-theme', 'light'); btn.textContent = '🌙';
    } else {
      docEl.setAttribute('data-theme', 'dark'); localStorage.setItem('mf-theme', 'dark'); btn.textContent = '☀️';
    }
  });
}

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('prev-month').addEventListener('click', function() { shiftMonth(-1); });
  document.getElementById('next-month').addEventListener('click', function() { shiftMonth(1); });
  document.getElementById('fab').addEventListener('click', openSheet);
  document.getElementById('sheet-backdrop').addEventListener('click', function() {
    if (document.getElementById('prompt-sheet').classList.contains('open')) { closePromptSheet(); return; }
    if (document.getElementById('sheet-edit').classList.contains('open')) { closeEditSheet(); return; }
    closeSheet();
  });

  var typeBtns = document.querySelectorAll('.type-btn');
  for (var i = 0; i < typeBtns.length; i++) {
    typeBtns[i].addEventListener('click', function(btn) {
      return function() { STATE.addFlow.type = btn.dataset.type; goToStep('category'); };
    }(typeBtns[i]));
  }
  var catBtns = document.querySelectorAll('.cat-btn');
  for (var i = 0; i < catBtns.length; i++) {
    catBtns[i].addEventListener('click', function(btn) {
      return function() { STATE.addFlow.category = btn.dataset.cat; goToStep('amount'); updateAmountDisplay(); };
    }(catBtns[i]));
  }
  var keys = document.querySelectorAll('.key');
  for (var i = 0; i < keys.length; i++) {
    keys[i].addEventListener('click', function(btn) {
      return function() { handleKey(btn.dataset.key); };
    }(keys[i]));
  }

  document.getElementById('date-toggle').addEventListener('click', function(e) { e.stopPropagation(); var m = document.getElementById('date-menu'); m.hidden = !m.hidden; });
  var dateOpts = document.querySelectorAll('.date-opt');
  for (var i = 0; i < dateOpts.length; i++) {
    dateOpts[i].addEventListener('click', function(btn) {
      return function() {
        var offset = btn.dataset.offset;
        if (offset === 'custom') { document.getElementById('date-custom').click(); return; }
        var days = parseInt(offset, 10);
        var labels = ['сегодня', 'вчера', 'позавчера'];
        setDate(offsetDateISO(days), labels[days] || offsetDateISO(days));
      };
    }(dateOpts[i]));
  }
  document.getElementById('date-custom').addEventListener('change', function(e) { if (e.target.value) setDate(e.target.value, e.target.value); });
  document.addEventListener('click', function(e) { var menu = document.getElementById('date-menu'), toggle = document.getElementById('date-toggle'); if (!menu.hidden && !menu.contains(e.target) && e.target !== toggle) menu.hidden = true; });

  document.getElementById('comment-toggle').addEventListener('click', function() {
    var inp = document.getElementById('comment-input'); inp.hidden = !inp.hidden;
    if (!inp.hidden) { inp.focus(); document.getElementById('comment-toggle').textContent = '− комментарий'; }
    else { document.getElementById('comment-toggle').textContent = '+ комментарий'; STATE.addFlow.comment = ''; inp.value = ''; }
  });
  document.getElementById('comment-input').addEventListener('input', function(e) { STATE.addFlow.comment = e.target.value; });

  var editTypeBtns = document.querySelectorAll('.edit-type-btn');
  for (var i = 0; i < editTypeBtns.length; i++) {
    editTypeBtns[i].addEventListener('click', function(btn) {
      return function() {
        if (STATE.editFlow.tx) STATE.editFlow.tx.type = btn.dataset.type;
        var all = document.querySelectorAll('.edit-type-btn');
        for (var j = 0; j < all.length; j++) all[j].classList.remove('active');
        btn.classList.add('active');
      };
    }(editTypeBtns[i]));
  }
  var editCatBtns = document.querySelectorAll('.edit-cat-btn');
  for (var i = 0; i < editCatBtns.length; i++) {
    editCatBtns[i].addEventListener('click', function(btn) {
      return function() {
        if (STATE.editFlow.tx) STATE.editFlow.tx.category = btn.dataset.cat;
        var all = document.querySelectorAll('.edit-cat-btn');
        for (var j = 0; j < all.length; j++) all[j].classList.remove('active');
        btn.classList.add('active');
      };
    }(editCatBtns[i]));
  }
  document.getElementById('edit-amount').addEventListener('input', function(e) { if (STATE.editFlow.tx) STATE.editFlow.tx.amount = e.target.value; });
  document.getElementById('edit-date').addEventListener('input', function(e) { if (STATE.editFlow.tx) STATE.editFlow.tx.date = e.target.value; });
  document.getElementById('edit-comment').addEventListener('input', function(e) { if (STATE.editFlow.tx) STATE.editFlow.tx.comment = e.target.value; });
  document.getElementById('edit-save-btn').addEventListener('click', submitEdit);
  document.getElementById('edit-delete-btn').addEventListener('click', deleteFromEdit);

  var analyticsBtns = document.querySelectorAll('.analytics-toggle-btn');
  for (var i = 0; i < analyticsBtns.length; i++) {
    analyticsBtns[i].addEventListener('click', function(btn) {
      return function() {
        STATE.analyticsType = btn.dataset.type;
        var all = document.querySelectorAll('.analytics-toggle-btn');
        for (var j = 0; j < all.length; j++) all[j].classList.remove('active');
        btn.classList.add('active');
        loadAnalytics();
      };
    }(analyticsBtns[i]));
  }

  var viewToggleBtns = document.querySelectorAll('.view-toggle-btn');
  for (var i = 0; i < viewToggleBtns.length; i++) {
    viewToggleBtns[i].addEventListener('click', function(btn) {
      return function() { switchAnalyticsView(btn.dataset.aview); };
    }(viewToggleBtns[i]));
  }

  var detailCatBtns = document.querySelectorAll('.detail-cat-btn');
  for (var i = 0; i < detailCatBtns.length; i++) {
    detailCatBtns[i].addEventListener('click', function(btn) {
      return function() {
        STATE.analyticsDetailCat = btn.dataset.dcat;
        var all = document.querySelectorAll('.detail-cat-btn');
        for (var j = 0; j < all.length; j++) all[j].classList.remove('active');
        btn.classList.add('active');
        renderDetailed();
      };
    }(detailCatBtns[i]));
  }

  function updateKeyStatus() {
    var userKey = localStorage.getItem('mf-or-key') || '';
    var hasDefault = !!(window.OR_DEFAULT_KEY && window.OR_DEFAULT_KEY.length > 0);
    var statusEl = document.getElementById('ai-key-status');
    var clearBtn = document.getElementById('ai-clear-key');
    if (userKey) {
      statusEl.textContent = '✓ Используется ваш ключ';
      statusEl.className = 'ai-key-status user';
      clearBtn.className = 'ai-clear-btn visible';
    } else if (hasDefault) {
      statusEl.textContent = '✓ Используется ключ сервера';
      statusEl.className = 'ai-key-status server';
      clearBtn.className = 'ai-clear-btn';
    } else {
      statusEl.textContent = '✗ Ключ не настроен — введите свой';
      statusEl.className = 'ai-key-status none';
      clearBtn.className = 'ai-clear-btn';
    }
  }

  document.getElementById('ai-gear').addEventListener('click', function() {
    var s = document.getElementById('ai-settings');
    s.hidden = !s.hidden;
    if (!s.hidden) { updateKeyStatus(); document.getElementById('ai-api-key').focus(); }
  });

  var savedKey = localStorage.getItem('mf-or-key') || '';
  if (savedKey) document.getElementById('ai-api-key').value = savedKey;

  document.getElementById('ai-save-key').addEventListener('click', function() {
    var key = document.getElementById('ai-api-key').value.trim();
    if (key) {
      localStorage.setItem('mf-or-key', key);
      this.textContent = 'Сохранено!';
      var btn = this;
      setTimeout(function() { btn.textContent = 'Сохранить'; }, 1500);
      updateKeyStatus();
    }
  });

  document.getElementById('ai-clear-key').addEventListener('click', function() {
    localStorage.removeItem('mf-or-key');
    document.getElementById('ai-api-key').value = '';
    updateKeyStatus();
  });

  document.getElementById('ai-ask').addEventListener('click', async function() {
    var userKey = localStorage.getItem('mf-or-key') || '';
    var key = userKey || (window.OR_DEFAULT_KEY || '');
    if (!key) {
      document.getElementById('ai-settings').hidden = false;
      updateKeyStatus();
      document.getElementById('ai-api-key').focus();
      return;
    }
    var btn = this; btn.disabled = true; btn.textContent = '⏳';
    var answerEl = document.getElementById('ai-answer');
    var thinkingEl = document.getElementById('ai-thinking');
    var labelEl = document.getElementById('ai-answer-label');
    var textEl = document.getElementById('ai-answer-text');
    var hintEl = document.getElementById('ai-hint');
    hintEl.textContent = '';
    textEl.textContent = '';
    thinkingEl.hidden = false;
    labelEl.hidden = true;
    answerEl.hidden = false;
    var gotFirst = false;
    try {
      var prompt = generateAnalysisPrompt();
      var res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key,
          'HTTP-Referer': location.origin
        },
        body: JSON.stringify({ model: 'deepseek/deepseek-v4-flash:free', messages: [{ role: 'user', content: prompt }], max_tokens: 800, stream: true })
      });
      if (!res.ok) { throw new Error('HTTP ' + res.status + ': ' + (await res.text()).slice(0, 200)); }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buf = '';
      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buf += decoder.decode(chunk.value, { stream: true });
        var lines = buf.split('\n');
        buf = lines.pop();
        for (var li = 0; li < lines.length; li++) {
          var line = lines[li].trim();
          if (!line.startsWith('data: ')) continue;
          var payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;
          try {
            var delta = JSON.parse(payload).choices[0].delta.content;
            if (delta) {
              if (!gotFirst) {
                gotFirst = true;
                thinkingEl.hidden = true;
                labelEl.hidden = false;
              }
              textEl.textContent += delta;
            }
          } catch (_) {}
        }
      }
      if (!gotFirst) { thinkingEl.hidden = true; hintEl.textContent = 'Ответ не получен'; answerEl.hidden = true; }
    } catch (err) {
      thinkingEl.hidden = true;
      answerEl.hidden = true;
      if (err.message.indexOf('NetworkError') !== -1 || err.message.indexOf('Failed to fetch') !== -1 || err.message.indexOf('CORS') !== -1) {
        hintEl.innerHTML = 'Браузер блокирует запрос (CORS). Откройте сайт через сервер, а не как файл.';
      } else {
        hintEl.textContent = 'Ошибка: ' + err.message;
      }
    }
    btn.disabled = false; btn.textContent = '🧠 Анализ ИИ';
  });
  document.getElementById('prompt-copy').addEventListener('click', function() {
    var ta = document.getElementById('prompt-text');
    ta.focus(); ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    this.textContent = 'Скопировано!';
    setTimeout(function() { document.getElementById('prompt-copy').textContent = 'Копировать'; }, 2000);
  });
  document.getElementById('prompt-close').addEventListener('click', closePromptSheet);

  document.getElementById('import-btn').addEventListener('click', function() { document.getElementById('import-file').click(); });
  document.getElementById('import-file').addEventListener('change', async function(e) {
    var file = e.target.files[0]; if (!file) return;
    var btn = document.getElementById('import-btn'), original = btn.textContent;
    btn.textContent = '⏳'; btn.disabled = true;
    try {
      var fd = new FormData(); fd.append('file', file);
      var data = await apiFetch('/api/import', { method: 'POST', body: fd });
      alert('Импортировано: ' + data.imported + '\nПропущено: ' + data.skipped);
      await loadAll();
    } catch (err) { alert('Ошибка импорта: ' + err.message); }
    finally { btn.textContent = original; btn.disabled = false; e.target.value = ''; }
  });

  var tabBtns = document.querySelectorAll('.tab-btn');
  for (var i = 0; i < tabBtns.length; i++) {
    tabBtns[i].addEventListener('click', function(btn) {
      return function() { switchView(btn.dataset.view); };
    }(tabBtns[i]));
  }

  initTheme();
  updateMonthLabel();
  loadAll();
});
