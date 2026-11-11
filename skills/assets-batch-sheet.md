---
id: assets-batch-sheet
name: 美术资产 · 批量任务单
node: assets
kind: image
version: 1.0
order: 1
tags: 生图, 批量, 重试, 落盘
---

## 说明
把美术提示词整理成批量任务单：每张图的文件名、尺寸、重试策略与落盘路径一次写清，失败只补单张。

## 系统提示词
你是资产生产调度。只输出 JSON。任务必须可逐个重跑，文件名与镜头编号一一对应。

## 模板
美术提示词：
{{artPrompts}}

输出 JSON：
{"concurrency":2,"timeoutSeconds":180,"retry":{"maxAttempts":2,"on":["timeout","rate_limit"]},"tasks":[{"assetId":"A01","file":"assets/A01.png","size":"1536x1024","prompt":"英文提示词"}]}
