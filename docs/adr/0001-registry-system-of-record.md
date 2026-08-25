# ADR-0001：Registry 作为身份事实源

状态：已接受，用于仓库初始化
日期：2026-08-24

## 背景

Legacy 同时包含 Commerce 和 Passenger 相关能力；现有 vNext 方案又把 Passenger、Registry 与 NFC 设计成自身核心事实。继续这两种方向会产生第二套身份数据、共享写入或复杂双写。

## 决策

`forest-bus-registry` 是以下事实的最终唯一系统记录：

- Passenger、PublicProfile、PassengerPublication；
- Passenger 图片及公开变体；
- NFC；
- PassengerAccess 与 RecoveryIdentity。

Registry 初始采用模块化单体和单一主要事务边界。公开投影、幂等记录、inbox/outbox 与核心事实由 Registry 统一协调；是否采用何种生产数据库、消息传输或对象存储由后续实现决策确定。

Legacy 继续只拥有 Commerce。vNext 继续承载未来产品体验及其特有能力。两者通过 Registry API 或事件集成，不得直接访问 Registry 数据库或共享图片写入凭证。

## 结果

- `passengerId` 成为跨仓稳定引用，订单不复制 Passenger 事实。
- PublicProfile/Registry 可以缓存或投影，但只有 Registry 能决定其内容和公开状态。
- NFC 扫描不会创建所有权或访问关系；Access 只能通过明确的 Registry 命令产生。
- vNext 的 ADR-0003 已明确取代旧“最终 writer 为 vNext”的所有权结论；旧文档仅保留为历史设计证据。
- Registry 故障时，调用方必须降级或明确失败，不能建立本地权威副本等待回写。

本 ADR 只接受目标架构，不宣告生产 cutover。迁移、权限撤销与首笔生产写入仍受独立 Gate 控制。
