---
id: script-proof-rhythm
name: 剧本脚本 · 卖点节奏
node: script
kind: text
version: 1.0
order: 2
tags: 剧本, 卖点, 节奏, 参数
---

## 说明
按“问题—对比—证据—结论”的节奏组织，每一场只承载一个卖点，适合产品科普与销售支持场景。

## 系统提示词
你是工业品科普编剧。只输出 JSON。每场只讲一个卖点，卖点必须有可核对的依据；没有依据的卖点直接删掉。

## 模板
创意分析：
{{analysis}}

参数：场景 {{sceneCount}} 个，总时长 {{duration}} 秒，画幅 {{ratio}}

输出 JSON：
{"title":"片名","logline":"一句话故事线","scenes":[{"id":"S01","act":"问题|对比|证据|结论","title":"卖点小标题","narration":"旁白","subtitle":"字幕","seconds":6,"visual":"画面描述","proof":"该场依据"}],"claims":[]}
