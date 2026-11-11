/* 生成静态发布用的页面与数据：把 src/web 复制到仓库根，导出五套工程的只读数据。
   页面未接后端时走 static/bootstrap.json 浏览，媒体直接从 data/projects 读取。 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT ?? '8199';
const BASE = `http://127.0.0.1:${PORT}`;
const STATIC_DIR = path.join(ROOT, 'static');

const getJson = async (p) => {
  const res = await fetch(`${BASE}${p}`);
  if (!res.ok) throw new Error(`${p} → ${res.status}`);
  return res.json();
};

const mediaBase = (id) => `data/projects/${id}/`;
const rewrite = (value, id) => {
  if (typeof value === 'string') return value.replaceAll(`/files/${id}/`, mediaBase(id));
  if (Array.isArray(value)) return value.map((v) => rewrite(v, id));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v, id)]));
  return value;
};

fs.mkdirSync(path.join(STATIC_DIR, 'projects'), {recursive: true});
for (const name of ['index.html', 'app.js', 'styles.css', 'bridge.html']) {
  fs.copyFileSync(path.join(ROOT, 'src', 'web', name), path.join(ROOT, name));
}
fs.writeFileSync(path.join(ROOT, '.nojekyll'), '');

const health = await getJson('/api/health');
const {projects} = await getJson('/api/projects');
const skills = await getJson('/api/skills');
const presets = projects.filter((p) => p.preset);

for (const preset of presets) {
  const full = await getJson(`/api/projects/${preset.id}`);
  const clean = rewrite(full, preset.id);
  fs.writeFileSync(path.join(STATIC_DIR, 'projects', `${preset.id}.json`), JSON.stringify(clean, null, 2), 'utf8');
  console.log(`导出工程 ${preset.id}：${clean.storyboard?.length ?? 0} 镜 / ${clean.assets?.length ?? 0} 图`);
}

const bootstrap = {
  generatedAt: new Date().toISOString(),
  health,
  projects: rewrite(presets, 'unused').map((p) => p),
  skills: skills.skills,
  bindings: skills.bindings,
  nodes: skills.nodes,
};
for (const project of bootstrap.projects) {
  // 概要里的封面与成片地址同样指回 data/projects
  project.cover = project.cover ? rewrite(project.cover, project.id) : null;
  project.finalUrl = project.finalUrl ? rewrite(project.finalUrl, project.id) : null;
}
fs.writeFileSync(path.join(STATIC_DIR, 'bootstrap.json'), JSON.stringify(bootstrap, null, 2), 'utf8');
console.log(`完成：${presets.length} 套工程、${skills.skills.length} 份技能 → static/`);
