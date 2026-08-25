# ADR-0004：Legacy NFC 兼容边界

状态：已接受，用于初始化和迁移；新 NFC 发行决策仍开放
日期：2026-08-24

## 背景

Legacy 已发行 `nfc_<12 uppercase Crockford>` alias，并实现
`ALLOCATED → WRITTEN → VERIFIED → LOCKED` 写入历史。vNext 历史设计提出过
另一套 26 位 token、Session/Attempt 和设备流程，但这些候选没有获得生产
批准。直接把任一方案称作 Registry canonical NFC 都会把迁移兼容和未来设计
混为一谈。

## 决策

初始化代码中的 `NfcBinding` 只表示 `LEGACY_BINDING_PUBLIC_ID`：

- 原样保留已发行 `bindingPublicId` 和 Legacy 状态历史，不把其格式定义为新
  Registry NFC 的永恒格式；
- 独立保存 Resolver disposition；Legacy 中只要 Binding 存在且未替换，
  `ALLOCATED`、`WRITTEN`、`VERIFIED`、`LOCKED` 均可能解析为 `ACTIVE`，
  不能用写卡流程状态猜测 alias 是否公开；
- Resolver URL 必须是无 credentials、query、fragment 的 HTTPS URL，并精确为
  `https://forest-bus.com/n/{bindingPublicId}`；
- Binding 创建必须从已经建立关系的 Passenger/PublicProfile 推导标识，不能让
  调用方任意拼接两个 ID；
- 状态和 `writtenAt`、`verifiedAt`、`lockedAt`、`replacedAt`、`revokedAt`
  必须一致；byte-for-byte read-back 仍是 Legacy 兼容证据；
- NFC alias 只是公开 locator，不是 secret、所有权、认证、Access 或防伪证明。

Registry 在新的 token entropy、生产/staging origin、Session/Attempt、设备锁定、
恢复和运维契约通过安全审查及真实设备验证前，不提供新 NFC 发行命令。未来
契约仍由 Registry 拥有，但必须由新的 ADR 和版本化接口明确批准，不能由当前
Legacy 兼容模型隐式决定。

## Archive v1 映射

- 显式 Resolver `ACTIVE` → `ACTIVE`，与写卡流程状态无关；
- `REPLACED` → `REPLACED`；
- `REVOKED` 没有 Archive v1 disposition，exporter 必须失败并要求显式处置，
  不能将已发行 URL 静默变成 unknown/404。

该映射只证明 synthetic shape 和明确的迁移语义，不批准 NFC 路由切换、DNS、
硬件写入或生产 Archive cutover。
