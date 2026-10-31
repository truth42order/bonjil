// 본질 학습법 — 게임 엔진 (MVP). 문제는 data/*.json에서 읽습니다.
const KEY = 'bonjil.v1';
const TYPES = ['choice', 'number', 'group', 'oddOneOut', 'why'];
const app = document.getElementById('app');
let stages = [];
let S = null; // 현재 플레이 상태 {stage, questions, i, score, answers}

// ---------- 저장 ----------
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { stages: {}, last: null }; } catch { return { stages: {}, last: null }; } }
function save(p) { localStorage.setItem(KEY, JSON.stringify(p)); }
function stageProg(p, id) { return p.stages[id] ||= { best: 0, total: 0, completed: [] }; }

// ---------- 유틸 ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function h(html) {
  app.innerHTML = html; window.scrollTo(0, 0);
  const bar = app.querySelector('.pinbar'); app.classList.toggle('has-pin', !!bar);
  if (bar) fitPin(bar);
}
// 하단 고정 바 높이를 재서 내용 아래 여백으로 설정(+16px 간격)
let pinRO = null;
function fitPin(bar) {
  const set = () => app.style.setProperty('--pin-space', (bar.getBoundingClientRect().height + 16) + 'px');
  set(); if (pinRO) pinRO.disconnect();
  if ('ResizeObserver' in window) { pinRO = new ResizeObserver(set); pinRO.observe(bar); }
}
// 유리 디자인 확인 창. 결과: true = 확인 버튼, false = 취소/Esc/바깥 누름
function modal({ title, body = '', ok = '확인', cancel = '취소', danger = false }) {
  return new Promise(res => {
    const prev = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'modal-back';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt" aria-describedby="mb">
      <h3 id="mt">${esc(title)}</h3><p id="mb">${esc(body)}</p>
      <div class="row"><button class="btn ghost" data-r="0">${esc(cancel)}</button><button class="btn${danger ? ' danger' : ''}" data-r="1">${esc(ok)}</button></div></div>`;
    document.body.appendChild(wrap); app.setAttribute('aria-hidden', 'true'); app.inert = true;
    const btns = wrap.querySelectorAll('button');
    const close = r => { document.removeEventListener('keydown', key, true); wrap.remove(); app.removeAttribute('aria-hidden'); app.inert = false; if (prev && prev.isConnected) prev.focus(); res(r); };
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'Tab') { const f = [...btns], i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); }
    };
    document.addEventListener('keydown', key, true);
    wrap.addEventListener('click', e => { if (e.target === wrap) close(false); });
    btns.forEach(b => b.onclick = () => close(b.dataset.r === '1'));
    btns[0].focus(); // 기본 초점: 안전한 쪽(계속 풀기)
  });
}
const optId = (o, i) => (typeof o === 'object' && o.id != null) ? String(o.id) : String(i);
const optText = o => typeof o === 'object' ? o.text : o;

// ---------- 검증 ----------
function validate(q, file) {
  const bad = m => { console.warn(`[본질 학습법] ${file}: 문제 "${q && q.id}" 건너뜀 — ${m}`); return false; };
  if (!q || typeof q !== 'object') return bad('객체가 아님');
  if (!q.id) return bad('id 없음');
  if (!TYPES.includes(q.type)) return bad(`알 수 없는 type "${q.type}"`);
  if (!q.prompt) return bad('prompt 없음');
  if (q.chart) { const c = chartData(q.chart); if (!(Array.isArray(c.x) && Array.isArray(c.y) && c.x.length === c.y.length && c.x.length > 1 && [...c.x, ...c.y].every(v => typeof v === 'number' && isFinite(v)))) return bad('chart.points는 [x, y] 숫자 쌍 2개 이상이어야 함'); }
  if (q.level != null && !(Number.isInteger(q.level) && q.level >= 1 && q.level <= 4)) { console.warn(`[본질 학습법] 문제 "${q.id}" — level은 1~4 정수여야 함 (무시함)`); delete q.level; }
  if (q.chart && q.chart.xTicks != null && !Array.isArray(q.chart.xTicks)) { console.warn(`[본질 학습법] 문제 "${q.id}" — chart.xTicks는 배열이어야 함 (무시함)`); delete q.chart.xTicks; }
  if (q.chart && q.chart.yTicks != null && !Array.isArray(q.chart.yTicks)) { console.warn(`[본질 학습법] 문제 "${q.id}" — chart.yTicks는 배열이어야 함 (무시함)`); delete q.chart.yTicks; }
  if (typeof q.explanation !== 'string' || !q.explanation.trim()) console.warn(`[본질 학습법] 문제 "${q.id}" — explanation 없음`);
  if (q.type === 'choice' || q.type === 'why') {
    if (q.type === 'why' && q.mode && q.mode !== 'choice') return bad(`why mode "${q.mode}"는 아직 지원하지 않음`);
    if (!Array.isArray(q.options) || q.options.length < 2) return bad('options 2개 이상 필요');
    const ids = q.options.map(optId);
    if (!ids.includes(String(q.answer))) return bad('answer가 options의 id/번호와 맞지 않음');
  } else if (q.type === 'number') {
    if (typeof q.answer !== 'number' || !isFinite(q.answer)) return bad('answer는 숫자여야 함');
  } else {
    if (!Array.isArray(q.cards) || q.cards.length < 3) return bad('cards 3장 이상 필요');
    const ids = q.cards.map(c => c && c.id);
    if (ids.some(x => !x) || new Set(ids).size !== ids.length) return bad('카드 id가 없거나 중복됨');
    if (q.type === 'oddOneOut') { if (!ids.includes(q.answer)) return bad('answer가 카드 id가 아님'); }
    else {
      if (!Array.isArray(q.answer) || q.answer.length < 2 || !q.answer.every(Array.isArray)) return bad('answer는 묶음 2개 이상인 배열의 배열이어야 함');
      const flat = q.answer.flat();
      if (flat.length !== ids.length || new Set(flat).size !== flat.length || !flat.every(x => ids.includes(x))) return bad('answer가 모든 카드를 정확히 한 번씩 포함해야 함');
      if (q.answer.length > 4) return bad('그룹은 최대 4개');
    }
  }
  return true;
}

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url} (${r.status})`);
  return r.json();
}

// ---------- 채점 ----------
function grade(q, resp) {
  if (resp == null) return false;
  if (q.type === 'number') return Math.abs(resp - q.answer) <= (q.tolerance || 0) + 1e-9;
  if (q.type === 'group') {
    const norm = gs => gs.map(g => g.map(String).sort().join('|')).sort().join('#');
    return norm(resp) === norm(q.answer);
  }
  return String(resp) === String(q.answer);
}
function answerText(q) {
  if (q.type === 'number') return `${q.answer}${q.unit ? ' ' + q.unit : ''}${q.tolerance ? ` (±${q.tolerance})` : ''}`;
  if (q.type === 'choice' || q.type === 'why') { const i = q.options.findIndex((o, k) => optId(o, k) === String(q.answer)); return optText(q.options[i]); }
  const t = id => q.cards.find(c => c.id === id).text;
  if (q.type === 'oddOneOut') return t(q.answer);
  return q.answer.map((g, i) => `묶음 ${i + 1}: ${g.map(t).join(' · ')}`).join('\n');
}

// ---------- 차트 (인라인 SVG) ----------
function smoothPath(P) { // 단조 3차 보간(Fritsch–Carlson): 점을 지나며 넘침 없음
  const n = P.length; if (n < 3) return 'M' + P.map(p => p.join(',')).join('L');
  const d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((P[i + 1][1] - P[i][1]) / ((P[i + 1][0] - P[i][0]) || 1));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; } const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b; if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; } }
  let s = `M${P[0][0]},${P[0][1]}`;
  for (let i = 0; i < n - 1; i++) { const h = (P[i + 1][0] - P[i][0]) / 3; s += ` C${P[i][0] + h},${P[i][1] + m[i] * h} ${P[i + 1][0] - h},${P[i + 1][1] - m[i + 1] * h} ${P[i + 1][0]},${P[i + 1][1]}`; }
  return s;
}
function chartSVG(c) {
  const W = 340, H = 220, L = 44, R = 14, T = 12, B = 30, FS = 13;
  const cd = chartData(c), xs = cd.x.map(Number), ys = cd.y.map(Number);
  const yt = Array.isArray(c.yTicks) ? c.yTicks.filter(t => isFinite(t?.y)) : null, xt = Array.isArray(c.xTicks) ? c.xTicks.filter(t => isFinite(t?.x)) : null;
  const x0 = Math.min(...xs, ...(xt || []).map(t => t.x)), x1 = Math.max(...xs, ...(xt || []).map(t => t.x));
  let y0 = Math.min(0, ...ys, ...(yt || []).map(t => t.y)), y1 = Math.max(...ys, ...(yt || []).map(t => t.y));
  let niceT = null;
  if (!yt) { // 보기 좋은 눈금(1·2·5 단위)
    const raw = (y1 - y0) / 4 || 1, mag = 10 ** Math.floor(Math.log10(raw)), st = [1, 2, 2.5, 5, 10].map(k => k * mag).find(k => k >= raw);
    y0 = Math.floor(y0 / st) * st; y1 = Math.ceil(y1 / st) * st; niceT = []; for (let v = y0; v <= y1 + st / 2; v += st) niceT.push(+v.toFixed(10));
  }
  const sx = v => L + (v - x0) / ((x1 - x0) || 1) * (W - L - R), sy = v => H - B - (v - y0) / ((y1 - y0) || 1) * (H - T - B);
  const fmt = v => Math.abs(v) >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(+v.toFixed(2));
  let g = '';
  const yTicks = yt ? yt.map(t => [t.y, t.label ?? fmt(t.y)]) : niceT.map(v => [v, fmt(v)]);
  if (yTicks.length > 1) { const gap = Math.abs(sy(yTicks[0][0]) - sy(yTicks[1][0])), k = Math.ceil((FS + 4) / (gap || 1)); if (k > 1) yTicks.splice(0, yTicks.length, ...yTicks.filter((t, i) => i % k === 0)); }
  yTicks.forEach(([v, lab]) => { const y = sy(v); g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#e3e7ef"/><text x="${L - 6}" y="${y + 4.5}" text-anchor="end" font-size="${FS}" fill="#454d5f" class="yt">${esc(lab)}</text>`; });
  let xTicks;
  if (xt) xTicks = xt.map(t => [t.x, t.label ?? fmt(t.x)]);
  else { const step = Math.ceil(xs.length / 5); xTicks = xs.map((v, k) => [v, fmt(v), k]).filter(([, , k]) => k % step === 0 || k === xs.length - 1); }
  // 겹치는 x 눈금 솎아 내기: 글자 폭을 추정해 앞 라벨과 6px 이상 떨어진 것만 남김(마지막 눈금 우선 보존)
  const tw = lab => [...String(lab)].reduce((w, ch) => w + (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3\u4e00-\u9fff]/.test(ch) ? FS * 0.95 : /[\s.,:()\-]/.test(ch) ? FS * 0.35 : FS * 0.6), 0);
  const span = ([v, lab]) => { const x = sx(v), w = tw(lab), a = x > W - 40 ? 'end' : x < L + 20 ? 'start' : 'middle'; const l = a === 'end' ? x - w : a === 'start' ? x : x - w / 2; return { l, r: l + w, a }; };
  xTicks.sort((p, q) => p[0] - q[0]);
  const fits = arr => arr.every((t, k) => k === 0 || span(arr[k - 1]).r + 6 <= span(t).l);
  for (let step = 1; step <= xTicks.length; step++) { const cand = xTicks.filter((t, k) => k % step === 0); if (fits(cand)) { xTicks = cand; break; } }
  if (!fits(xTicks)) xTicks = xTicks.slice(0, 1);
  xTicks.forEach(([v, lab]) => g += `<text class="xt" x="${sx(v)}" y="${H - B + 18}" text-anchor="${span([v, lab]).a}" font-size="${FS}" fill="#454d5f">${esc(lab)}</text>`);
  if (y0 < 0) g += `<line x1="${L}" x2="${W - R}" y1="${sy(0)}" y2="${sy(0)}" stroke="#9aa3b5" stroke-dasharray="4 3"/>`;
  const P = xs.map((v, k) => [+sx(v).toFixed(1), +sy(ys[k]).toFixed(1)]);
  const line = c.kind === 'scatter' ? '' : c.smooth ? `<path d="${smoothPath(P)}" fill="none" stroke="#3b5bdb" stroke-width="2.5"/>` : `<polyline points="${P.map(p => p.join(',')).join(' ')}" fill="none" stroke="#3b5bdb" stroke-width="2.5"/>`;
  const dots = P.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#3b5bdb"/>`).join('');
  return `<figure class="chartbox"><div class="ylab">↑ ${esc(c.yLabel || '')}</div><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc((c.yLabel || '') + ' – ' + (c.xLabel || '') + ' 그래프')}">${g}
<line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="#1d2333"/><line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" stroke="#1d2333"/>${line}${dots}</svg>
<div class="xlab">${esc(c.xLabel || '')} →</div>${c.note ? `<figcaption class="note">※ ${esc(c.note)}</figcaption>` : ''}</figure>`;
}

// ---------- 데이터 ----------
const DATA_URL = 'data/questions.json';
const DEFAULT_TITLES = { 1: ['1단계 · 수열', '다음 수를 맞혀 보자'], 2: ['2단계 · 그래프 모양', '그래프가 어떤 패턴인지 고르자'],
  3: ['3단계 · 같은 구조 짝짓기', '겉모습이 달라도 구조가 같은 것끼리 묶자'], 4: ['4단계 · 구조가 다른 하나', '비슷해 보이는 함정 속 다른 하나를 찾자'],
  5: ['5단계 · 왜 그럴까', '패턴이 생기는 근본 원리를 고르자'] };
let byStage = {};
async function loadData() {
  const d = await getJSON(DATA_URL);
  const arr = Array.isArray(d) ? d : d.questions;
  if (!Array.isArray(arr)) throw new Error('questions 배열 없음');
  byStage = {};
  const seen = new Set();
  for (const q of arr) {
    if (q && seen.has(q.id)) { console.warn(`[본질 학습법] 문제 "${q.id}" 건너뜀 — id 중복`); continue; }
    if (q && (q.stage == null || q.stage === '')) { console.warn(`[본질 학습법] 문제 "${q.id}" 건너뜀 — stage 없음`); continue; }
    if (!validate(q, DATA_URL)) continue;
    seen.add(q.id); (byStage[String(q.stage)] ||= []).push(q);
  }
  const meta = {}; (d.stages || []).forEach(s => meta[String(s.id)] = s);
  stages = Object.keys(byStage).sort((a, b) => (+a - +b) || a.localeCompare(b)).map(id => {
    const m = meta[id] || {}, def = DEFAULT_TITLES[id] || [`${id}단계`, ''];
    return { id, title: m.title || def[0], description: m.description ?? def[1] };
  });
  if (!stages.length) throw new Error('유효한 문제가 없음');
}
function chartData(c) { // {points:[[x,y]...]} 또는 {x:[], y:[]} 모두 지원
  if (Array.isArray(c.points)) return { x: c.points.map(p => p[0]), y: c.points.map(p => p[1]) };
  return { x: c.x, y: c.y };
}

// ---------- 화면: 시작 ----------
async function start() {
  h(`<h1>본질 학습법</h1><p class="hint">불러오는 중…</p>`);
  try { await loadData(); }
  catch (e) { console.error(e); h(`<h1>본질 학습법</h1><div class="err"><b>문제를 불러오지 못했어요.</b><br>인터넷 연결을 확인하고 다시 시도해 주세요.</div><button class="btn" id="re">다시 시도</button>`); document.getElementById('re').onclick = start; return; }
  const p = load();
  if (p.last && byStage[p.last.stage] && p.last.order) return play(p.last.stage);
  renderStart();
}
function renderStart() {
  const p = load();
  h(`<header class="home"><h1>본질 학습법</h1><p class="sub">겉모습은 달라도 구조가 같은 것을 찾아보자</p></header>
  <div class="stages">${stages.map(s => {
    const n = byStage[s.id].length, sp = p.stages[s.id], best = sp ? Math.min(sp.best, n) : 0, played = sp && sp.played;
    const going = p.last && p.last.stage === s.id;
    const st = going ? `이어서 풀기 ${p.last.i + 1}/${n}` : played ? `최고 ${best}/${n}` : `${n}문제`;
    return `<button class="stage${going ? ' going' : ''}" data-id="${esc(s.id)}"><span class="t">${esc(s.title)}</span><span class="m">${st}</span>
    <span class="d">${esc(s.description || '')}</span><span class="meter"><i style="width:${played ? best / n * 100 : 0}%"></i></span></button>`; }).join('')}</div>
  <p class="legend" aria-label="난이도 표시">★ 쉬움 · ★★ 보통 · ★★★ 어려움 · <span class="lvl challenge">도전</span></p>
  <button class="linkbtn" id="reset">진행 상황 초기화</button>`);
  app.querySelectorAll('.stage').forEach(b => b.onclick = () => play(b.dataset.id));
  document.getElementById('reset').onclick = async () => { if (await modal({ title: '진행 상황을 초기화할까요?', body: '모든 단계의 점수와 기록이 지워져요.', ok: '초기화', cancel: '취소', danger: true })) { localStorage.removeItem(KEY); renderStart(); } };
}

// ---------- 플레이 ----------
// fresh=true면 처음부터, 아니면 같은 단계의 저장된 위치에서 이어서
function play(id, fresh = false) {
  const st = stages.find(s => s.id === id);
  if (!st || !byStage[id]) { const p = load(); p.last = null; save(p); return renderStart(); }
  const qs = byStage[id];
  const p = load(); const sp = stageProg(p, id); sp.total = qs.length;
  let last = !fresh && p.last && p.last.stage === id ? p.last : null;
  if (last && !(last.order.length === qs.length && last.order.every(qid => qs.some(q => q.id === qid)))) last = null; // 문제 파일이 바뀌면 처음부터
  const order = last ? last.order : qs.map(q => q.id);
  S = { stage: st, questions: order.map(qid => qs.find(q => q.id === qid)), i: last ? last.i : 0, results: last ? (last.results || []) : [] };
  if (S.i >= S.questions.length) { S.i = 0; S.results = []; }
  save(p); persistPos();
  question();
}
function persistPos() { const p = load(); p.last = { stage: S.stage.id, order: S.questions.map(q => q.id), i: S.i, results: S.results }; save(p); }
const levelMark = q => q.level === 4 ? '<span class="lvl challenge">도전</span>' : q.level ? `<span class="lvl" aria-label="난이도 ${q.level}">${'★'.repeat(q.level)}<span class="off">${'★'.repeat(3 - q.level)}</span></span>` : '';

function question() {
  const q = S.questions[S.i], n = S.questions.length;
  const media = (q.image ? `<img class="qimg" src="${esc(q.image)}" alt="${esc(q.imageAlt || '문제 그림')}">` : '') + (q.chart ? chartSVG(q.chart) : '');
  let body = '', hint = '';
  if (q.type === 'choice' || q.type === 'why') {
    body = `<div class="opts">${shuffle(q.options.map((o, i) => [optId(o, i), optText(o)])).map(([i, t]) => `<button class="opt" data-v="${esc(i)}" aria-pressed="false">${esc(t)}</button>`).join('')}</div>`;
  } else if (q.type === 'number') {
    body = `<input class="num" type="text" inputmode="decimal" autocomplete="off" placeholder="숫자 입력${q.unit ? ' (' + esc(q.unit) + ')' : ''}" aria-label="답 입력">`;
  } else if (q.type === 'group') {
    hint = `카드를 눌러 고른 뒤 <b>묶기</b>를 누르세요. 묶음 <b>${q.answer.length}개</b>를 만들어요.`;
    body = `<div class="left" id="left"></div><div class="cards">${shuffle(q.cards).map(c => `<button class="cardbtn" data-v="${esc(c.id)}"><span class="tagline"></span><span class="ct">${esc(c.text)}</span></button>`).join('')}</div>
    <button class="linkbtn" id="clr">모두 풀기</button>`;
  } else {
    hint = '구조가 다른 카드 <b>하나</b>를 고르세요.';
    body = `<div class="cards">${shuffle(q.cards).map(c => `<button class="cardbtn" data-v="${esc(c.id)}" aria-pressed="false"><span class="tagline"></span><span class="ct">${esc(c.text)}</span></button>`).join('')}</div>`;
  }
  h(`<div class="top"><button class="back" id="x" aria-label="그만하기">✕</button><span class="stname">${esc(S.stage.title)}</span><span class="cnt">${S.i + 1}/${n}</span></div>
  <div class="meter big" role="progressbar" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${S.i}"><i style="width:${S.i / n * 100}%"></i></div>
  ${levelMark(q) ? `<div>${levelMark(q)}</div>` : ''}<div class="prompt" data-qid="${esc(q.id)}">${esc(q.prompt)}</div>${hint ? `<div class="hint">${hint}</div>` : ''}${media}${body}<div class="pinbar${q.type === 'group' ? ' three' : ''}">${q.type === 'group' ? '<button class="btn ghost" id="undo" aria-label="되돌리기: 마지막 묶음 풀기">되돌리기</button><button class="btn ghost strong" id="grp">묶기</button>' : ''}<button class="btn" id="go" disabled>확인</button></div>`);
  document.getElementById('x').onclick = async () => { if (await modal({ title: '그만 풀까요?', body: '지금까지 푼 기록은 저장돼요. 다음에 이 문제부터 이어서 풀 수 있어요.', ok: '나가기', cancel: '계속 풀기' })) renderStart(); };
  const go = document.getElementById('go');
  let resp = null;
  const mark = (b, on) => { b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on); const t = b.querySelector('.tagline'); if (t) t.innerHTML = on ? '<span class="chk">✓ 선택</span>' : ''; };
  if (q.type === 'number') {
    const inp = app.querySelector('.num');
    const parse = () => { const v = inp.value.trim().replace(',', '.'); return v !== '' && isFinite(+v) ? +v : null; };
    inp.oninput = () => { resp = parse(); go.disabled = resp == null; };
    inp.onkeydown = e => { if (e.key === 'Enter' && resp != null) go.click(); };
  } else if (q.type === 'group') {
    const groups = [], need = q.answer.length; let sel = new Set();
    const draw = () => {
      app.querySelectorAll('.cardbtn').forEach(b => {
        const v = b.dataset.v, gi = groups.findIndex(g => g.includes(v));
        b.className = 'cardbtn' + (gi >= 0 ? ' g' + (gi % 4) : '');
        if (gi >= 0) { b.querySelector('.tagline').innerHTML = `<span class="tag t${gi % 4}">묶음 ${gi + 1}</span>`; b.setAttribute('aria-pressed', 'true'); }
        else mark(b, sel.has(v));
      });
      const left = q.cards.length - groups.flat().length;
      const full = groups.length >= need;
      document.getElementById('left').innerHTML = `남은 카드 <b>${left}장</b> · 묶음 <b>${groups.length}/${need}</b>` +
        (full && left ? `<br><span class="warn">묶음 ${need}개를 다 만들었는데 카드가 남았어요. 되돌리기로 다시 묶어 보세요.</span>` : '');
      document.getElementById('grp').disabled = sel.size === 0 || full;
      document.getElementById('undo').disabled = groups.length === 0;
      const done = left === 0;
      resp = done ? groups.map(g => g.slice()) : null; go.disabled = !done;
    };
    app.querySelectorAll('.cardbtn').forEach(b => b.onclick = () => {
      const v = b.dataset.v; if (groups.some(g => g.includes(v))) return;
      sel.has(v) ? sel.delete(v) : sel.add(v); draw();
    });
    document.getElementById('grp').onclick = () => { if (!sel.size) return; groups.push([...sel]); sel = new Set(); draw(); };
    document.getElementById('undo').onclick = () => { groups.pop(); draw(); };
    document.getElementById('clr').onclick = () => { groups.length = 0; sel = new Set(); draw(); };
    draw();
  } else {
    const btns = app.querySelectorAll('.opt,.cardbtn');
    btns.forEach(b => b.onclick = () => { btns.forEach(x => mark(x, false)); mark(b, true); resp = b.dataset.v; go.disabled = false; });
  }
  go.onclick = () => { if (resp != null) explain(q, resp); };
}

