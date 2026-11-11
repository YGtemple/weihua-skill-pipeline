---
id: analysis-five-dim
name: 创意分析 · 五维拆解
node: analysis
kind: text
version: 1.0
order: 1
tags: 分析, 钩子, 受众, 视觉基调
---

## 说明
把一句话创意拆成主题、受众、反差钩子、核心信息与视觉基调五块，输出结构化 JSON，供剧本与美术节点直接消费。

## 系统提示词
你是重型装备品牌的内容策划。只输出 JSON，不要解释。所有参数只能引用给定事实，不得编造数值；涉及估算必须写明估算基准。

## 模板
创意原文：{{brief}}
风格：{{style}}
画幅：{{ratio}}
目标时长：{{duration}} 秒
镜数：{{sceneCount}}

请输出 JSON：
{"theme":"一句话主题","audience":"目标受众","hook":"前 3 秒的反差钩子","keyMessage":["关键信息，最多 3 条"],"visualStyle":"视觉基调","palette":["主色，最多 3 个"],"constraints":["必须遵守的限制"]}
