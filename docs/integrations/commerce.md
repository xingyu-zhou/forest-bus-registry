# Legacy Commerce 集成边界

状态：目标契约，尚未启用生产集成
日期：2026-08-24

## 所有权

`forest-bus-legacy` 独立拥有 Product、Cart、Order、Payment 和 Shipping。Registry 不建立这些 Aggregate 的副本，也不根据价格、库存或支付状态作 Commerce 决策。

普通商品无需引用 Registry。销售具体 Passenger 时，订单只保存 Registry 的稳定 `passengerId`，并可保存 Commerce 自己所需的不可变交易展示快照；该快照不能回写或覆盖 Passenger。

## 交互

同步查询只用于验证 Passenger 引用是否存在且可被该集成使用。它不返回或判断价格、库存、可购买性、订单状态或支付状态。

需要通知 Registry 的 Commerce 事实使用版本化、幂等的 API 或事件：

- Legacy 通过 transactional outbox 发布；
- Registry 通过 inbox 按 `eventId` 去重；
- inbox 首次看到 `eventId` 时即原子认领其 fingerprint；即使 Passenger 尚不存在而返回 `NOT_FOUND`，producer 也不得用同一 ID 更换 payload，原事件可以原样重试；
- 传输采用 at-least-once，重复投递不得重复产生 Access 或其他副作用；
- envelope 至少包含 `eventId`、事件类型和版本、`passengerId`、发生时间、producer、causation ID 与 correlation ID；
- `orderId` 等仅作为不透明外部引用，不扩展为 Registry Order 模型。

只有名称和业务语义已经批准的具体事实，例如未来的 `PassengerSaleConfirmed.v1`，才能触发 Registry 命令。初始化阶段只固定通道和边界，不预设“下单”“支付”“发货”自动等同于 Departure、Omukae、所有权或 PassengerAccess。

## 写入与失败规则

- Legacy 绝不持有 Registry 数据库或对象存储写权限。
- Registry 不可用时，Legacy 不得先创建本地 Passenger/NFC/Access 再补同步。
- 已保存的 `passengerId` 可以继续作为历史订单引用；新的、未经验证的 Passenger 引用必须明确失败或进入获批的待处理流程。
- 事件失败通过 outbox 重试和对账处理，不通过双写事务掩盖。
- 服务凭证使用最小 scope，例如引用读取和指定 Commerce 事件提交；不得获得通用 Passenger 写权限。

生产启用前必须完成契约测试、重放测试、权限验证、writer fence 和切换 Gate。
