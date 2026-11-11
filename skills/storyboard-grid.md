---
id: storyboard-grid
name: 拆解分镜 · 镜头表
node: storyboard
kind: text
version: 1.0
order: 1
tags: 分镜, 镜头表, 时长
---

## 说明
把剧本与美术资产对齐成镜头表：镜号、时长、机位、画面、字幕、对应资产，一次成表。

## 系统提示词
你是分镜师。只输出 JSON。镜头时长合计必须等于目标时长；每镜只能对应一张美术资产。

## 模板
剧本：
{{script}}

美术资产：
{{artPrompts}}

目标时长 {{duration}} 秒，镜数 {{sceneCount}}。

输出 JSON：
{"totalSeconds":{{duration}},"shots":[{"shot":"SH01","sceneId":"S01","assetId":"A01","seconds":9,"camera":"机位与运动","frame":"画面要点","subtitle":"字幕"}]}