function respText(q, resp) {
  if (q.type === 'number') return `${resp}${q.unit ? ' ' + q.unit : ''}`;
  if (q.type === 'choice' || q.type === 'why') return optText(q.options.find((o, k) => optId(o, k) === String(resp)));
  return q.cards.find(c => c.id === resp).text;
}
function explain(q, resp) {
  const ok = grade(q, resp);
  S.results.push({ id: q.id, ok });
  const p = load(); const sp = stageProg(p, S.stage.id);
  if (ok && !sp.completed.includes(q.id)) sp.completed.push(q.id);
  save(p);
  S.i++; persistPos();
  const lastQ = S.i >= S.questions.length;
  let detail;
  if (q.type === 'group') {
    const t = id => q.cards.find(c => c.id === id).text, key = g => g.slice().sort().join('|');
    const keys = new Set(q.answer.map(key));
    const mine = ok ? '' : `<div class="lbl">내 묶음</div><ul class="glist">${resp.map(g => { const good = keys.has(key(g)); return `<li class="${good ? 'gok' : 'gbad'}"><b>${good ? '⭕' : '❌'}</b> ${g.map(t).map(esc).join(' · ')}</li>`; }).join('')}</ul>`;
    detail = mine + `<div class="lbl">정답 묶음</div><ul class="glist">${q.answer.map((g, i) => `<li><b>${i + 1}.</b> ${g.map(t).map(esc).join(' · ')}</li>`).join('')}</ul>`;
  } else {
    detail = (ok ? '' : `<div class="lbl">내 답</div><div class="mine">${esc(respText(q, resp))}</div>`) + `<div class="lbl">정답</div><div class="ans">${esc(answerText(q))}</div>`;
  }
  h(`<div class="top"><span class="stname">${esc(S.stage.title)}</span><span class="cnt">${S.i}/${S.questions.length}</span></div>
  <div class="fb ${ok ? 'ok' : 'bad'}" role="status"><div class="h">${ok ? '⭕ 정답!' : '❌ 아쉬워요'}</div>${detail}</div>
  <div class="exp">${esc(q.explanation || '')}</div><div class="pinbar"><button class="btn" id="next">${lastQ ? '결과 보기' : '다음 문제'}</button></div>`);
  document.getElementById('next').onclick = () => lastQ ? result() : question();
}

