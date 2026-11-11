/* 卫华短视频流水线：内置工程 + 可视化工作流 + 最终成片 + 全流程制作 */
const $ = (s) => document.querySelector(s);
const state = {projects: [], current: null, stage: 'analysis', workflowStage: 'analysis', batchRunning: false, playlist: [], playIndex: 0, from: 'demo', demoRunning: false, skills: [], bindings: {}, skillNodes: [], static: false, staticDb: null};
let STAGES = [];
const DISPLAY_STAGES = () => [...STAGES, {id: 'final', label: '最终成片'}];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(path, options = {}) {
  if (state.static) return staticApi(path, options);
  const res = await fetch(path, {headers: {'Content-Type': 'application/json'}, ...options});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `请求失败 ${res.status}`);
  return data;
}

/* 静态发布形态（未接后端时）：只读浏览内置工程与技能库 */
async function staticApi(path, options = {}) {
  if ((options.method ?? 'GET').toUpperCase() !== 'GET') throw new Error('当前是静态浏览页面：跑流程、保存修改、替换图片需要在本机启动服务后操作');
  if (!state.staticDb) state.staticDb = await (await fetch('./static/bootstrap.json')).json();
  const db = state.staticDb;
  if (path === '/api/health') return db.health;
  if (path === '/api/config') return {llm: {mode: 'template'}, image: {mode: 'unconfigured'}, video: {mode: 'prompt-pack'}};
  if (path === '/api/projects') return {projects: db.projects};
  if (path === '/api/skills') return {skills: db.skills, bindings: db.bindings, nodes: db.nodes};
  const one = path.match(/^\/api\/projects\/([^/?#]+)$/);
  if (one) {
    const res = await fetch(`./static/projects/${one[1]}.json`);
    if (!res.ok) throw new Error('这套工程不在当前页面里');
    return res.json();
  }
  throw new Error('当前是静态浏览页面，该操作需要本机服务');
}
const post = (path, body) => api(path, {method: 'POST', body: JSON.stringify(body ?? {})});
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

async function boot() {
  let health;
  try {
    health = await api('/api/health');
  } catch {
    state.static = true;
    health = await api('/api/health');
  }
  STAGES = health.stages;
  await loadSkills();
  await reloadProjects();
  document.querySelectorAll('.nav-btn[data-view]').forEach((b) => {b.onclick = () => showView(b.dataset.view);});
  $('#backBtn').onclick = () => showView(state.from);
  $('#backDetailBtn').onclick = () => showView('detail');
  $('#workflowBtn').onclick = () => showView('workflow');
  $('#finalBtn').onclick = () => {state.stage = 'final'; renderStage();};
  $('#wfFinalBtn').onclick = () => {state.workflowStage = 'final'; renderWorkflow();};
  $('#wfDemoBtn').onclick = runWorkflowDemo;
  $('#wfCreateBtn').onclick = createFromWorkflow;
  $('#wfProject').onchange = (e) => loadProject(e.target.value, null, 'workflow');
  $('#createBtn').onclick = createProjects;
  $('#runBtn').onclick = () => run(state.current.id, 'all');
  $('#runAllBtn').onclick = runBatch;
  $('#refreshBtn').onclick = () => loadProject(state.current.id);
  $('#playBtn').onclick = startPlayer;
  $('#plClose').onclick = closePlayer;
  $('#plNext').onclick = () => playAt(state.playIndex + 1);
  $('#plPrev').onclick = () => playAt(state.playIndex - 1);
  $('#plVideo').onended = () => playAt(state.playIndex + 1);
  $('#openSettings').onclick = openSettings;
  $('#closeSettings').onclick = () => $('#settings').close();
  $('#saveSettings').onclick = saveSettings;
  $('#testLlm').onclick = () => testChannel('/api/config/test-llm');
  $('#testImg').onclick = () => testChannel('/api/config/test-image');
  $('#presetOpenai').onclick = () => { $('#llmProvider').value = 'openai'; $('#llmBase').value = 'https://api.openai.com/v1'; $('#llmModel').value = 'gpt-4o-mini'; if ($('#llmMode').value === 'template') $('#llmMode').value = 'openai'; };
  $('#presetAnthropic').onclick = () => { $('#llmProvider').value = 'anthropic'; $('#llmBase').value = 'https://api.anthropic.com'; $('#llmModel').value = 'claude-sonnet-4-5'; if ($('#llmMode').value === 'template') $('#llmMode').value = 'openai'; };
  $('#resetBindingsBtn').onclick = async () => { await post('/api/skills/reset', {}); await loadSkills(); renderSkills(); };
  $('#openPasteBtn').onclick = () => $('#pasteWrap').classList.toggle('hidden');
  $('#saveSkillBtn').onclick = saveSkillFromPaste;
  $('#skillFile').onchange = uploadSkillFile;
  setInterval(tick, 4000);
  const params = new URLSearchParams(location.search);
  if (params.get('p')) {
    if (DISPLAY_STAGES().some((s) => s.id === params.get('stage'))) state.stage = params.get('stage');
    loadProject(params.get('p'), null, params.get('view') === 'workflow' ? 'workflow' : 'detail');
  } else if (params.get('view') && ['skills', 'workflow', 'create', 'demo'].includes(params.get('view'))) showView(params.get('view'));
}

function showView(name) {
  if (name === 'workflow' && !state.current) {
    const first = state.projects.find((p) => p.preset) ?? state.projects[0];
    if (first) loadProject(first.id, null, 'workflow');
  }
  for (const v of ['demo', 'create', 'detail', 'workflow', 'skills']) $(`#view-${v}`).classList.toggle('hidden', v !== name);
  document.querySelectorAll('.nav-btn[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'demo') renderPresets();
  if (name === 'workflow') renderWorkflow();
  if (name === 'skills') renderSkills();
  window.scrollTo({top: 0, behavior: 'smooth'});
}

async function reloadProjects() {
  const {projects} = await api('/api/projects');
  state.projects = projects;
  renderPresets();
  renderMatrix();
}

function renderPresets() {
  const presets = state.projects.filter((p) => p.preset);
  const videos = presets.reduce((t, p) => t + (p.videoCount ?? 0), 0);
  const assets = presets.reduce((t, p) => t + p.assetCount, 0);
  const finals = presets.filter((p) => p.finalReady).length;
  $('#stats').innerHTML = [
    [presets.length, '内置工程'], [videos, '镜头视频'], [assets, '美术资产'], [finals, '完整成片'], ['6 / 7', '差异化镜数'],
  ].map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join('');
  $('#presetGrid').innerHTML = presets.map((p) => `
    <div class="preset" data-id="${p.id}">
      <div class="cover">${p.cover ? `<img src="${p.cover}" alt="${esc(p.title)}">` : ''}
        <div class="play">▶ 进入工程</div></div>
      <div class="body"><h3>${esc(p.title)}</h3>
        <p class="muted">${esc(p.brief)}</p>
        <div class="chips"><span class="chip">${esc(p.style)}</span><span class="chip">${p.shotCount} 镜</span>
          <span class="chip teal">视频 ${p.videoCount ?? 0}/${p.shotCount}</span><span class="chip teal">美术 ${p.assetCount}/${p.shotCount}</span>
          <span class="chip ${p.finalReady ? 'teal' : ''}">${p.finalReady ? `完整成片 ${p.durationTarget}s` : '成片合成中'}</span></div>
      </div>
    </div>`).join('') || '<p class="muted">暂无内置工程。</p>';
  document.querySelectorAll('.preset').forEach((el) => {el.onclick = () => loadProject(el.dataset.id, 'demo');});
}

function renderMatrix() {
  const list = state.projects.filter((p) => !p.preset);
  $('#projectList').innerHTML = list.length ? list.map((p) => `
    <div class="proj ${state.current?.id === p.id ? 'active' : ''}" data-id="${p.id}">
      <div class="t"><span>${esc(p.title)}</span><span class="status-${p.status === 'error' ? 'error' : p.currentStage ? 'running' : 'done'}">${p.currentStage ? '运行中' : p.status === 'complete' ? '完成' : p.status === 'error' ? '失败' : '草稿'}</span></div>
      <div class="m">变体 ${p.variant}｜${esc(p.style)}｜阶段 ${p.doneStages.length}/7｜图 ${p.assetCount}｜镜 ${p.shotCount}</div>
      <div class="bar"><i style="width:${(p.doneStages.length / 7) * 100}%"></i></div>
    </div>`).join('') : '<p class="muted">还没有自建工程。</p>';
  document.querySelectorAll('.proj').forEach((el) => {el.onclick = () => loadProject(el.dataset.id, 'create');});
}

async function createProjects() {
  const body = {brief: $('#brief').value.trim(), style: $('#style').value, ratio: $('#ratio').value,
    durationTarget: $('#durationTarget').value, sceneCount: $('#sceneCount').value, variants: $('#variants').value};
  if (!body.brief) return alert('请先输入一句话创意');
  $('#createBtn').disabled = true;
  try {
    const r = await post('/api/projects', body);
    await reloadProjects();
    if (r.projects.length) loadProject(r.projects[0].id, 'create');
  } catch (e) {alert(e.message);} finally {$('#createBtn').disabled = false;}
}

async function createFromWorkflow() {
  const brief = $('#wfBrief').value.trim();
  if (!brief) return alert('请先输入一句话创意');
  const btn = $('#wfCreateBtn');
  btn.disabled = true; btn.textContent = '创建并拆解中…';
  try {
    const r = await post('/api/projects', {brief, style: '工业史诗', ratio: '16:9', durationTarget: 40, sceneCount: 6, variants: 1});
    await reloadProjects();
    const created = r.projects[0];
    await loadProject(created.id, 'create', 'workflow');
    await run(created.id, 'all');
  } catch (e) {alert(e.message);} finally {btn.disabled = false; btn.textContent = '创建并一键拆解';}
}

async function loadProject(id, from = null, targetView = null) {
  const p = await api(`/api/projects/${id}`);
  state.current = p;
  if (from) state.from = from;
  else if (state.from !== 'create') state.from = p.preset ? 'demo' : 'create';
  const view = targetView ?? (!$('#view-workflow').classList.contains('hidden') ? 'workflow' : 'detail');
  showView(view);
  $('#pTitle').textContent = `${p.title}${p.preset ? '' : `（变体 ${p.variant}）`}`;
  $('#pMeta').textContent = `${p.style}｜${p.ratio}｜${p.shotPrompts?.length ?? 0} 镜｜成片目标 ${p.durationTarget}s｜${p.brief}`;
  $('#tabs').innerHTML = DISPLAY_STAGES().map((s) => `<button class="tab ${state.stage === s.id ? 'active' : ''} ${s.id === 'final' ? (p.final?.status === 'done' ? 'done' : '') : (p.stages[s.id]?.status === 'done' ? 'done' : '')}" data-stage="${s.id}">${s.label}</button>`).join('');
  document.querySelectorAll('.tab').forEach((el) => {el.onclick = () => {state.stage = el.dataset.stage; renderStage();};});
  $('#logs').textContent = (p.logs ?? []).map((l) => `${String(l.at).slice(11, 19)} ${l.message}`).join('\n');
  $('#playBtn').style.display = (p.videos ?? []).some((v) => v.status === 'done') ? '' : 'none';
  if (view === 'workflow') renderWorkflow(); else renderStage();
  reloadProjects();
}

function stageHeader(p, s, extra = '') {
  const st = p.stages[s];
  const label = STAGES.find((x) => x.id === s)?.label ?? s;
  const mode = p.stageMode?.[s] ?? 'auto';
  return `<div class="stage-title"><div><b>${label}</b> <span class="muted">${st ? st.status : '未执行'}</span>
      <span class="mode-chip ${mode}">${mode === 'manual' ? '手动维护' : '自动生成'}</span></div>
    <div class="row"><button class="btn small ghost" onclick="toggleMode('${p.id}','${s}')">${mode === 'manual' ? '切回自动' : '改成手动'}</button>${extra}<button class="btn small" onclick="run('${p.id}','${s}')">重跑此阶段</button></div></div>`;
}

function stageMarkup(p, s, context = 'detail') {
  if (s === 'final') return renderFinal(p);
  const panel = skillPanel(p, s);
  if (s === 'analysis') return stageHeader(p, s) + renderAnalysis(p) + panel;
  if (s === 'script') return stageHeader(p, s) + renderScript(p.script, `${context}ScriptJson`) + panel;
  if (s === 'artPrompts') return stageHeader(p, s) + renderArtPrompts(p) + panel;
  if (s === 'assets') return stageHeader(p, s, `<button class="btn small" onclick="run('${p.id}','assets')">全部生成</button>`) + renderAssets(p) + panel;
  if (s === 'storyboard') return stageHeader(p, s) + renderShots(p, true) + panel;
  if (s === 'shotPrompts') return stageHeader(p, s) + renderShots(p, false) + panel;
  if (s === 'pack') return stageHeader(p, s) + renderPack(p) + panel;
  return '';
}

function renderStage() {
  const p = state.current;
  if (!p) return;
  document.querySelectorAll('.tab').forEach((el) => el.classList.toggle('active', el.dataset.stage === state.stage));
  $('#stageContent').innerHTML = stageMarkup(p, state.stage, 'detail');
}

function renderFinal(p) {
  if (p.final?.status !== 'done') return `<div class="stage-title"><div><b>最终成片</b></div></div><p class="muted">${p.preset ? '完整版本正在合成，逐镜视频仍可正常播放。' : '自建工程的实时视频生成与自动合片接口尚未接入；当前可查看七阶段产物、逐镜提示词和任务包。'}</p>`;
  return `<div class="final-hero"><div><video class="final-video" src="${p.final.url}" controls preload="metadata" poster="${p.assets?.[0]?.url ?? ''}"></video></div>
    <div class="final-side"><span class="final-badge">✓ 完整版本已就绪</span><h3>${esc(p.title)}</h3><p class="muted">已将全部镜头按分镜顺序合成，并压制对应字幕；此入口与逐镜预览相互独立。</p>
    <div class="final-stats"><div class="final-stat"><b>${p.shotPrompts.length}</b><span>完整镜头</span></div><div class="final-stat"><b>${Math.round(p.final.seconds)}s</b><span>成片时长</span></div><div class="final-stat"><b>16:9</b><span>横版画幅</span></div><div class="final-stat"><b>MP4</b><span>可下载格式</span></div></div>
    <a class="btn primary" href="${p.final.url}" download="${esc(p.title)}-完整成片.mp4">下载最终成片</a></div></div>`;
}

const notRun = () => '<p class="muted">此阶段尚未执行，点击右上角「重跑此阶段」或「一键跑全流程」。</p>';
const editBlock = (p, key, id, title = '原始 JSON（可直接改，改完保存）') => `<details><summary class="muted">${title}</summary>
  <pre id="${id}" contenteditable="true">${esc(JSON.stringify(p[key] ?? {}, null, 2))}</pre>
  <button class="btn small" onclick="saveJson('${key}','${id}')">保存修改</button></details>`;

function renderAnalysis(p) {
  const a = p.analysis;
  if (!a) return notRun();
  return `<div class="kv"><b>主题</b><span>${esc(a.theme)}</span><b>受众</b><span>${esc(a.audience)}</span>
    <b>钩子</b><span>${esc(a.hook)}</span><b>核心信息</b><span>${(a.keyMessage ?? []).map(esc).join('；')}</span>
    <b>视觉风格</b><span>${esc(a.visualStyle)}</span><b>约束</b><span>${(a.constraints ?? []).map(esc).join('<br>')}</span></div>${editBlock(p, 'analysis', 'analysisJson')}`;
}
function renderScript(sc, jsonId) {
  if (!sc) return notRun();
  return `<p class="muted">${esc(sc.title)}｜共 ${sc.scenes.length} 场，约 ${sc.totalSeconds ?? sc.scenes.reduce((t, x) => t + x.seconds, 0)} 秒</p>` +
    sc.scenes.map((x) => `<div class="scene"><div class="head"><span>${x.id} ${esc(x.title)}</span><span>${x.act}｜${x.seconds}s</span></div>
      <div>配音：${esc(x.narration)}</div><div>字幕：${esc(x.subtitle).replace(/\n/g, '／')}</div><div class="vis">画面：${esc(x.visual)}</div></div>`).join('') +
    `<details><summary class="muted">剧本 JSON（可编辑后保存）</summary><pre id="${jsonId}" contenteditable="true">${esc(JSON.stringify(sc, null, 2))}</pre>
    <button class="btn small" onclick="saveJson('script','${jsonId}')">保存修改</button></details>`;
}
function renderArtPrompts(p) {
  if (!p.artPrompts) return notRun();
  return p.artPrompts.map((a) => `<div class="scene"><div class="head"><span>${a.assetId} ${esc(a.name)}</span><span>${a.type}｜${a.size}</span></div>
    <div>${esc(a.prompt)}</div><div class="vis">负面：${esc(a.negative)}</div></div>`).join('') + editBlock(p, 'artPrompts', 'artPromptsJson');
}
function renderAssets(p) {
  if (!p.artPrompts) return notRun();
  return '<div class="assets">' + p.artPrompts.map((art) => {
    const a = p.assets.find((x) => x.assetId === art.assetId);
    const status = a?.status ?? 'pending';
    return `<div class="asset">${a?.url ? `<a href="${a.url}" target="_blank"><img src="${a.url}" alt="${esc(art.name)}"></a>` : `<div style="aspect-ratio:16/9;display:grid;place-items:center;color:var(--muted)">${status === 'running' ? '生成中…' : status === 'error' ? '生成失败' : '未生成'}</div>`}
      <div class="info"><div class="name">${art.assetId} ${esc(art.name)}</div><div class="muted">${status}${a?.manual ? '（手工替换）' : ''}${a?.error ? '：' + esc(a.error) : ''}</div>
      <div class="row"><button class="btn small" onclick="regen('${p.id}','${art.assetId}')">生成 / 重生成</button>
      <label class="btn small ghost upload-btn">换成我的图<input type="file" accept="image/png,image/jpeg,image/webp" hidden onchange="uploadAsset('${p.id}','${art.assetId}',this)"></label></div></div></div>`;
  }).join('') + '</div>';
}
function renderShots(p, tableMode) {
  if (!p.storyboard) return notRun();
  const table = `<table><thead><tr><th>镜号</th><th>时长</th><th>运镜</th><th>动作</th><th>字幕</th><th>资产</th></tr></thead><tbody>` +
    p.storyboard.map((s) => `<tr><td>${s.shotId}<br><span class="muted">${s.sceneId}</span></td><td>${s.seconds}s</td><td>${esc(s.camera)}</td><td>${esc(s.action)}</td><td>${esc(s.subtitle).replace(/\n/g, '／')}</td><td>${(s.assetIds ?? []).join(',')}</td></tr>`).join('') + '</tbody></table>';
  const cards = '<div class="shots">' + p.storyboard.map((s) => {
    const v = (p.videos ?? []).find((x) => x.shotId === s.shotId);
    const sp = (p.shotPrompts ?? []).find((x) => x.shotId === s.shotId);
    return `<div class="shot">${v?.status === 'done' ? `<video src="${v.url}" controls preload="metadata" poster="${(p.assets.find((a) => a.assetId === s.assetIds[0])?.url) ?? ''}"></video>` : '<div class="novideo">视频待生成</div>'}
      <div class="info"><b>${s.shotId}</b>｜${s.seconds}s｜${esc(s.camera)}<br><span class="muted">${esc(s.subtitle).replace(/\n/g, '／')}</span>
      ${tableMode ? '' : `<pre>${esc(sp?.videoPrompt ?? '')}</pre>`}</div></div>`;
  }).join('') + '</div>';
  const edit = editBlock(p, tableMode ? 'storyboard' : 'shotPrompts', tableMode ? 'storyboardJson' : 'shotPromptsJson', tableMode ? '分镜表 JSON（可直接改，改完保存）' : '逐镜提示词 JSON（可直接改，改完保存）');
  return edit + (tableMode ? table + '<h3>逐镜视频</h3>' : '') + cards;
}
function renderPack(p) {
  if (!p.pack) return notRun();
  return `<p>共 ${p.pack.shots.length} 镜，已生成视频 ${(p.videos ?? []).filter((v) => v.status === 'done').length} 镜。</p>
    <div class="row" style="margin:12px 0"><a class="btn small" href="/api/projects/${p.id}/task-pack.json">下载任务包 JSON</a>
    <a class="btn small" href="/api/projects/${p.id}/shot-prompts.txt">下载每镜提示词 TXT</a></div><pre>${esc(JSON.stringify(p.pack, null, 2))}</pre>`;
}

/* 工作流画布 */
function nodeMeta(p, id) {
  if (id === 'input') return '一句话创意';
  if (id === 'analysis') return p.analysis ? '受众 · 钩子 · 约束' : '等待拆解';
  if (id === 'script') return p.script ? `${p.script.scenes.length} 场 · ${p.script.totalSeconds}s` : '等待生成';
  if (id === 'artPrompts') return p.artPrompts ? `${p.artPrompts.length} 条美术提示词` : '等待生成';
  if (id === 'assets') return `${p.assets?.filter((a) => a.status === 'done').length ?? 0}/${p.artPrompts?.length ?? 0} 张已就绪`;
  if (id === 'storyboard') return p.storyboard ? `${p.storyboard.length} 镜 · 运镜与字幕` : '等待拆解';
  if (id === 'shotPrompts') return p.shotPrompts ? `${p.shotPrompts.length} 条视频提示词` : '等待生成';
  if (id === 'pack') return p.pack ? `${p.pack.shots.length} 镜任务包` : '等待生成';
  if (id === 'final') return p.final?.status === 'done' ? `完整 MP4 · ${(Math.round(p.final.seconds * 10) / 10)}s` : (p.preset ? '合成中' : '合片接口预留');
  return '';
}
function renderWorkflow() {
  const p = state.current;
  if (!p || $('#view-workflow').classList.contains('hidden')) return;
  $('#wfProject').innerHTML = state.projects.map((x) => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${x.preset ? `[内置 ${x.presetKey}] ` : ''}${esc(x.title)}</option>`).join('');
  if (document.activeElement !== $('#wfBrief')) $('#wfBrief').value = p.brief;
  $('#wfProjectMeta').textContent = `${p.title} · ${p.shotPrompts?.length ?? 0} 镜 · ${p.preset ? '内置工程数据' : '真实流程工程'}`;
  const nodes = [{id: 'input', label: '一句话创意'}, ...STAGES.map((s) => ({id: s.id, label: s.label})), {id: 'final', label: '最终成片'}];
  $('#flowNodes').innerHTML = nodes.map((n, i) => {
    const done = n.id === 'input' || (n.id === 'final' ? p.final?.status === 'done' : p.stages[n.id]?.status === 'done');
    const running = n.id !== 'input' && n.id !== 'final' && p.stages[n.id]?.status === 'running';
    const names = boundNames(n.id);
    return `${i ? '<span class="flow-arrow">→</span>' : ''}<button class="flow-node ${done ? 'done' : ''} ${running ? 'running' : ''} ${state.workflowStage === n.id ? 'active' : ''} ${n.id === 'final' ? 'final-node' : ''}" data-node="${n.id}">
      <div class="node-top"><span class="node-index">${String(i).padStart(2, '0')}</span><span class="node-dot"></span></div><div class="node-name">${esc(n.label)}</div><div class="node-meta">${esc(nodeMeta(p, n.id))}</div>
      <div class="node-skill">${names.length ? esc(names.join(' + ')) : '默认提示词'}</div></button>`;
  }).join('');
  document.querySelectorAll('.flow-node').forEach((el) => {el.onclick = () => {state.workflowStage = el.dataset.node; renderWorkflow();};});
  if (state.workflowStage === 'input') {
    $('#wfStageContent').innerHTML = `<div class="stage-title"><div><b>一句话创意输入</b> <span class="muted">流程起点</span></div></div><div class="scene"><div class="head"><span>当前 Brief</span><span>${p.preset ? '内置' : '自建'}</span></div><div>${esc(p.brief)}</div><div class="vis">修改上方文本并点击「创建并一键拆解」，会新建工程并真实执行七阶段；不会覆盖这套内置工程。</div></div>`;
  } else $('#wfStageContent').innerHTML = stageMarkup(p, state.workflowStage, 'workflow');
}
async function runWorkflowDemo() {
  if (!state.current?.preset) return alert('播放完整流程请选择 A–E 内置工程；自建工程请点击一键跑全流程');
  if (state.demoRunning) return;
  state.demoRunning = true;
  $('#wfDemoBtn').textContent = '流程播放中…';
  for (const id of ['input', ...STAGES.map((s) => s.id), 'final']) {
    state.workflowStage = id;
    renderWorkflow();
    await wait(650);
  }
  $('#wfDemoBtn').textContent = '▶ 播放完整流程';
  state.demoRunning = false;
}

async function run(id, stage) {await post(`/api/projects/${id}/run`, {stage}); setTimeout(() => loadProject(id), 600);}
window.run = run;
window.regen = async (id, assetId) => {await post(`/api/projects/${id}/asset`, {assetId}); setTimeout(() => loadProject(id), 600);};
window.saveJson = async (key, elId) => {
  try {const value = JSON.parse(document.getElementById(elId).innerText);
    await post(`/api/projects/${state.current.id}/update`, {[key]: value});
    await loadProject(state.current.id);
  } catch (e) {alert('保存失败：' + e.message);}
};
window.toggleMode = async (id, stage) => {
  const p = state.current;
  const next = (p.stageMode?.[stage] ?? 'auto') === 'manual' ? 'auto' : 'manual';
  await post(`/api/projects/${id}/update`, {stageMode: {...(p.stageMode ?? {}), [stage]: next}});
  await loadProject(id);
};
window.saveOverride = async (stage, sysId, userId) => {
  const p = state.current;
  const markdown = {system: document.getElementById(sysId).value, user: document.getElementById(userId).value};
  await post(`/api/projects/${p.id}/update`, {promptOverrides: {...(p.promptOverrides ?? {}), [stage]: markdown}});
  await loadProject(p.id);
};
window.clearOverride = async (stage) => {
  const p = state.current;
  const next = {...(p.promptOverrides ?? {})};
  delete next[stage];
  await post(`/api/projects/${p.id}/update`, {promptOverrides: next});
  await loadProject(p.id);
};
window.uploadAsset = async (id, assetId, input) => {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {alert('图片超过 8MB，请先压缩'); return;}
  const dataUrl = await new Promise((resolve) => {const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.readAsDataURL(file);});
  try {
    await post(`/api/projects/${id}/asset-upload`, {assetId, dataUrl});
    await loadProject(id);
  } catch (e) {alert('替换失败：' + e.message);}
};
async function runBatch() {
  if (state.batchRunning) return;
  state.batchRunning = true;
  for (const p of state.projects.filter((x) => !x.preset && x.status !== 'complete')) {
    try {await post(`/api/projects/${p.id}/run`, {stage: 'all'});} catch (e) {console.error(e.message);}
    await new Promise((resolve) => {const timer = setInterval(async () => {
      const cur = await api(`/api/projects/${p.id}`);
      if (!cur.currentStage) {clearInterval(timer); resolve();}
    }, 4000);});
    await reloadProjects();
  }
  state.batchRunning = false;
  if (state.current) loadProject(state.current.id);
}
async function tick() {
  if (state.static) return;
  if (state.current?.currentStage) loadProject(state.current.id);
  else if (state.projects.some((p) => p.currentStage)) reloadProjects();
}

/* 逐镜连续预览 */
function startPlayer() {
  const p = state.current;
  state.playlist = p.storyboard.filter((s) => (p.videos ?? []).some((v) => v.shotId === s.shotId && v.status === 'done'))
    .map((s) => ({shotId: s.shotId, subtitle: s.subtitle, url: p.videos.find((v) => v.shotId === s.shotId).url,
      narration: (p.shotPrompts ?? []).find((x) => x.shotId === s.shotId)?.narration ?? ''}));
  if (!state.playlist.length) return alert('本工程还没有可播放的镜头视频');
  $('#player').classList.remove('hidden'); playAt(0);
}
function playAt(i) {
  if (i >= state.playlist.length) {closePlayer(); return;}
  state.playIndex = Math.max(0, i);
  const item = state.playlist[state.playIndex];
  $('#plTitle').textContent = `${state.current.title} · 逐镜预览 ${item.shotId}`;
  $('#plSub').textContent = `　第 ${state.playIndex + 1}/${state.playlist.length} 镜`;
  $('#plSubtitle').textContent = item.subtitle;
  $('#plNarration').textContent = item.narration;
  const v = $('#plVideo'); v.src = item.url; v.play().catch(() => {});
}
function closePlayer() {$('#plVideo').pause(); $('#player').classList.add('hidden');}

/* 技能槽 */
async function loadSkills() {
  const data = await api('/api/skills');
  state.skills = data.skills ?? [];
  state.bindings = data.bindings ?? {};
  state.skillNodes = data.nodes ?? [];
}
function boundNames(stage) {
  return (state.bindings[stage] ?? []).map((id) => state.skills.find((s) => s.id === id)?.name ?? id);
}
function skillsForNode(node) {
  return state.skills.filter((s) => s.node === node || s.node === 'any');
}
function renderSkills() {
  if (!$('#view-skills') || $('#view-skills').classList.contains('hidden')) return;
  const labels = Object.fromEntries(STAGES.map((s) => [s.id, s.label]));
  $('#bindSummary').textContent = `${state.skills.length} 份技能 · ${Object.values(state.bindings).filter((v) => v?.length).length}/${STAGES.length} 个节点已绑定`;
  $('#bindGrid').innerHTML = STAGES.map((s) => {
    const list = skillsForNode(s.id);
    const current = (state.bindings[s.id] ?? [])[0] ?? '';
    return `<div class="bind-row"><div><b>${esc(labels[s.id] ?? s.id)}</b><span class="muted">${s.id}</span></div>
      <select data-stage="${s.id}"><option value="">不绑定（用默认提示词）</option>${list.map((sk) => `<option value="${sk.id}" ${sk.id === current ? 'selected' : ''}>${esc(sk.name)} · ${esc(sk.version)}</option>`).join('')}</select></div>`;
  }).join('');
  document.querySelectorAll('#bindGrid select').forEach((el) => {
    el.onchange = async () => {
      const stage = el.dataset.stage;
      const prev = state.bindings[stage] ?? [];
      for (const id of prev) await post('/api/skills/bind', {stage, id, on: false});
      if (el.value) await post('/api/skills/bind', {stage, id: el.value, on: true});
      await loadSkills();
      renderSkills();
      if (state.current) renderWorkflow();
    };
  });
  $('#skillCount').textContent = `${state.skills.length} 份`;
  $('#skillList').innerHTML = state.skills.map((sk) => `<div class="skill-card" data-id="${sk.id}">
      <div class="row between"><b>${esc(sk.name)}</b><span class="skill-tag">${esc(sk.node)}</span></div>
      <div class="muted">${esc(sk.description).slice(0, 90)}</div>
      <div class="row between"><span class="muted">${esc(sk.id)} · v${esc(sk.version)}${sk.tags?.length ? ' · ' + esc(sk.tags.join(' / ')) : ''}</span>
      <span class="row"><button class="btn small ghost" data-view="${sk.id}">看原文</button><button class="btn small ghost danger" data-del="${sk.id}">删除</button></span></div>
      <pre class="skill-raw hidden">${esc(sk.raw)}</pre></div>`).join('');
  document.querySelectorAll('#skillList [data-view]').forEach((b) => {b.onclick = () => b.closest('.skill-card').querySelector('.skill-raw').classList.toggle('hidden');});
  document.querySelectorAll('#skillList [data-del]').forEach((b) => {b.onclick = async () => {
    if (!window.confirm(`删除技能「${b.dataset.del}」？`)) return;
    await api(`/api/skills/${b.dataset.del}`, {method: 'DELETE'});
    await loadSkills(); renderSkills();
  };});
}
async function saveSkillFromPaste() {
  const markdown = $('#skillMarkdown').value.trim();
  if (!markdown) { $('#skillMsg').textContent = '先粘贴技能内容'; return; }
  try {
    const r = await post('/api/skills', {markdown});
    $('#skillMsg').textContent = `已保存：${r.skill.name}（${r.skill.node}）`;
    $('#skillMarkdown').value = '';
    await loadSkills(); renderSkills();
  } catch (e) { $('#skillMsg').textContent = '保存失败：' + e.message; }
}
async function uploadSkillFile() {
  const file = $('#skillFile').files?.[0];
  if (!file) return;
  const text = await file.text();
  try {
    const r = await post('/api/skills', {markdown: text});
    $('#skillMsg').textContent = `已上传：${r.skill.name}（${r.skill.node}）`;
    await loadSkills(); renderSkills();
  } catch (e) { $('#skillMsg').textContent = '上传失败：' + e.message; }
}
function skillPanel(p, s) {
  const applied = p.skillsApplied?.[s];
  const ovr = p.promptOverrides?.[s] ?? {};
  const names = (applied?.skills ?? []).map((x) => x.name);
  const sysId = `ovrSys_${s}`;
  const userId = `ovrUser_${s}`;
  const sys = ovr.system ?? applied?.system ?? '';
  const user = ovr.user ?? applied?.user ?? '';
  return `<details class="skill-panel"><summary>本节点技能装配：<b>${names.length ? esc(names.join(' + ')) : '未绑定技能，用默认提示词'}</b>${ovr.system || ovr.user ? ' · <span class="mode-chip manual">提示词已手改</span>' : ''}</summary>
    ${sys ? `<h4>系统提示词</h4><pre>${esc(sys)}</pre>` : ''}
    ${user ? `<h4>模板渲染后的提示词</h4><pre>${esc(user)}</pre>` : ''}
    ${!sys && !user ? '<p class="muted">该节点不经过语言模型，技能只作为这一段的生产口径记录。</p>' : ''}
    <details class="skill-override"><summary>手动编辑这一段的提示词</summary>
      <label class="muted small">系统提示词</label><textarea id="${sysId}" rows="4">${esc(sys)}</textarea>
      <label class="muted small">用户提示词（技能模板已渲染的版本，可整段改写）</label><textarea id="${userId}" rows="8">${esc(user)}</textarea>
      <div class="row"><button class="btn small primary" onclick="saveOverride('${s}','${sysId}','${userId}')">保存提示词</button>
      <button class="btn small ghost" onclick="clearOverride('${s}')">恢复技能提示词</button></div>
    </details></details>`;
}

/* 设置 */
async function openSettings() {
  const cfg = await api('/api/config');
  $('#llmProvider').value = cfg.llm.provider ?? 'openai';
  $('#llmMode').value = cfg.llm.mode; $('#llmModel').value = cfg.llm.model; $('#llmBase').value = cfg.llm.base_url;
  $('#imgBase').value = cfg.image.base_url; $('#imgModel').value = cfg.image.model; $('#imgSize').value = cfg.image.size;
  $('#videoBase').value = cfg.video.base_url; $('#videoModel').value = cfg.video.model ?? '';
  $('#llmKey').value = ''; $('#imgKey').value = '';
  $('#settingsMsg').textContent = `语言模型：${cfg.llm.api_key}｜图片通道：${cfg.image.api_key}`;
  $('#settings').showModal();
}
async function saveSettings() {
  const body = {llm: {provider: $('#llmProvider').value, mode: $('#llmMode').value, model: $('#llmModel').value.trim(), base_url: $('#llmBase').value.trim()},
    image: {base_url: $('#imgBase').value.trim(), model: $('#imgModel').value.trim(), size: $('#imgSize').value.trim()},
    video: {mode: $('#videoMode').value, base_url: $('#videoBase').value.trim(), model: $('#videoModel').value.trim()}};
  if ($('#llmKey').value.trim()) body.llm.api_key = $('#llmKey').value.trim();
  if ($('#imgKey').value.trim()) body.image.api_key = $('#imgKey').value.trim();
  await post('/api/config', body);
  const cfg = await api('/api/config');
  $('#settingsMsg').textContent = `已保存：语言模型 ${cfg.llm.api_key}${cfg.llm.mode === 'openai' ? '（已启用）' : '（未启用，走模板引擎）'}｜图片通道 ${cfg.image.api_key}`;
}
async function testChannel(path) {
  $('#settingsMsg').textContent = '测试中…';
  const r = await post(path, {});
  $('#settingsMsg').textContent = r.ok ? `连接正常${r.models ? '：' + r.models.join(', ') : ''}` : `失败：${r.error}`;
}

boot().catch((e) => {document.body.innerHTML = `<pre style="padding:30px">${esc(e.message)}</pre>`;});
