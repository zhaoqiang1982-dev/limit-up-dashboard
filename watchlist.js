/**
 * 自选股本地存储与交互模块
 * - 使用 localStorage 持久化
 * - 提供 star 按钮渲染、切换、同步状态
 * - 在自选股页面轮询行情
 */

const STORAGE_KEY = 'limitup_watchlist_v1';

function getList() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('[watchlist] read error', e);
    return [];
  }
}

function saveList(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function getWatchlist() {
  return getList();
}

export function isWatched(code) {
  if (!code) return false;
  return getList().some((item) => String(item.code) === String(code));
}

function inferMarket(code) {
  const c = String(code);
  if (/^6|^689/.test(c)) return '1';
  if (/^4|^8|^43/.test(c)) return '2';
  return '0';
}

export function addWatch(code, name, market) {
  const list = getList();
  const key = String(code);
  if (list.some((item) => String(item.code) === key)) return list;
  const next = [...list, { code: key, name: name || key, market: market || inferMarket(key), addedAt: Date.now() }];
  saveList(next);
  syncStarButtons(key, true);
  return next;
}

export function removeWatch(code) {
  const key = String(code);
  const next = getList().filter((item) => String(item.code) !== key);
  saveList(next);
  syncStarButtons(key, false);
  return next;
}

export function toggleWatch(code, name, market) {
  if (isWatched(code)) {
    return { list: removeWatch(code), added: false };
  }
  return { list: addWatch(code, name, market), added: true };
}

function syncStarButtons(code, active) {
  document.querySelectorAll(`.watchlist-star[data-stock="${code}"]`).forEach((btn) => {
    updateStarButton(btn, active);
  });
}

function updateStarButton(btn, active) {
  btn.dataset.active = String(active);
  const icon = btn.querySelector('[data-lucide]') || btn;
  if (active) {
    btn.classList.add('text-state-up');
    btn.classList.remove('text-muted-foreground');
    btn.setAttribute('aria-label', '已从自选');
    icon.setAttribute('data-lucide', 'star');
  } else {
    btn.classList.remove('text-state-up');
    btn.classList.add('text-muted-foreground');
    btn.setAttribute('aria-label', '加入自选');
    icon.setAttribute('data-lucide', 'star-off');
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

export function createStarButton(code, name, market, opts = {}) {
  const active = isWatched(code);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `watchlist-star inline-flex items-center justify-center p-1 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${active ? 'text-state-up' : 'text-muted-foreground'}`;
  btn.dataset.stock = code;
  btn.dataset.name = name || code;
  btn.dataset.market = market || '';
  btn.dataset.active = String(active);
  btn.setAttribute('aria-label', active ? '已从自选' : '加入自选');
  btn.innerHTML = `<i data-lucide="${active ? 'star' : 'star-off'}" class="w-4 h-4"></i>`;
  if (!opts.noClick) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const res = toggleWatch(code, name, market);
      updateStarButton(btn, res.added);
    });
  }
  return btn;
}

/**
 * 在指定的容器内为所有 [data-stock] 行末尾追加 star 按钮
 * @param {HTMLElement} container
 * @param {object} options
 *   - selector: 要附加按钮的行的选择器（默认 '[data-stock]'
 *   - getName: (row) => string 默认读取 row.dataset.name 或行内第一个 cjk-wrap
 *   - getMarket: (row) => string 默认读取 row.dataset.market
 */
export function attachStarButtons(container, options = {}) {
  if (!container) return;
  const rows = container.querySelectorAll(options.selector || '[data-stock]');
  rows.forEach((row) => {
    if (row.querySelector('.watchlist-star')) return;
    const code = row.dataset.stock;
    if (!code) return;
    const getName = options.getName || (() => row.dataset.name || row.querySelector('.cjk-wrap')?.textContent?.trim() || code);
    const getMarket = options.getMarket || (() => row.dataset.market || '');
    const right = row.querySelector('.flex-shrink-0') || row.lastElementChild;
    if (!right) return;
    const btn = createStarButton(code, getName(row), getMarket(row));
    right.appendChild(btn);
  });
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * 页面初始化：点击 [data-stock] 行打开弹窗已有独立逻辑；
 * star 按钮需要阻止冒泡，上面已处理。
 */
export function initWatchlistStars(container) {
  if (!container) return;
  attachStarButtons(container);
}

/**
 * 渲染自选股列表到容器
 */
export function renderWatchlistTable(list, quotes, container) {
  if (!container) return;
  if (list.length === 0) {
    container.innerHTML = `
      <section class="px-4 py-12 text-center" aria-live="polite">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-3">
          <i data-lucide="star-off" class="w-6 h-6 text-muted-foreground"></i>
        </div>
        <h2 class="text-base font-semibold text-foreground mb-1">暂无自选股</h2>
        <p class="text-sm text-muted-foreground">在其他页面点击 ☆ 即可加入自选。</p>
      </section>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  const quoteMap = new Map();
  (quotes || []).forEach((q) => quoteMap.set(String(q.code), q));

  const rows = list.map((item) => {
    const q = quoteMap.get(String(item.code)) || {};
    const price = q.price ?? 0;
    const prevClose = q.prevClose ?? 0;
    const change = q.change ?? (price - prevClose);
    const changePercent = q.changePercent ?? (prevClose ? (change / prevClose) * 100 : 0);
    const color = change >= 0 ? 'var(--brand-state-up)' : 'var(--brand-state-down)';
    const sign = change >= 0 ? '+' : '';
    const priceText = price ? price.toFixed(2) : '--';
    const pctText = price ? `${sign}${changePercent.toFixed(2)}%` : '--';
    const changeText = price ? `${sign}${change.toFixed(2)}` : '--';
    return `
      <div class="px-3 py-3 flex items-center justify-between gap-3 bg-card border-b border-border" data-stock="${item.code}" data-name="${item.name || item.code}" data-market="${item.market || ''}" data-change="${changePercent}">
        <div class="flex items-center gap-3 min-w-0">
          <button type="button" class="watchlist-remove inline-flex items-center justify-center p-1 rounded-md text-muted-foreground hover:text-destructive transition-colors" data-stock="${item.code}" aria-label="删除">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
          <div class="min-w-0">
            <div class="text-sm font-bold text-foreground cjk-wrap">${item.name || item.code}</div>
            <div class="text-xs text-muted-foreground tabular-nums">${item.code}</div>
          </div>
        </div>
        <div class="flex items-center gap-4 flex-shrink-0">
          <div class="text-right">
            <div class="text-base font-bold tabular-nums" style="color: ${color};">${priceText}</div>
            <div class="text-xs font-medium tabular-nums" style="color: ${color};">${changeText} ${pctText}</div>
          </div>
          <i data-lucide="chevron-right" class="w-4 h-4 text-muted-foreground"></i>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = rows;

  container.querySelectorAll('.watchlist-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeWatch(btn.dataset.stock);
      const row = btn.closest('[data-stock]');
      if (row) row.remove();
      if (container.children.length === 0) {
        renderWatchlistTable([], [], container);
      }
    });
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}
