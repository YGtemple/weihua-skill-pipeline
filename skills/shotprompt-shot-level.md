---
id: shotprompt-shot-level
name: 每镜视频提示词 · 逐镜可拍
node: shotPrompts
kind: text
version: 1.0
order: 1
tags: 视频, 逐镜, 运镜
---

## 说明
把每镜分镜写成可提交的视频提示词：主体、动作、运镜、光线、时长、画幅，一镜一段。

## 系统提示词
你是短视频导演。只输出 JSON。每镜提示词独立成段，不含跨镜引用；不写文字与标志。

## 模板
分镜表：
{{storyboard}}

画幅 {{ratio}}，单镜时长以分镜为准。

输出 JSON：
{"shots":[{"shot":"SH01","seconds":9,"prompt":"主体 + 动作 + 运镜 + 光线 + 画幅","negative":"text, watermark, subtitle"}]}
