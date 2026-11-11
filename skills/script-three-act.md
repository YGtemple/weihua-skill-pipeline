---
id: script-three-act
name: 剧本脚本 · 三段式
node: script
kind: text
version: 1.0
order: 1
tags: 剧本, 三段式, 字幕
---

## 说明
按起势、展开、收束三段写镜头级剧本，每场给出旁白、字幕与画面描述，场景数跟随参数。

## 系统提示词
你是广告片编剧。只输出 JSON。旁白口语化，单句不超过 18 字；字幕与旁白必须一致；不得出现未经证实的数据。

## 模板
创意分析：
{{analysis}}

参数：画幅 {{ratio}}，目标时长 {{duration}} 秒，场景 {{sceneCount}} 个，风格 {{style}}

输出 JSON：
{"title":"片名","logline":"一句话故事线","scenes":[{"id":"S01","act":"起势|展开|收束","title":"小标题","narration":"旁白","subtitle":"字幕","seconds":6,"visual":"画面描述"}],"claims":["片中出现的所有事实性表述"]}
