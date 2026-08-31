/**
 * 个股详情弹窗（分时图）
 * 全局事件委托：点击任意带 data-stock 的元素即可打开。
 */

const POPUP_ID = 'stock-detail-popup';

function isFileProtocol() {
  return typeof window !== 'undefined' && window.location.protocol === 'file:';
}

async function getJSON(path) {
  if (isFileProtocol()) {
    throw new Error('local file protocol: 请通过 http://localhost:3000 访问以查看实时数据');
  }
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function formatNumber(n, d = 2) {
  if (n === undefined || n === null || Number.isNaN(Number(n))) return '--';
  return Number(n).toFixed(d);
}

function formatVolume(n) {
  if (n === undefined || n === null || Number.isNaN(Number(n))) return '--';
  const v = Number(n);
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿';
  if (v >= 1e4) return (v / 1e4).toFixed(2) + '万';
  return v.toFixed(0);
}

function colorFor(change) {
  return Number(change) >= 0 ? 'var(--brand-state-up)' : 'var(--brand-state-down)';
}

function injectPopupOnce() {
  if (document.getElementById(POPUP_ID)) return;

  const root = document.createElement('div');
  root.id = POPUP_ID;
  root.className = 'fixed inset-0 z-50 hidden items-end justify-center';
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('role', 'dialog');
  root.innerHTML = `
    <div id="${POPUP_ID}-backdrop" class="absolute inset-0 bg-black/40 opacity-0 transition-opacity duration-300"></div>
    <div id="${POPUP_ID}-sheet" class="relative w-full max-w-md bg-card rounded-t-2xl shadow-2xl transform translate-y-full transition-transform duration-300 flex flex-col max-h-[85vh]">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div class="min-w-0">
          <h3 id="${POPUP_ID}-name" class="text-base font-bold text-foreground cjk-wrap truncate">--</h3>
          <span id="${POPUP_ID}-code" class="text-xs text-muted-foreground tabular-nowrap">--</span>
        </div>
        <button id="${POPUP_ID}-close" class="p-2 rounded-full hover:bg-muted transition-colors" aria-label="关闭">
          <i data-lucide="x" class="w-5 h-5 text-muted-foreground"></i>
        </button>
      </div>

      <!-- Price -->
      <div class="px-4 py-3 border-b border-border shrink-0">
        <div class="flex items-baseline gap-3">
          <span id="${POPUP_ID}-price" class="text-3xl font-bold tabular-nums">--</span>
          <span id="${POPUP_ID}-change" class="text-sm font-semibold tabular-nums">--</span>
          <span id="${POPUP_ID}-percent" class="text-sm font-semibold tabular-nums">--</span>
        </div>
      </div>

      <!-- Metrics -->
      <div class="grid grid-cols-3 gap-px bg-border border-b border-border shrink-0">
        <div class="bg-card p-2.5">
          <div class="text-[10px] text-muted-foreground mb-0.5">今开</div>
          <div id="${POPUP_ID}-open" class="text-sm font-semibold tabular-nums">--</div>
        </div>
        <div class="bg-card p-2.5">
          <div class="text-[10px] text-muted-foreground mb-0.5">最高</div>
          <div id="${POPUP_ID}-high" class="text-sm font-semibold tabular-nums">--</div>
        </div>
        <div class="bg-card p-2.5">
          <div class="text-[10px] text-muted-foreground mb-0.5">最低</div>
          <div id="${POPUP_ID}-low" class="text-sm font-semibold tabular-nums">--</div>
        </div>
        <div class="bg-card p-2.5">
          <div class="text-[10px] text-muted-foreground mb-0.5">昨收</div>
          <div id="${POPUP_ID}-prev" class="text-sm font-semibold tabular-nums">--</div>
        </div>
        <div class="bg-card p-2.5">
          <div class="text-[10px] text-muted-foreground mb-0.5">成交量</div>
          <div id="${POPUP_ID}-volume" class="text-sm font-semibold tabular-nums">--</div>
        </div>
        <div class="bg-card p-2.5">
          <div class="text-[10px] text-muted-foreground mb-0.5">成交额</div>
          <div id="${POPUP_ID}-turnover" class="text-sm font-semibold tabular-nums">--</div>
        </div>
      </div>

      <!-- Chart -->
      <div class="px-4 py-3 flex-1 overflow-y-auto min-h-0">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-medium text-foreground">分时走势</span>
          <span id="${POPUP_ID}-update" class="text-[10px] text-muted-foreground tabular-nowrap">--</span>
        </div>
        <div class="relative w-full h-[220px] bg-card rounded-lg border border-border overflow-hidden">
          <canvas id="${POPUP_ID}-chart" class="w-full h-full block"></canvas>
          <div id="${POPUP_ID}-empty" class="absolute inset-0 hidden items-center justify-center text-xs text-muted-foreground">
            暂无分时数据
          </div>
        </div>
        <div class="mt-2 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
          <span class="flex items-center gap-1"><span class="w-2 h-0.5 rounded-full" style="background-color: var(--brand-state-up);"></span>股价</span>
          <span class="flex items-center gap-1"><span class="w-2 h-0.5 rounded-full" style="background-color: var(--brand-primary);"></span>均价</span>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-4 py-2 bg-muted/50 text-[10px] text-muted-foreground text-center shrink-0">
        数据仅供参考，不构成投资建议
      </div>
    </div>
  `;

  document.body.appendChild(root);

  // Close interactions
  root.querySelector(`#${POPUP_ID}-close`).addEventListener('click', closeStockPopup);
  root.querySelector(`#${POPUP_ID}-backdrop`).addEventListener('click', closeStockPopup);
  root.addEventListener('click', (e) => {
    if (e.target === root) closeStockPopup();
  });
}

function getPopupEl(id) {
  return document.getElementById(`${POPUP_ID}-${id}`);
}

export function openStockPopup(code, fallbackName = '', market = '') {
  injectPopupOnce();

  const root = document.getElementById(POPUP_ID);
  const backdrop = document.getElementById(`${POPUP_ID}-backdrop`);
  const sheet = document.getElementById(`${POPUP_ID}-sheet`);

  root.classList.remove('hidden');
  root.classList.add('flex');
  document.body.style.overflow = 'hidden';

  // Trigger reflow for transition
  void root.offsetWidth;
  backdrop.classList.remove('opacity-0');
  backdrop.classList.add('opacity-100');
  sheet.classList.remove('translate-y-full');
  sheet.classList.add('translate-y-0');

  if (typeof lucide !== 'undefined') lucide.createIcons();

  loadDetail(code, fallbackName, market);
}

export function closeStockPopup() {
  const root = document.getElementById(POPUP_ID);
  if (!root) return;
  const backdrop = document.getElementById(`${POPUP_ID}-backdrop`);
  const sheet = document.getElementById(`${POPUP_ID}-sheet`);

  backdrop.classList.remove('opacity-100');
  backdrop.classList.add('opacity-0');
  sheet.classList.remove('translate-y-0');
  sheet.classList.add('translate-y-full');

  setTimeout(() => {
    root.classList.add('hidden');
    root.classList.remove('flex');
    document.body.style.overflow = '';
  }, 300);
}

let refreshTimer = null;

async function loadDetail(code, fallbackName, market) {
  const nameEl = getPopupEl('name');
  const codeEl = getPopupEl('code');
  const updateEl = getPopupEl('update');

  nameEl.textContent = fallbackName || code;
  codeEl.textContent = code;
  updateEl.textContent = '加载中…';

  try {
    const nameParam = fallbackName ? `&name=${encodeURIComponent(fallbackName)}` : '';
    const marketParam = market ? `&market=${encodeURIComponent(market)}` : '';
    const data = await getJSON(`/api/stock-detail?code=${encodeURIComponent(code)}${nameParam}${marketParam}`);
    renderDetail(data);
    scheduleRefresh(code, fallbackName, market);
  } catch (err) {
    console.warn('[stock-popup]', err.message);
    updateEl.textContent = '数据加载失败';
    renderStaticFallback(code, fallbackName);
  }
}

function scheduleRefresh(code, fallbackName, market) {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    const root = document.getElementById(POPUP_ID);
    if (!root || root.classList.contains('hidden')) {
      clearInterval(refreshTimer);
      refreshTimer = null;
      return;
    }
    loadDetail(code, fallbackName, market).catch(() => {});
  }, 5000);
}

