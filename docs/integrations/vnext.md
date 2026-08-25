# vNext 集成边界

状态：目标契约，尚未启用生产集成
日期：2026-08-24

## 角色

`forest-bus-vnext` 是未来产品体验的承载方，不是 Passenger、PublicProfile、PassengerPublication、Passenger 图片、NFC、PassengerAccess 或 RecoveryIdentity 的事实源。

vNext 可以：

- 通过 Registry Query 渲染公开、运营者或持有者体验；
- 通过明确的 Registry Command 请求创建或修改 Registry 事实；
- 消费版本化事件，构建带来源版本的可丢弃缓存、搜索索引或页面投影；
- 承载薄型 NFC 设备客户端，但所有 Session、Attempt、Binding、Resolver 与审计状态仍由 Registry 决定。

vNext 不得：

- 建立可独立写入或在故障后回灌的 Passenger/NFC/Access 数据库；
- 复制 PassengerPublication 或字段级隐私规则并据此作权威公开决定；
- 直接写 Registry 对象存储或把自己的 Bucket 当作 Passenger 图片事实源；
- 用 NFC 扫描、UI 状态或本地缓存推断所有权、真伪或 PassengerAccess；
- 成为 Archive Bundle 的中间事实源。

## 设计与媒体

PassengerDesign、设计草稿和创作参考素材可以属于 vNext 的未来产品域，但它们不是具体 Passenger 的现实事实。创建 Passenger 时，vNext 只能提交明确确认后的实际字段及可选的外部设计 provenance；以后修改设计不得追溯覆盖既有 Passenger。

Passenger 图片一旦作为具体 Passenger 的事实被采用，就由 Registry 接收、存储、处理和发布。两个仓库不得共享写入 Bucket。

## 一致性与故障

所有写命令应携带 `commandId`、期望版本、principal 和 correlation ID。Registry 负责幂等、授权、并发控制和审计。

Registry 暂时不可用时，vNext 可以显示明确降级状态或使用标明陈旧版本的只读缓存，但不能本地接受权威写入。恢复后通过查询或事件重建体验状态，不进行双向合并。

vNext ADR-0003 已明确取代“最终 writer 为 vNext”以及自建 Passenger/PublicProfile/NFC/Access 存储的旧结论。生产流量和写入所有权仍须通过迁移 Gate 单独批准。
