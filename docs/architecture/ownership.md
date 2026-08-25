# Registry 事实所有权

状态：仓库初始化边界，尚未发生生产切换
日期：2026-08-24

## 目标边界

最终事实所有权固定如下：

| 事实或能力                                     | 唯一所有者            |
| ---------------------------------------------- | --------------------- |
| Passenger、PublicProfile、PassengerPublication | `forest-bus-registry` |
| Passenger 图片及其公开变体                     | `forest-bus-registry` |
| NFC、PassengerAccess、RecoveryIdentity         | `forest-bus-registry` |
| Product、Cart、Order、Payment、Shipping        | `forest-bus-legacy`   |
| 未来产品体验与其特有设计能力                   | `forest-bus-vnext`    |
| 最终公开只读快照                               | `forest-bus-archive`  |

`forest-bus-registry` 是上述 Registry 事实的目标唯一写入方。其他仓库只能通过版本化 API 或事件使用这些事实，不得共享数据库、对象存储写权限或执行运行时双写。

本文件记录最终边界，不表示 Registry 已取得当前生产写入权。生产所有权只能按 [migration-stages.md](migration-stages.md) 的阶段和单独批准记录显式切换。

## Registry 内部边界

- **Passenger**：稳定身份、不可变旅番号及历史别名。
- **PublicProfile**：Passenger 的档案内容。它归 Registry 管理，不是 vNext 或 Legacy 可独立写入的副本。
- **PassengerPublication**：Passenger 的公开可见性、生命周期以及字段和媒体公开决策；它不同于 Legacy 的 ProductPublication，也不压缩成一个布尔值。
- **Media**：Passenger 图片原件、处理状态、公开变体和引用。初始化投影只允许 Registry 管理的 `https://media.forest-bus.com/passengers/*` synthetic 公共边界且禁止 query；生产 origin/CDN 仍须单独批准。vNext 的设计草稿或创作参考素材不因此自动归入 Registry。
- **NFC**：公开 NFC 标识、Binding、写入流程、替换/撤销历史和 Resolver 决策。当前代码只刻画 Legacy alias 的导入兼容；新 Registry NFC token 和发行流程尚未批准。NFC 不是所有权、认证或 PassengerAccess 凭证。
- **Access**：PassengerAccess、RecoveryIdentity、凭证轮换和设备授权。它不自动等同于 Guardian、Omukae 或 Commerce 所有权。

PublicProfile 和公开 Registry 列表可以实现为可重建投影，但投影规则和生产结果仍只由 Registry 拥有。缓存、索引和页面渲染副本不得成为新的事实源。

## 跨仓依赖规则

- Legacy 订单若引用具体 Passenger，只保存稳定 `passengerId` 和 Commerce 自己的交易快照。
- Legacy 通知 Registry 时使用可重放、可去重的 API 或事件；不得直接修改 Registry 存储。
- vNext 可提交明确命令、读取公开或授权查询，并维护可丢弃缓存；不得在 Registry 不可用时先写本地 Passenger/NFC 再补同步。
- Archive 只接收离线、已净化的公开 Bundle；运行时不调用 Registry。

## 明确排除

Registry 不拥有价格、SKU、库存、购物车、订单、支付、物流、未来产品 UI、推荐编排或通用工作流引擎。新的跨领域概念必须先明确事实所有者，不能因为它与 Passenger 有关联就默认放入 Registry。
