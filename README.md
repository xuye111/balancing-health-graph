# 平衡健康图谱：两问题开源框架示例

这是一个可本地运行的慢病健康管理知识图谱框架示例。它保留了两个可追溯问题，用于展示本体约束、确定性查询、精选路径与证据来源如何在浏览器中协同工作。

示例仅面向普通成年人肥胖、高血压和糖尿病的院外、非药物健康管理知识展示；不提供诊断、处方、治疗决策、个体风险判断、评分或在线 API。

## 示例范围

- 2 个固定问题、2 条精选路径
- 22 个节点、28 条关系
- 18 条证据注释、12 条来源记录
- 原生 ES Modules、JSON 与 Python 标准库；无安装依赖

其中一个问题展示肥胖与高血压可共同关注的生活方式行动；另一个问题仅比较三个健康状态直接连接的影响因素。查询结果保留引用、来源和 `pending_human_review` 状态，状态本身不等同于医学审核结论。

## 图谱与本体

`ontology/chronic-care-ontology.json` 定义节点类型、关系类型、主题和审核状态。`data/` 中的节点、关系、证据、路径和问题均由 ID 相互引用；`web/query-model.js` 根据问题的起始节点、允许关系和深度执行确定性查询；`web/` 提供本地浏览界面。

本公开包是两个问题的最小框架样本，不是完整本地知识资产的镜像，也不能用于推断完整资产的规模、内容、验证范围或发布状态。

## 零依赖运行与验证

在本目录执行：

```sh
node examples/query.mjs
node examples/query.mjs q_shared_factors_three_conditions
python3 scripts/validate_graph.py
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/*.test.mjs
```

`web/index.html` 可由任意静态文件服务器查看。查询示例直接从本地 JSON 读取数据，不调用外部模型或网络服务。

## 发布维护者核验

发布前，请在内部源码仓库执行 `node scripts/verify_public_release.mjs`，并核对内部源码仓库中的 `release/PUBLIC_RELEASE_MANIFEST.md`。该核验器和清单不随最小公开包复制；公开包仍使用本节前述的零依赖命令自检。

## 边界

请先阅读 [DATA_NOTICE.md](DATA_NOTICE.md) 与 [CONTRIBUTING.md](CONTRIBUTING.md)。本示例不构成医疗建议或法律意见；外部出版物的权利与再发布条件并未因代码许可而改变。
