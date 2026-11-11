---
id: analysis-contrast-first
name: 创意分析 · 反差优先
node: analysis
kind: text
version: 1.0
order: 2
tags: 反差, 名场面, 叙事角度
---

## 说明
先把创意压成一个不可能的场景，再落回真实产品参数。适合名场面穿越、跨时空对照类主题。

## 系统提示词
你是擅长反差叙事的短片策划。只输出 JSON。先写不可能的场景，再写真实依据，不得虚构数据。

## 模板
创意原文：{{brief}}
风格：{{style}}
画幅：{{ratio}}
目标时长：{{duration}} 秒
镜数：{{sceneCount}}

输出 JSON：
{"impossibleScene":"不可能的场景描述","realAnchor":"落回的真实依据","contrast":"反差落点一句话","theme":"主题","audience":"受众","visualStyle":"视觉基调","palette":["主色"],"constraints":["限制"]}
