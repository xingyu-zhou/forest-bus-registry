# ADR-0002：稳定标识与永久别名

状态：已接受，用于初始契约
日期：2026-08-24

## 决策

Registry 生成永久稳定、opaque 的 `passengerId`。初始表示为：

```text
psg_<32 lowercase hexadecimal characters>
```

即正则 `^psg_[0-9a-f]{32}$`。后缀来自 Registry 生成的 UUID 的 16 bytes，以无连字符小写十六进制编码。客户端只能把完整值作为不透明字符串比较、保存和回传，禁止解析 UUID 版本、时间、顺序或其他内部含义。

`passengerNo`、`publicProfileId` 和 NFC public ID 是三个相互独立的永久 alias：

- 不从 `passengerId` 或彼此推导；
- 已发行值迁移时原样保留；
- 永不复用、重新编号或改绑给另一 Passenger；
- Passenger 改名、Publication 变化、NFC 替换或仓库迁移不改变历史解析关系；
- alias 退役时保留 tombstone 或安全解析结果，不把旧值分配给新对象。

内部数据库键不进入 HTTP、事件、NFC Payload 或跨仓引用。Legacy 的订单行引用 Passenger 时必须使用 `passengerId`，而不是数据库键、`passengerNo` 或 `publicProfileId`。

## 迁移规则

迁移映射必须记录来源系统、源记录键、原 alias、`passengerId`、迁移批次、转换版本、源 revision 以及可获得的源创建/更新时间。历史 `passengerNo`、`publicProfileId` 和完整公开 URL 必须作为有类型的 alias 原样盘点，不能只保存当前 canonical 值。源系统存在不可变 revision 时使用 `SOURCE_NATIVE`；不存在时使用 `CANONICAL_RECORD_SHA256`，其值必须是批准 canonicalization 后的原始源记录小写 SHA-256，禁止编造 revision 标签。Registry 的 `createdAt`/`updatedAt` 是 Registry 记录时间，不能冒充 Legacy 原始时间。opaque 来源值必须原样保留或因边界空白等异常进入人工复核，不能通过 trim 等隐式规范化合并两个源键。缺失、重复、冲突或格式异常进入人工复核；不得生成新 alias 来隐藏异常，也不得根据相似名称自动合并 Passenger。

Legacy 已存在的 `provisionalDisplayName` 必须原样迁移，因为它可能是历史公开
页面唯一使用的展示名；不得仅因字段名称含 provisional 就删除。它只有在对应
Publication 已明确为 `PUBLIC` + `ACTIVE` 时才能进入公开/Archive 投影。真正缺失
展示名的记录进入人工复核，不生成占位名。

公开 alias 不是认证或授权凭证。NFC public ID 只能定位 Resolver；Recovery secret 使用独立的高熵凭证及轮换机制，不能由任何公开 ID 派生。

## 结果

跨仓引用不依赖展示编号或 URL 结构。未来可以在不改变 `passengerId` 的前提下增加新 alias 类型，但改变既有格式、重用规则或解析语义需要新的 ADR。
