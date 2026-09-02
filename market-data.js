/**
 * 浏览器端直接行情数据获取（备用方案）
 * 当页面部署在纯静态托管（无 /api 服务）时，直接从东方财富/腾讯公开接口拉取数据。
 * 所有接口均通过浏览器可直接访问的 JSONP / 跨域脚本方式获取。
 */

export function pad(n) { return String(n).padStart(2, '0'); }

export function formatDate(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

export function formatDashDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getPreviousTradeDates(baseDate, count = 5) {
  const dates = [];
  const d = new Date(baseDate);
  while (dates.length < count) {
    d.setDate(d.getDate() - 1);
    const day = d.getDay();
    // A股周末休市
    if (day !== 0 && day !== 6) {
      dates.push(formatDashDate(d));
    }
  }
  return dates;
}

function normalizeTradeDate(tradeDate) {
  return String(tradeDate || '').split(' ')[0];
}

export function parseScaled(v, scale = 100) {
  if (v === undefined || v === null || v === '-' || v === '') return 0;
  return Number(v) / scale;
}

export function parseRaw(v) {
  if (v === undefined || v === null || v === '-' || v === '') return 0;
  return Number(v);
}

export function formatHm(t) {
  const s = String(t).padStart(6, '0');
  return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
}

const CONCEPT_MAP = {
  '000017': '黄金', '603178': '数字货币', '603269': '资产重组',
  '605118': '医药', '002796': '通信 5G', '603013': '汽车零部件',
  '000953': '化工', '002094': '跨境支付', '000750': '大金融',
  '002385': '大农业', '603933': '国产芯片', '300502': '光通信',
  '002436': 'PCB板', '000938': '中字头', '002897': '光通信',
  '603160': '国产芯片', '300308': '光通信 CPO', '002156': '国产芯片'
};

function inferConcept(code, name) {
  if (CONCEPT_MAP[code]) return CONCEPT_MAP[code];
  if (/芯|半导体|集成/.test(name)) return '国产芯片';
  if (/药|医|生物/.test(name)) return '医药';
  if (/通信|光|5G|网络/.test(name)) return '通信';
  if (/农业|饲料|种植/.test(name)) return '农业';
  if (/银行|证券|保险|金融/.test(name)) return '大金融';
  if (/车|汽配|轮胎/.test(name)) return '汽车零部件';
  return '其他';
}

function isHighLimitBoard(code) {
  const c = String(code);
  if (/^688/.test(c)) return true;
  if (/^300|^301/.test(c)) return true;
  if (/^8|^4|^43/.test(c)) return true;
  return false;
}

function limitUpThreshold(code) {
  return isHighLimitBoard(code) ? 19.9 : 9.9;
}

const INDEX_CONFIG = [
  { name: '上证指数', code: '000001', secid: '1.000001' },
  { name: '创业板指', code: '399006', secid: '0.399006' },
  { name: '科创50', code: '000688', secid: '1.000688' }
];

/* ---------- JSONP helpers ---------- */

function jsonpFetch(url) {
  return new Promise((resolve, reject) => {
    const cb = 'emcb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const script = document.createElement('script');
    const sep = url.includes('?') ? '&' : '?';
    script.src = `${url}${sep}cb=${cb}`;
    script.async = true;

    const cleanup = () => {
      if (script.parentNode) script.parentNode.removeChild(script);
      try { delete window[cb]; } catch (e) { window[cb] = undefined; }
    };

    window[cb] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('JSONP load failed: ' + url));
    };

    script.onabort = () => {
      cleanup();
      reject(new Error('JSONP aborted: ' + url));
    };

    document.head.appendChild(script);
  });
}

async function emFetchJson(url) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const clean = text.trim();
    const json = clean.startsWith('(') ? clean.slice(1, -1) : clean;
    return JSON.parse(json);
  } catch (e) {
    return jsonpFetch(url);
  }
}

/* ---------- Tencent quote helpers ---------- */

function marketForCode(code) {
  const c = String(code);
  if (/^6/.test(c)) return '1';
  return '0';
}

function tencentSymbol(code, market) {
  const c = String(code);
  if (market === '1' || /^6|^689/.test(c)) return 'sh' + c;
  if (market === '2' || /^4|^8|^43/.test(c)) return 'bj' + c;
  if (market === '0') return 'sz' + c;
  if (/^000001$|^000688$|^999/.test(c)) return 'sh' + c;
  return 'sz' + c;
}

function tencentVarName(code, market) {
  return 'v_' + tencentSymbol(code, market);
}