function renderDetail(data) {
  const nameEl = getPopupEl('name');
  const codeEl = getPopupEl('code');
  const priceEl = getPopupEl('price');
  const changeEl = getPopupEl('change');
  const percentEl = getPopupEl('percent');
  const openEl = getPopupEl('open');
  const highEl = getPopupEl('high');
  const lowEl = getPopupEl('low');
  const prevEl = getPopupEl('prev');
  const volumeEl = getPopupEl('volume');
  const turnoverEl = getPopupEl('turnover');
  const updateEl = getPopupEl('update');

  nameEl.textContent = data.name || nameEl.textContent;
  codeEl.textContent = data.code || codeEl.textContent;

  const price = Number(data.price) || 0;
  const change = Number(data.change) || 0;
  const changePercent = Number(data.changePercent) || 0;
  const color = colorFor(change);
  const sign = change >= 0 ? '+' : '';

  priceEl.textContent = formatNumber(price, 2);
  priceEl.style.color = color;
  changeEl.textContent = `${sign}${formatNumber(change, 2)}`;
  changeEl.style.color = color;
  percentEl.textContent = `${sign}${formatNumber(changePercent, 2)}%`;
  percentEl.style.color = color;

  openEl.textContent = formatNumber(data.open, 2);
  highEl.textContent = formatNumber(data.high, 2);
  lowEl.textContent = formatNumber(data.low, 2);
  prevEl.textContent = formatNumber(data.prevClose, 2);
  volumeEl.textContent = formatVolume(data.volume);
  turnoverEl.textContent = formatVolume(data.turnover);

  const date = data.updatedAt ? new Date(data.updatedAt) : new Date();
  updateEl.textContent = `更新 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;

  const trends = Array.isArray(data.trends) ? data.trends : [];
  drawChart(trends, Number(data.prevClose) || 0);
}

function renderStaticFallback(code, fallbackName) {
  const updateEl = getPopupEl('update');
  updateEl.textContent = '本地示例数据，无实时分时图';
  drawChart([], 0);
}

function drawChart(trends, prevClose) {
  const canvas = document.getElementById(`${POPUP_ID}-chart`);
  const empty = document.getElementById(`${POPUP_ID}-empty`);
  if (!canvas) return;

  if (!trends || trends.length === 0) {
    canvas.style.display = 'none';
    empty.classList.remove('hidden');
    empty.classList.add('flex');
    return;
  }

  canvas.style.display = 'block';
  empty.classList.add('hidden');
  empty.classList.remove('flex');

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));

  const ctx = canvas.getContext('2d');
  ctx.resetTransform();
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const padding = { top: 20, right: 10, bottom: 24, left: 44 };
  const chartW = Math.max(1, width - padding.left - padding.right);
  const chartH = Math.max(1, height - padding.top - padding.bottom);

  ctx.clearRect(0, 0, width, height);

  const prices = trends.map(t => Number(t.price));
  const avgPrices = trends.map(t => Number(t.avgPrice));
  let min = Math.min(...prices, ...avgPrices, prevClose);
  let max = Math.max(...prices, ...avgPrices, prevClose);

  // Add padding around range
  const range = max - min || 1;
  min -= range * 0.08;
  max += range * 0.08;

  const upColor = getComputedStyle(document.documentElement).getPropertyValue('--brand-state-up').trim() || '#ef4444';
  const downColor = getComputedStyle(document.documentElement).getPropertyValue('--brand-state-down').trim() || '#22c55e';
  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim() || '#2563eb';
  const mutedColor = '#9ca3af';
  const gridColor = '#e5e7eb';
  const textColor = '#6b7280';

  const lastPrice = prices[prices.length - 1];
  const priceColor = lastPrice >= prevClose ? upColor : downColor;

  // Grid horizontal
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    const priceLabel = max - (max - min) * (i / 4);
    ctx.fillStyle = priceLabel >= prevClose ? upColor : downColor;
    ctx.font = '10px var(--brand-font-mono, monospace)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(priceLabel.toFixed(2), padding.left - 6, y);
  }

  // Grid vertical (time)
  const timeSteps = 4;
  for (let i = 0; i <= timeSteps; i++) {
    const x = padding.left + (chartW / timeSteps) * i;
    ctx.beginPath();
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, padding.top + chartH);
    ctx.stroke();

    const idx = Math.round((trends.length - 1) * (i / timeSteps));
    const time = trends[idx]?.time || '';
    ctx.fillStyle = textColor;
    ctx.font = '10px var(--brand-font-mono, monospace)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(time, x, padding.top + chartH + 6);
  }

  // Prev close reference line
  const yPrev = padding.top + chartH - ((prevClose - min) / (max - min)) * chartH;
  ctx.beginPath();
  ctx.strokeStyle = mutedColor;
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.moveTo(padding.left, yPrev);
  ctx.lineTo(width - padding.right, yPrev);
  ctx.stroke();
  ctx.setLineDash([]);

  // Price line
  drawPath(ctx, trends, min, max, chartW, chartH, padding, 'price', priceColor, false);
  // Avg price line
  drawPath(ctx, trends, min, max, chartW, chartH, padding, 'avgPrice', primaryColor, true);

  // Last price dot
  const last = trends[trends.length - 1];
  const lastX = padding.left + chartW;
  const lastY = padding.top + chartH - ((lastPrice - min) / (max - min)) * chartH;
  ctx.beginPath();
  ctx.fillStyle = priceColor;
  ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawPath(ctx, trends, min, max, chartW, chartH, padding, field, color, dashed) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  if (dashed) ctx.setLineDash([3, 3]);
  else ctx.setLineDash([]);

  trends.forEach((t, i) => {
    const x = padding.left + (chartW * i) / (trends.length - 1 || 1);
    const y = padding.top + chartH - ((Number(t[field]) - min) / (max - min)) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
}

export function initStockPopup() {
  injectPopupOnce();

  // Event delegation for any [data-stock] row
  document.addEventListener('click', (e) => {
    const row = e.target.closest('[data-stock]');
    if (!row) return;
    // Avoid triggering when tapping interactive children (buttons, links)
    if (e.target.closest('a, button')) return;

    const code = row.dataset.stock;
    if (!code) return;

    const nameNode = row.querySelector('.cjk-wrap') || row;
    const fallbackName = nameNode.textContent?.trim() || '';
    const market = row.dataset.market || '';
    openStockPopup(code, fallbackName, market);
  });

  // Escape to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeStockPopup();
  });
}
