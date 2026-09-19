# 贡献说明

欢迎改进框架、可访问性、验证和文档。提交前请保持范围清晰：普通成年人、肥胖/高血压/糖尿病、院外非药物健康管理；不要加入虚拟患者、临床诊疗、药物、评分、自由文本 AI 问答或在线 API。

涉及节点、关系、证据或来源时，应保留可追溯 ID、实际审核状态和来源边界。不要把 `pending_human_review` 表述为已完成医学审核，也不要把工程验证表述为数据许可或法律结论。

提交前运行：

```sh
python3 scripts/validate_graph.py
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.mjs
```

请为可观察行为补充最小测试，并保持两个固定问题可独立运行。