function parseTencentQuote(text, code, knownName, market) {
  const symbol = tencentSymbol(code, market);
  const pattern = new RegExp(`v_${symbol}="([^"]*)"`);
  const match = text.match(pattern);
  if (!match) throw new Error(`tencent quote not found for ${code} (${symbol})`);
  const fields = match[1].split('~');

  const price = parseRaw(fields[3]);
  const prevClose = parseRaw(fields[4]);
  const open = parseRaw(fields[5]);
  const change = parseRaw(fields[31]);
  const changePercent = parseRaw(fields[32]);
  const high = parseRaw(fields[33]);
  const low = parseRaw(fields[34]);
  const volume = parseRaw(fields[36]);
  const turnover = parseRaw(fields[37]);

  return {
    code,
    name: knownName || fields[1] || code,
    price,
    prevClose,
    change: Number.isFinite(change) ? change : (price - prevClose),
    changePercent: Number.isFinite(changePercent) ? changePercent : (prevClose ? ((price - prevClose) / prevClose) * 100 : 0),
    open,
    high,
    low,
    volume,
    turnover,
    updatedAt: new Date().toISOString(),
    source: 'tencent'
  };
}

function loadTencentScript(symbols) {
  return new Promise((resolve, reject) => {
    const url = 'https://qt.gtimg.cn/q=' + encodeURIComponent(symbols);
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Tencent script load failed'));
    document.head.appendChild(script);
  });
}

async function fetchTencentQuotes(codes, nameMap, marketMap) {
  if (codes.length === 0) return [];
  const symbols = codes.map((c) => tencentSymbol(c, marketMap && marketMap[c])).join(',');
  await loadTencentScript(symbols);
  // 批量接口返回的是 GBK 字节，但数值字段和代码不受编码影响；
  // 名称我们使用已知名称或代码本身，避免编码解析问题。
  const globalText = Object.keys(window)
    .filter((k) => k.startsWith('v_'))
    .map((k) => `${k}="${window[k]}";`)
    .join('\n');

  return codes.map((code) => {
    try {
      return parseTencentQuote(globalText, code, nameMap && nameMap[code], marketMap && marketMap[code]);
    } catch (e) {
      console.warn(`[tencent:${code}]`, e.message);
      return { code, name: (nameMap && nameMap[code]) || code, price: 0, prevClose: 0, change: 0, changePercent: 0, error: e.message };
    }
  });
}

/* ---------- Eastmoney limit-up / sector helpers ---------- */

function mapZTItem(item) {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    if (item.c !== undefined) {
      const code = String(item.c || '');
      const name = item.n || '';
      return {
        code,
        market: item.m,
        name,
        price: parseRaw(item.p) / 1000,
        change: 0,
        changePercent: parseRaw(item.zdp),
        firstTime: formatHm(item.fbt || 93000),
        lastTime: formatHm(item.lbt || 93000),
        blockAmount: parseRaw(item.fund) / 10000,
        blockVolume: parseRaw(item.amount),
        boards: Number(item.lbc || 1),
        concept: item.hybk || inferConcept(code, name)
      };
    }
    const code = String(item.f12 || '');
    const name = item.f14 || '';
    return {
      code,
      market: item.f13,
      name,
      price: parseScaled(item.f2),
      change: parseScaled(item.f4),
      changePercent: parseScaled(item.f3),
      firstTime: formatHm(item.f34 || 93000),
      lastTime: formatHm(item.f35 || 93000),
      blockAmount: item.f62 || 0,
      blockVolume: item.f52 || 0,
      boards: Number(item.f32 || 1),
      concept: inferConcept(code, name)
    };
  }
  const code = String(item[1] || '');
  const name = item[3] || '';
  const industry = item[15] || '';
  return {
    code,
    market: item[2],
    name,
    price: parseRaw(item[4]) / 1000,
    change: 0,
    changePercent: parseRaw(item[5]) / 100,
    firstTime: formatHm(item[11] || 93000),
    lastTime: formatHm(item[12] || 93000),
    blockAmount: parseRaw(item[13]) / 10000,
    blockVolume: item[14] || 0,
    boards: Number(item[10] || 1),
    concept: industry || inferConcept(code, name)
  };
}

function mapClistItem(item) {
  const code = String(item.f12 || '');
  const name = item.f14 || '';
  return {
    code,
    market: item.f13,
    name,
    price: parseRaw(item.f2),
    change: parseRaw(item.f4),
    changePercent: parseRaw(item.f3),
    firstTime: '09:30',
    lastTime: '09:30',
    blockAmount: parseRaw(item.f6) / 10000,
    blockVolume: parseRaw(item.f5),
    boards: 1,
    concept: inferConcept(code, name)
  };
}

