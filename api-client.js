/**
 * 行情数据客户端
 * 优先调用本地 /api/* 接口；
 * 当部署在纯静态托管（无服务端）时，自动 fallback 到浏览器直连东方财富/腾讯公开接口。
 */

import {
  fetchIndexDirect,
  fetchLadderDirect,
  fetchSectorsDirect,
  fetchBrokenBoardsDirect,
  fetchDragonTigerDirect,
  fetchQuotesDirect,
  fetchSearchDirect,
  fetchStockDetailDirect
} from './market-data.js?v=1';

export const API_BASE = '';

export function pad(n) { return String(n).padStart(2, '0'); }

export function formatTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatNumber(n, d = 2) {
  if (n === undefined || n === null || Number.isNaN(Number(n))) return '--';
  return Number(n).toFixed(d);
}

export function colorFor(change) {
  return Number(change) >= 0 ? 'var(--brand-state-up)' : 'var(--brand-state-down)';
}

function isFileProtocol() {
  return typeof window !== 'undefined' && window.location.protocol === 'file:';
}

async function getJSON(path) {
  if (isFileProtocol()) {
    throw new Error('local file protocol: keep static data');
  }
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchIndex() {
  try { return await getJSON('/api/index'); } catch (e) { return fetchIndexDirect(); }
}

export async function fetchLadder() {
  try { return await getJSON('/api/ladder'); } catch (e) { return fetchLadderDirect(); }
}

export async function fetchSectors() {
  try { return await getJSON('/api/sectors'); } catch (e) { return fetchSectorsDirect(); }
}

export async function fetchBrokenBoards() {
  try { return await getJSON('/api/broken-boards'); } catch (e) { return fetchBrokenBoardsDirect(); }
}

export async function fetchDragonTiger() {
  try { return await getJSON('/api/dragon-tiger'); } catch (e) { return fetchDragonTigerDirect(); }
}

export async function fetchStockDetail(code) {
  try { return await getJSON(`/api/stock-detail?code=${encodeURIComponent(code)}`); } catch (e) { return fetchStockDetailDirect(code); }
}

export async function fetchQuotes(codes) {
  let codeList, marketList, marketArr;
  if (Array.isArray(codes) && codes.length > 0 && typeof codes[0] === 'object') {
    codeList = codes.map((i) => i.code).join(',');
    marketArr = codes.map((i) => i.market || '');
    marketList = marketArr.join(',');
  } else {
    const list = Array.isArray(codes) ? codes : String(codes || '').split(',').map((c) => c.trim()).filter(Boolean);
    if (list.length === 0) return { list: [] };
    codeList = list.join(',');
    marketArr = [];
    marketList = '';
  }
  try {
    return await getJSON(`/api/quotes?codes=${encodeURIComponent(codeList)}&markets=${encodeURIComponent(marketList)}`);
  } catch (e) {
    return fetchQuotesDirect(codeList.split(','), marketArr);
  }
}

export async function fetchSearch(keyword) {
  try { return await getJSON(`/api/search?keyword=${encodeURIComponent(keyword)}`); } catch (e) { return fetchSearchDirect(keyword); }
}

export function renderIndexTicker(data) {
  if (!data) return;
  const indices = data.indices || [data];
  const container = document.getElementById('index-ticker');
  if (!container) return;

  container.querySelectorAll('.index-item').forEach((item) => {
    const nameEl = item.querySelector('.index-name');
    const matchName = nameEl ? nameEl.textContent.trim() : item.dataset.index;
    const idx = indices.find((i) => i.name === matchName || i.code === item.dataset.code);
    if (!idx) return;

    const color = colorFor(idx.change);
    const valueEl = item.querySelector('.index-value');
    const changeEl = item.querySelector('.index-change');
    const arrowEl = item.querySelector('.index-arrow');

    if (valueEl) {
      valueEl.style.color = color;
      valueEl.textContent = formatNumber(idx.value);
    }
    if (changeEl) {
      changeEl.style.color = color;
      const sign = idx.change >= 0 ? '+' : '';
      changeEl.textContent = `${sign}${formatNumber(idx.change)} ${sign}${formatNumber(idx.changePercent)}%`;
    }
    if (arrowEl) {
      arrowEl.style.color = color;
      arrowEl.textContent = idx.change >= 0 ? '↑' : '↓';
    }
  });
}

function renderTags(concepts) {
  return String(concepts || '其他')
    .split(' ')
    .filter(Boolean)
    .map((c) => `<span class="px-1 py-0.5 rounded-sm text-[10px] font-medium bg-state-up-bg" style="color: var(--brand-state-up);">${c}</span>`)
    .join('');
}

export function renderLadder(data) {
  const container = document.getElementById('ladder-view');
  if (!container || !data || !data.boards || data.boards.length === 0) return;

  // 当服务端只能拿到 clist 回退数据时，无法区分真实连板数，保留静态示例
  if (data.source === 'clist') return;

  const LIMIT = 8;
  container.innerHTML = '';
  data.boards.forEach((board) => {
    const total = board.stocks.length;
    const article = document.createElement('article');
    article.className = 'bg-card rounded-lg border border-border shadow-sm overflow-hidden';
    article.setAttribute('data-board', board.count);
    article.setAttribute('data-expanded', 'false');
    article.setAttribute('data-limit', String(LIMIT));

    const rowsHtml = board.stocks.map((s, idx) => {
      const hiddenClass = idx >= LIMIT ? 'ladder-row collapse-hidden' : 'ladder-row';
      return `
        <div class="px-3 py-2.5 flex items-center justify-between gap-2 ${hiddenClass}" data-stock="${s.code}" data-change="${s.changePercent}" data-concepts="${s.concept || '其他'}">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-sm font-bold text-foreground cjk-wrap">${s.name}</span>
            ${renderTags(s.concept)}
          </div>
          <div class="flex items-center gap-3 flex-shrink-0">
            <span class="text-xs text-muted-foreground tabular-nowrap">${s.firstTime}</span>
            <span class="text-sm font-bold tabular-nums" style="color: var(--brand-state-up);">+${formatNumber(s.changePercent, 2)}%</span>
          </div>
        </div>
      `;
    }).join('');

    const moreBtn = total > LIMIT ? `
      <button class="ladder-more-btn w-full px-3 py-2 text-xs font-medium text-primary bg-primary-50 border-t border-border flex items-center justify-center gap-1" data-total="${total}" data-limit="${LIMIT}">
        <span>展开更多</span>
        <span class="text-muted-foreground">(${total - LIMIT})</span>
      </button>
    ` : '';

    article.innerHTML = `
      <div class="px-3 py-2 bg-primary-50 border-b border-border flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="inline-flex items-center justify-center w-7 h-7 rounded-md text-sm font-bold text-primary-foreground" style="background-color: var(--brand-state-up);">${board.count === 1 ? '首' : board.count}</span>
          <span class="text-sm font-semibold text-foreground">${board.label}</span>
        </div>
        <span class="text-xs text-muted-foreground">${total} 只</span>
      </div>
      <div class="divide-y divide-border" data-board-rows="${board.count}">
        ${rowsHtml}
      </div>
      ${moreBtn}
    `;
    container.appendChild(article);
  });
}

export function renderSectors(data) {
  if (!data || !data.sectors) return;
  const industryPanel = document.getElementById('industry-panel');
  if (industryPanel) {
    industryPanel.innerHTML = '';
    data.sectors.forEach((sector) => {
      const article = document.createElement('article');
      article.className = 'bg-card rounded-lg border border-border shadow-sm overflow-hidden';
      article.setAttribute('data-sector-group', sector.name);
      article.innerHTML = `
        <div class="px-3 py-2 bg-primary-50 border-b border-border flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-foreground cjk-wrap">${sector.name}</span>
          </div>
          <span class="text-xs text-muted-foreground">${sector.stocks.length} 只</span>
        </div>
        <div class="divide-y divide-border" data-sector-rows="${sector.name}">
          ${sector.stocks.map((s) => `
            <div class="px-3 py-2.5 flex items-center justify-between gap-2" data-stock="${s.code}" data-change="${s.changePercent}">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-sm font-bold text-foreground cjk-wrap">${s.name}</span>
              </div>
              <div class="flex items-center gap-3 flex-shrink-0">
                <span class="text-xs text-muted-foreground tabular-nowrap">${s.firstTime}</span>
                <span class="px-1.5 py-0.5 rounded-sm text-[10px] font-semibold bg-state-up-bg" style="color: var(--brand-state-up);">${s.boards === 1 ? '首板' : s.boards + '板'}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      industryPanel.appendChild(article);
    });
  }

  const stockList = document.querySelector('[data-stock-list]');
  if (stockList && data.sectors) {
    stockList.innerHTML = '';
    const all = data.sectors.flatMap((s) => s.stocks);
    all.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'px-3 py-2.5 flex items-center justify-between gap-2';
      row.setAttribute('data-stock', s.code);
      row.setAttribute('data-change', s.changePercent);
      row.setAttribute('data-concepts', s.concept || '其他');
      row.innerHTML = `
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-sm font-bold text-foreground cjk-wrap">${s.name}</span>
          ${renderTags(s.concept)}
        </div>
        <div class="flex items-center gap-3 flex-shrink-0">
          <span class="text-xs text-muted-foreground tabular-nowrap">${s.firstTime}</span>
          <span class="px-1.5 py-0.5 rounded-sm text-[10px] font-semibold bg-state-up-bg" style="color: var(--brand-state-up);">${s.boards === 1 ? '首板' : s.boards + '板'}</span>
        </div>
      `;
      stockList.appendChild(row);
    });
  }
}

export function updateTickTime() {
  const t = formatTime(new Date());
  const header = document.getElementById('tick-time');
  const footer = document.getElementById('footer-tick-time');
  if (header) header.textContent = t;
  if (footer) footer.textContent = t;
}

export function wiggleStocks() {
  document.querySelectorAll('[data-stock]').forEach((row) => {
    const base = parseFloat(row.dataset.change) || 0;
    const w = (Math.random() - 0.5) * 0.08;
    const nc = Math.max(-10, Math.min(20, base + w));
    const el = row.querySelector('span:last-child');
    if (!el) return;
    el.style.color = colorFor(nc);
    const sign = nc >= 0 ? '+' : '';
    const suffix = el.textContent.includes('板') ? '' : '%';
    if (!el.textContent.includes('板')) {
      el.textContent = `${sign}${formatNumber(nc, 2)}%`;
      el.style.color = colorFor(nc);
    }
  });
}
