// 技能槽：每个节点的提示词由 skills/*.md 决定，可上传、可替换、可解绑
// 技能文件格式：Markdown + YAML 风格 front matter，正文分 ## 说明 / ## 系统提示词 / ## 模板
import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from './store.js';

export const SKILLS_DIR = path.join(ROOT, 'skills');
const BINDINGS_FILE = path.join(ROOT, 'data', 'skill-bindings.json');
export const SKILL_NODES = ['analysis', 'script', 'artPrompts', 'assets', 'storyboard', 'shotPrompts', 'pack', 'final'];

const DEFAULT_BINDINGS = {
  analysis: ['analysis-five-dim'],
  script: ['script-three-act'],
  artPrompts: ['art-cinematic'],
  assets: ['assets-batch-sheet'],
  storyboard: ['storyboard-grid'],
  shotPrompts: ['shotprompt-shot-level'],
  pack: ['pack-delivery'],
};

const FIELD = (raw, key) => {
  const m = raw.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim() : '';
};

/* 把一份技能 Markdown 解析成结构化对象 */
export function parseSkill(markdown, origin = 'file') {
  const md = String(markdown ?? '').replace(/\r\n/g, '\n').trim();
  const front = md.match(/^---\n([\s\S]*?)\n---/);
  const meta = front ? front[1] : '';
  const body = front ? md.slice(front[0].length) : md;
  const section = (title) => {
    const lines = body.split('\n');
    const out = [];
    let on = false;
    for (const line of lines) {
      const h = line.match(/^##\s+(.+?)\s*$/);
      if (h) { on = h[1] === title; continue; }
      if (on) out.push(line);
    }
    return out.join('\n').trim();
  };
  const id = FIELD(meta, 'id') || path.basename(String(origin), '.md');
  return {
    id,
    name: FIELD(meta, 'name') || id,
    node: FIELD(meta, 'node') || 'any',
    kind: FIELD(meta, 'kind') || 'text',
    version: FIELD(meta, 'version') || '1.0',
    order: Number(FIELD(meta, 'order') || 0),
    tags: (FIELD(meta, 'tags') || '').split(',').map((s) => s.trim()).filter(Boolean),
    origin,
    description: section('说明'),
    system: section('系统提示词'),
    template: section('模板'),
    raw: md,
  };
}

export function listSkills() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs.readdirSync(SKILLS_DIR)
    .filter((f) => f.toLowerCase().endsWith('.md'))
    .map((f) => parseSkill(fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8'), f))
    .sort((a, b) => a.node.localeCompare(b.node) || a.order - b.order || a.id.localeCompare(b.id));
}

/* 保存/覆盖一份技能：id 即文件名，node 必须是已知节点或 any */
export function saveSkill(markdown) {
  const skill = parseSkill(markdown, 'upload');
  if (!skill.id || !/^[A-Za-z0-9_-]{2,64}$/.test(skill.id)) throw new Error('技能 id 只能由字母、数字、下划线或连字符组成，2-64 位');
  if (skill.node !== 'any' && !SKILL_NODES.includes(skill.node)) throw new Error(`node 必须是 ${SKILL_NODES.join(' / ')} 或 any`);
  if (!skill.system && !skill.template) throw new Error('技能至少要包含「## 系统提示词」或「## 模板」之一');
  fs.mkdirSync(SKILLS_DIR, {recursive: true});
  fs.writeFileSync(path.join(SKILLS_DIR, `${skill.id}.md`), skill.raw + '\n', 'utf8');
  return skill;
}

export function deleteSkill(id) {
  const file = path.join(SKILLS_DIR, `${id}.md`);
  if (!fs.existsSync(file)) throw new Error(`技能不存在：${id}`);
  fs.unlinkSync(file);
  const bindings = readBindings();
  for (const stage of Object.keys(bindings)) {
    bindings[stage] = bindings[stage].filter((x) => x !== id);
    if (!bindings[stage].length) delete bindings[stage];
  }
  writeBindings(bindings);
}

/* 节点绑定：每个节点可以挂多份技能，按 order 依次进入提示词 */
export function readBindings() {
  try {
    const raw = JSON.parse(fs.readFileSync(BINDINGS_FILE, 'utf8'));
    return {...DEFAULT_BINDINGS, ...raw};
  } catch {
    return {...DEFAULT_BINDINGS};
  }
}

export function writeBindings(bindings) {
  fs.mkdirSync(path.dirname(BINDINGS_FILE), {recursive: true});
  fs.writeFileSync(BINDINGS_FILE, JSON.stringify(bindings, null, 2), 'utf8');
  return bindings;
}

export function bindSkill(stage, id, on = true) {
  if (!SKILL_NODES.includes(stage)) throw new Error(`未知节点：${stage}`);
  const bindings = readBindings();
  const list = new Set(bindings[stage] ?? []);
  if (on) {
    if (!fs.existsSync(path.join(SKILLS_DIR, `${id}.md`))) throw new Error(`技能不存在：${id}`);
    list.add(id);
  } else {
    list.delete(id);
  }
  const next = [...list];
  if (next.length) bindings[stage] = next; else delete bindings[stage];
  return writeBindings(bindings);
}

export function resetBindings() {
  return writeBindings({...DEFAULT_BINDINGS});
}

export function skillsForStage(stage) {
  const ids = readBindings()[stage] ?? [];
  const all = listSkills();
  return ids.map((id) => all.find((s) => s.id === id)).filter(Boolean);
}

/* 模板渲染：支持 {{brief}} 等基础变量，以及 {{analysis.theme}} 这类逐字段取值 */
export function renderTemplate(tpl, ctx) {
  return String(tpl ?? '').replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_, key) => {
    const value = key.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), ctx);
    if (value == null) return `［未提供 ${key}］`;
    return typeof value === 'string' ? value : JSON.stringify(value);
  });
}

/* 组装某个节点送给模型的提示词；没有绑定技能时返回 null，交回模板引擎/默认提示词 */
export function composeStagePrompt(project, stage) {
  const bound = skillsForStage(stage);
  if (!bound.length) return null;
  const ctx = {
    brief: project.brief,
    style: project.style,
    ratio: project.ratio,
    duration: project.durationTarget,
    sceneCount: project.sceneCount,
    analysis: project.analysis,
    script: project.script,
    artPrompts: project.artPrompts,
    assets: project.assets?.filter((a) => a.status === 'done').map((a) => ({assetId: a.assetId, file: a.file})),
    storyboard: project.storyboard,
    shotPrompts: project.shotPrompts,
    pack: project.pack,
  };
  const systems = bound.map((s) => s.system).filter(Boolean).join('\n\n');
  const body = bound.map((s) => renderTemplate(s.template, ctx)).filter(Boolean).join('\n\n----\n\n');
  return {
    skills: bound.map((s) => ({id: s.id, name: s.name, version: s.version})),
    system: systems,
    user: body,
  };
}
