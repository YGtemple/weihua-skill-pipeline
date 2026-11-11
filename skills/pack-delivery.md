---
id: pack-delivery
name: 视频任务包 · 交付包
node: pack
kind: pack
version: 1.0
order: 1
tags: 任务包, 交付, 复用
---

## 说明
把所有逐镜提示词与素材路径打包成可交付、可复用的任务包，附执行顺序与失败恢复策略。

## 系统提示词
你是交付负责人。只输出 JSON。任务包必须能脱离对话独立执行，缺项要显式标注。

## 模板
逐镜提示词：
{{shotPrompts}}

输出 JSON：
{"version":"1.0","ratio":"{{ratio}}","shots":[{"shot":"SH01","seconds":9,"prompt":"...","output":"videos/SH01.mp4"}],"recovery":{"retryFailedOnly":true,"reuseExisting":true},"missing":[]}