function mapZBItem(item) {
  const price = parseScaled(item.p, 1000);
  const limitUpPrice = parseScaled(item.ztp, 1000);
  return {
    code: String(item.c || ''),
    market: item.m,
    name: item.n || '',
    price,
    limitUpPrice,
    changePercent: parseRaw(item.zdp),
    breakGap: limitUpPrice - price,
    breakCount: Number(item.zbc || 0),
    firstBreakTime: formatHm(item.fbt || 0),
    amount: Number(item.amount || 0) / 10000,
    turnoverRate: Number(item.hs || 0),
    industry: item.hybk || '其他'
  };
}

function buildLadder(stocks) {
  const groups = {};
  stocks.forEach((s) => {
    const b = s.boards || 1;
    if (!groups[b]) groups[b] = [];
    groups[b].push(s);
  });
  const counts = Object.keys(groups).map(Number).sort((a, b) => b - a);
  return counts.map((c) => ({
    count: c,
    label: c === 1 ? '首板' : `${c}板`,
    stocks: groups[c]
  }));
}

function buildSectors(stocks) {
  const groups = {};
  stocks.forEach((s) => {
    String(s.concept || '其他').split(' ').forEach((concept) => {
      if (!groups[concept]) groups[concept] = [];
      groups[concept].push(s);
    });
  });
  return Object.entries(groups)
    .map(([name, items]) => ({ name, stocks: items }))
    .sort((a, b) => b.stocks.length - a.stocks.length);
}

/* ---------- Public APIs ---------- */

export async function fetchIndexDirect() {
  const codes = INDEX_CONFIG.map((c) => c.code);
  const nameMap = {};
  const marketMap = {};
  INDEX_CONFIG.forEach((c) => { nameMap[c.code] = c.name; marketMap[c.code] = c.secid.split('.')[0]; });
  const list = await fetchTencentQuotes(codes, nameMap, marketMap);
  return {
    indices: INDEX_CONFIG.map((cfg) => {
      const q = list.find((x) => x.code === cfg.code) || {};
      return {
        name: cfg.name,
        code: cfg.code,
        value: q.price || 0,
        prevClose: q.prevClose || 0,
        change: q.change || 0,
        changePercent: q.changePercent || 0,
        updatedAt: q.updatedAt || new Date().toISOString(),
        source: 'tencent'
      };
    }),
    updatedAt: new Date().toISOString()
  };
}

export async function fetchLimitUpStocksDirect() {
  try {
    const date = formatDate(new Date());
    const target = `https://push2ex.eastmoney.com/getTopicZTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=500&sort=fbt:asc&date=${date}`;
    const res = await emFetchJson(target);
    const pool = (res.data && res.data.pool) || [];
    if (pool.length > 0) {
      return { stocks: pool.map(mapZTItem), source: 'zt' };
    }
  } catch (e) {
    console.warn('[zt-pool direct]', e.message);
  }

  try {
    const target = 'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=500&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:13,m:1+t:2,m:1+t:23&fields=f12,f13,f14,f2,f3,f4,f5,f6,f7,f8';
    const res = await emFetchJson(target);
    const diff = (res.data && res.data.diff) || [];
    return {
      stocks: diff.filter((item) => parseRaw(item.f3) >= limitUpThreshold(item.f12)).map(mapClistItem),
      source: 'clist'
    };
  } catch (e) {
    console.warn('[clist direct]', e.message);
    return { stocks: [], source: 'none', error: e.message };
  }
}

export async function fetchLadderDirect() {
  const { stocks, source } = await fetchLimitUpStocksDirect();
  return {
    stocks,
    boards: buildLadder(stocks),
    source,
    updatedAt: new Date().toISOString()
  };
}

export async function fetchSectorsDirect() {
  const { stocks } = await fetchLimitUpStocksDirect();
  return {
    sectors: buildSectors(stocks),
    updatedAt: new Date().toISOString()
  };
}

export async function fetchBrokenBoardsDirect() {
  try {
    const date = formatDate(new Date());
    const target = `https://push2ex.eastmoney.com/getTopicZBPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=200&sort=fbt:asc&date=${date}`;
    const res = await emFetchJson(target);
    const pool = (res.data && res.data.pool) || [];
    return {
      stocks: pool.map(mapZBItem),
      updatedAt: new Date().toISOString()
    };
  } catch (e) {
    console.warn('[zb-pool direct]', e.message);
    return { stocks: [], error: e.message, updatedAt: new Date().toISOString() };
  }
}

