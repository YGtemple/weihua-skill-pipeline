# 卫华短视频流水线 · 技能工作台

一句话创意进，七个阶段出，每个阶段的提示词由**可替换的技能文件**决定。

```
一句话创意 → ①创意分析 → ②剧本脚本 → ③美术提示词 → ④美术资产生成
           → ⑤拆解分镜 → ⑥每镜视频提示词 → ⑦视频任务包
```

## 这套东西怎么来的

这是把两份独立成果合并成的一份：

- **全流程程序**：原有的七阶段流水线（Node 本地服务，真实调用模型、真实生图）。
- **技能工作台**：原来只做提示词装配和技能编排的那套界面。

合并后的关键变化：技能不再是"只影响提示词文本"，而是**真正接在流水线的节点上**。服务端在每个阶段执行前，读取 `skills/` 下绑定的技能文件，把它的「系统提示词」和「模板」渲染成这一段的实际提示词，再交给语言模型。换一份技能文件，这一段的产出就跟着变，不需要改代码。

## 快速开始

1. 装 Node.js 22+。
2. 双击 `启动流水线.bat`（或 `npm start`）。
3. 打开 `http://127.0.0.1:8177/`。

不填任何密钥也能启动：语言模型未启用时走内置模板引擎，五个内置工程、33 张美术、33 条逐镜视频、5 套成片都能直接看。

## 接入模型（两类通道）

点右上角「接入模型」，分成两块填：

**① 语言模型**（分析、剧本、分镜、提示词这些文字环节）

| 接口类型 | 请求地址 | 适用 |
| --- | --- | --- |
| OpenAI 兼容 | `{base_url}/chat/completions`，`Authorization: Bearer` | OpenAI、豆包、通义、DeepSeek、各类中转站 |
| Anthropic | `{base_url}/v1/messages`，`x-api-key` + `anthropic-version` | Claude 官方或兼容网关 |

- `base_url` 对 OpenAI 兼容接口要带 `/v1`，例如 `https://api.openai.com/v1`；Anthropic 填 `https://api.anthropic.com` 即可，程序会自己补 `/v1/messages`。
- 面板里两个按钮可以一键填 OpenAI / Anthropic 的默认值，再改成自己的 key 和模型名。
- 「是否启用」选「接入语言模型」才会真的调用；选「先用模板引擎」时完全不发请求。

**② 图片与视频模型**（美术资产、逐镜视频）

- 图片走 OpenAI 兼容的 `/images/generations`（文生图）与 `/images/edits`（图生图，参考图只接受 http(s) URL 或 base64 data URI）。
- 视频默认只导出每镜提示词 + 任务包（`task-pack.json`、`shot-prompts.txt`），任务包可以交给任意视频模型；填了视频 `base_url` 与模型名后，这一段就按你的通道走。

密钥只写进本机 `config.local.json`，这个文件已被 `.gitignore` 忽略，**不会进仓库**。别人拿到这份代码，填自己的 key 就能跑；不填也能跑，只是走模板引擎。

## 技能

### 节点与技能

可绑技能的节点：`analysis`、`script`、`artPrompts`、`assets`、`storyboard`、`shotPrompts`、`pack`。每个节点默认挂一份内置技能，可在「技能库」里换、解绑、恢复默认。

内置技能（都在 `skills/` 下，纯 Markdown，直接改）：

| 文件 | 名称 | 节点 |
| --- | --- | --- |
| `analysis-five-dim.md` | 创意分析 · 五维拆解 | analysis |
| `analysis-contrast-first.md` | 创意分析 · 反差优先 | analysis |
| `script-three-act.md` | 剧本脚本 · 三段式 | script |
| `script-proof-rhythm.md` | 剧本脚本 · 卖点节奏 | script |
| `art-cinematic.md` | 美术提示词 · 电影感写实 | artPrompts |
| `assets-batch-sheet.md` | 美术资产 · 批量任务单 | assets |
| `storyboard-grid.md` | 拆解分镜 · 镜头表 | storyboard |
| `shotprompt-shot-level.md` | 每镜视频提示词 · 逐镜可拍 | shotPrompts |
| `pack-delivery.md` | 视频任务包 · 交付包 | pack |
| `final-check.md` | 最终成片 · 验收清单 | final |

### 技能文件格式

