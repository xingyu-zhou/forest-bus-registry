# ADR-0003：Archive 离线导出契约

状态：synthetic 初始化已接受；生产决策仍开放
日期：2026-08-24

## 背景

Archive 必须在业务最终关闭后独立、只读运行。Registry 因此需要从一开始持续验证可归档性，而不能等到关闭时才尝试映射数据。

Archive v1 原本只接受并在 normalization 中固定
`source.system = forest-bus-legacy`。兼容修正已在 Archive
`2d00447a4fd72409debb7847f6b1bdfe4f2a5b96` 提交，允许
`forest-bus-registry` 并保留来源值；该提交尚未部署，也不构成生产兼容或
cutover 批准。

## 决策

Registry 的目标是提供离线、确定性的 Archive exporter。当前初始化只提供 synthetic Bundle producer，以及从 Passenger/PublicProfile/Publication、已净化图片和 Legacy NFC Binding 推导的失败关闭 mapper：

- 只读取同一快照中的 publication-safe 投影、公开 NFC 路由控制和批准的 tombstone；
- 始终声明 `source.system = forest-bus-registry`，不得伪装成 Legacy；
- 使用显式 `archivedAt` 和可复现的 Registry `sourceRevision`；
- 对数组和对象采用确定性规范化，并生成 checksum；
- 严格 allowlist，遇到未知、私有或无法证明公开来源的字段即失败，不静默删除或猜测；
- 不包含 PassengerAccess、RecoveryIdentity、凭证、客户、订单、支付、支持数据、内部事件 ID、数据库键或原始 NFC 内容；
- 不在 Archive 运行时调用 Registry。

`archivedJourneyStatus` 和 `publicEvents` 的事实所有权尚未批准，当前 mapper 固定为空，不从 Legacy 混合事件中猜测。`REVOKED` NFC 在 Archive v1 没有可表达 disposition，当前 mapper 明确失败，不能静默遗漏已发行 URL。

初始 compatibility fixture 使用完全 synthetic 数据，必须由 Registry 的实际
profile/NFC mapper 机械生成，并交给 Archive 自身的 validator、路由生成器和
图片字节验证消费。Registry 内复制的 Schema 不能取代 Archive 消费者测试。

## 持续验证

- Registry exporter 或公开模型每次变更时运行 synthetic consumer contract。
- 定期使用明确固定的 Archive revision 运行跨仓兼容测试，并报告契约漂移。
- 相同输入与 `archivedAt` 必须产生完全相同的规范 JSON 和 checksum。
- 测试必须覆盖最小/完整档案、隐藏字段、tombstone、ACTIVE/REPLACED NFC、dangling 引用和禁止字段。

## 尚未批准的生产 Gate

synthetic 通过不批准真实生产导出。生产前仍需决定或验证：完整历史 ID/URL inventory、真实图片获取与净化、公开事件及历史状态映射、隐私 provenance、tombstone 操作、快照存储/访问/保留、路由与 DNS、回滚及最终 cutover。

当前 Archive v1 的图片路径和多项表示只获 synthetic Gate 批准；Registry 不得为了让生产数据通过现有 Schema 而伪造 fixture 路径、丢弃历史或填充不存在的事实。