export async function fetchDragonTigerDirect() {
  try {
    const today = formatDashDate(new Date());
    const candidates = [today, ...getPreviousTradeDates(new Date(), 5)];

    for (const date of candidates) {
      const target = `https://datacenter-web.eastmoney.com/api/data/v1/get?sortColumns=NET_BUY_AMT,TRADE_DATE,SECURITY_CODE&sortTypes=-1,-1,1&pageSize=100&pageNumber=1&reportName=RPT_ORGANIZATION_TRADE_DETAILS&columns=ALL&source=WEB&client=WEB&filter=(TRADE_DATE%3E=%27${date}%27)`;
      const res = await fetch(target, { mode: 'cors' }).then((r) => r.json());
      const rows = ((res.result && res.result.data) || [])
        .filter((item) => normalizeTradeDate(item.TRADE_DATE) === date);
      if (rows.length === 0) continue;

      const map = new Map();
      rows.forEach((item) => {
        const code = item.SECURITY_CODE;
        const net = Number(item.NET_BUY_AMT || 0);
        if (!map.has(code)) {
          map.set(code, {
            code,
            name: item.SECURITY_NAME_ABBR,
            close: Number(item.CLOSE_PRICE || 0),
            changePercent: Number(item.CHANGE_RATE || 0),
            buyTimes: Number(item.BUY_TIMES || 0),
            sellTimes: Number(item.SELL_TIMES || 0),
            netBuyAmt: 0,
            accumAmount: Number(item.ACCUM_AMOUNT || 0) / 10000,
            turnoverRate: Number(item.TURNOVERRATE || 0),
            explanations: new Set(),
            tradeDate: item.TRADE_DATE
          });
        }
        const rec = map.get(code);
        rec.netBuyAmt += net / 10000;
        if (item.EXPLANATION) rec.explanations.add(item.EXPLANATION);
      });
      const list = Array.from(map.values())
        .map((r) => ({ ...r, explanations: Array.from(r.explanations) }))
        .sort((a, b) => b.netBuyAmt - a.netBuyAmt);
      return { list, updatedAt: new Date().toISOString(), tradeDate: date };
    }

    return { list: [], updatedAt: new Date().toISOString(), tradeDate: today };
  } catch (e) {
    console.warn('[dragon-tiger direct]', e.message);
    return { list: [], error: e.message, updatedAt: new Date().toISOString() };
  }
}

export async function fetchQuotesDirect(codes, markets) {
  const list = Array.isArray(codes) ? codes : String(codes || '').split(',').map((c) => c.trim()).filter(Boolean);
  if (list.length === 0) return { list: [], updatedAt: new Date().toISOString() };
  const marketMap = {};
  list.forEach((code, idx) => { marketMap[code] = (markets && markets[idx]) || ''; });
  try {
    const data = await fetchTencentQuotes(list, undefined, marketMap);
    return { list: data, updatedAt: new Date().toISOString() };
  } catch (e) {
    console.warn('[quotes direct]', e.message);
    return { list: [], error: e.message, updatedAt: new Date().toISOString() };
  }
}

export async function fetchSearchDirect(keyword) {
  try {
    const target = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(keyword)}&type=14&count=10`;
    const res = await emFetchJson(target);
    const data = (res && res.QuotationCodeTable && res.QuotationCodeTable.Data) || [];
    return {
      list: data.map((item) => ({
        code: item.Code,
        name: item.Name,
        market: item.MktNum,
        pinyin: item.PinYin,
        type: item.SecurityTypeName
      }))
    };
  } catch (e) {
    console.warn('[search direct]', e.message);
    return { list: [], error: e.message };
  }
}

export async function fetchStockDetailDirect(code, knownName, market) {
  try {
    const symbols = tencentSymbol(code, market);
    await loadTencentScript(symbols);
    const varName = tencentVarName(code, market);
    const text = `${varName}="${window[varName]}";`;
    const detail = parseTencentQuote(text, code, knownName, market);

    const emMarket = market || marketForCode(code);
    const secid = `${emMarket}.${code}`;
    const trendsUrl = `https://push2.eastmoney.com/api/qt/stock/trends2/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&ndays=1&iscr=0&iscca=0`;
    let trends = [];
    try {
      const trendsRes = await emFetchJson(trendsUrl);
      const td = (trendsRes && trendsRes.data) || {};
      trends = (td.trends || []).map((t) => {
        const parts = String(t).split(',');
        const rawTime = parts[0] || '';
        const time = rawTime.length >= 5 ? rawTime.slice(-5) : rawTime;
        return {
          time,
          price: parseRaw(parts[1]),
          avgPrice: parseRaw(parts[2]),
          volume: parseRaw(parts[3]),
          turnover: parseRaw(parts[4])
        };
      });
    } catch (e) {
      console.warn('[stock-detail:trends direct]', e.message);
    }
    return { ...detail, trends };
  } catch (e) {
    console.warn('[stock-detail direct]', e.message);
    return {
      code,
      name: knownName || code,
      price: 0, prevClose: 0, change: 0, changePercent: 0,
      open: 0, high: 0, low: 0, volume: 0, turnover: 0,
      trends: [],
      error: e.message,
      updatedAt: new Date().toISOString()
    };
  }
}