```markdown
---
id: script-four-beat
name: 剧本脚本 · 四拍
node: script          # analysis / script / artPrompts / assets / storyboard / shotPrompts / pack / any
kind: text
version: 1.0
order: 1
tags: 剧本, 四拍
---

## 说明
这份技能解决什么问题。

## 系统提示词
给模型的角色与硬约束。

## 模板
创意原文：{{brief}}
风格：{{style}}，画幅 {{ratio}}，时长 {{duration}} 秒，镜数 {{sceneCount}}

创意分析：
{{analysis}}

输出 JSON：{...}
```

模板变量：`{{brief}}`、`{{style}}`、`{{ratio}}`、`{{duration}}`、`{{sceneCount}}`，以及上一阶段产物 `{{analysis}}`、`{{script}}`、`{{artPrompts}}`、`{{assets}}`、`{{storyboard}}`、`{{shotPrompts}}`、`{{pack}}`；支持 `{{analysis.theme}}` 这类逐字段取值，缺省渲染成 `［未提供 analysis.theme］`。

### 换技能真的会改变产出

每次执行阶段前，服务端会记录这一段装配了哪份技能、渲染后的提示词长什么样，写进工程的 `skillsApplied`。工作流画布点开任意节点，展开「本节点技能装配」就能看到实际送入模型的提示词。技能返回的 JSON 结构可以和内置模板不一样，服务端会做结构收敛（例如 `{"shots":[...]}` 和数组两种写法都能吃），不会因为换技能把流程搞断。

## 自动与手动

七个节点每个都能单独切「自动生成 / 手动维护」：

- **自动**：点「重跑此阶段」或跑全流程，这一段由绑定的技能 + 模型产出。
- **手动**：切过去之后，一键全流程会跳过这一步（日志写「为手动维护，跳过不覆盖」），你改的东西不会被覆盖。
- **改产物**：每个文字节点的「原始 JSON」可以直接编辑，改完点保存就落盘（分析、剧本、美术提示词、分镜表、逐镜提示词都支持）。
- **改提示词**：节点里展开「本节点技能装配」→「手动编辑这一段的提示词」，可以整段改写系统提示词和用户提示词；保存后单跑这一步即生效，「恢复技能提示词」可以退回技能版本。
- **换美术图**：美术资产每张都有「换成我的图」，上传自己的 png / jpg / webp 直接替换，不调用生图接口（记录里标「手工替换」），后续分镜与任务包会引用这张图。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 服务状态、各通道是否就绪 |
| GET/POST | `/api/config` | 读/写本机配置（密钥脱敏返回） |
| POST | `/api/config/test-llm` | 测语言模型连通性 |
| POST | `/api/config/test-image` | 测图片通道并列出模型 |
| GET | `/api/skills` | 技能列表 + 节点绑定 |
| POST | `/api/skills` | 上传技能（body: `{markdown}`），同 id 覆盖 |
| DELETE | `/api/skills/:id` | 删除技能（自动解除绑定） |
| POST | `/api/skills/bind` | 绑定/解绑（`{stage,id,on}`） |
| POST | `/api/skills/reset` | 恢复默认绑定 |
| GET | `/api/projects` | 工程列表 |
| POST | `/api/projects` | 新建工程（支持多主题 × 多变体） |
| POST | `/api/projects/:id/run` | 跑阶段或全流程（`{stage:"all"\|...}`） |
| GET | `/api/projects/:id/task-pack.json` | 下载任务包 |
| GET | `/api/projects/:id/shot-prompts.txt` | 下载每镜提示词 |

## 目录

```
src/server/    index.js 路由 · pipeline.js 七阶段 · skills.js 技能槽 · llm.js 双接口 · image.js 图片通道 · store.js 配置与工程
src/web/       工作台前端（工程中心 / 工作流画布 / 技能库 / 一键制作 / 接入模型）
skills/        技能文件（Markdown，可直接编辑或上传替换）
data/          facts.json 事实库 · projects/ 工程与产物 · skill-bindings.json 节点绑定
config.example.json   配置模板（含双通道说明）
```

## 边界

- 技能驱动的是**提示词**，不是模型能力的上限：语言模型决定的文字质量、图片模型决定的画面质量，仍然取决于你接的通道。
- 美术资产生成是付费接口，失败会自动重试，重试次数由 `IMAGE_MAX_ATTEMPTS` 控制；单张超时会标注在该资产上，可单独重跑。
- 视频环节默认只产出任务包，不自动合片；合片仍按原有后期流程处理。