// 결과 요약 한 줄: summary 필드 > (카드형) 정답 카드 내용 > 문제 첫 줄
function qSummary(q) {
  if (q.summary) return q.summary;
  const t = id => q.cards.find(c => c.id === id)?.text || '';
  if (q.type === 'oddOneOut') return `${t(q.answer)}`;
  if (q.type === 'group') return q.answer.map(g => t(g[0])).join(' / ');
  return q.prompt.split('\n')[0];
}
function result() {
  const n = S.questions.length, id = S.stage.id, score = S.results.filter(r => r.ok).length;
  const p = load(); const sp = stageProg(p, id); sp.best = Math.max(sp.best || 0, score); sp.played = true; p.last = null; save(p);
  const idx = stages.findIndex(s => s.id === id), next = stages[idx + 1];
  const msg = score === n ? '완벽해요! 본질을 꿰뚫었어요.' : score >= n / 2 ? '잘했어요! 틀린 문제의 구조를 다시 떠올려 봐요.' : '괜찮아요. 겉모습 말고 "어떻게 변하는지"에 집중해 봐요.';
  const qmap = Object.fromEntries(S.questions.map(q => [q.id, q]));
  h(`<h2>${esc(S.stage.title)} 결과</h2><div class="score">${score} / ${n}</div><p class="sub center">${msg}</p><p class="hint center">최고 점수 ${sp.best}/${n}</p>
  <ol class="summary">${S.results.map((r, i) => { const q = qmap[r.id]; return `<li class="${r.ok ? 'gok' : 'gbad'}"><b>${r.ok ? '⭕' : '❌'}</b><span>${i + 1}. ${esc(q ? qSummary(q) : r.id)}</span></li>`; }).join('')}</ol>
  <button class="linkbtn" id="home">처음 화면으로</button>
  <div class="pinbar${next ? ' two' : ''}"><button class="btn ghost" id="retry">다시 하기</button>${next ? `<button class="btn" id="nx" aria-label="다음 단계: ${esc(next.title)}">다음 단계 →</button>` : ''}</div>`);
  document.getElementById('retry').onclick = () => play(id, true);
  if (next) document.getElementById('nx').onclick = () => play(next.id, true);
  document.getElementById('home').onclick = renderStart;
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW 등록 실패', e));
start();
