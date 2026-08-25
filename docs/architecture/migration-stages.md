# Registry 迁移阶段

状态：初始化方案，尚未授权生产数据访问或切换
日期：2026-08-24

## 原则

任何时刻，每类事实都只能有一个生产 writer。允许 staging 导入、影子投影和只读对账，但不允许 Legacy 与 Registry 同时接受同一事实的生产写入。

下列 `R-A` 至 `R-E` 是 Registry 自己的迁移阶段标签，不复用、替代或宣称满足 vNext 历史文档中的 canonical Gate 编号。vNext 原 Gate 仍是旧方案的审计资料；新的跨仓 cutover 批准记录需要另行建立。

所有权状态必须显式记录为：

```text
LEGACY_AUTHORITATIVE
→ REGISTRY_STAGING
→ REGISTRY_AUTHORITATIVE
→ ARCHIVED_READ_ONLY
```

状态变化不能由部署、DNS 切换或仓库创建隐式推断。

## R-A：仓库与边界

- 固定所有权、ID、集成和 Archive 导出决策。
- 建立 synthetic 测试与本地开发能力。
- 不读取生产数据，不配置生产凭证，不接受生产写入。

退出条件：文档、架构检查和 synthetic 测试能够证明 Registry 没有吸收 Commerce 或 vNext 体验职责。

## R-B：生产清单与契约

- 枚举 Legacy 中所有 Passenger、PublicProfile、Publication、图片、NFC、Access/Recovery 相关 writer、reader、队列、批处理、Webhook、运营入口和数据库权限。
- 盘点已发行的 `passengerNo`、`publicProfileId`、NFC public ID 语法、重复、缺失和历史 alias，但不得把真实值写入仓库或日志。
- 固定 Legacy、vNext 和 Registry 的版本化 API/事件契约及失败语义。
- 对 Legacy 混合事实逐项给出处置：Commerce Availability/Reservation、
  Journey/Event、Guardian/Omukae、Exhibition、Support，以及身份记录中的
  customer/acquisition/Product snapshot。不得用一个粗粒度 writer fence
  同时误停仍属 Commerce 的能力。
- 由 Archive 消费者验证 Registry synthetic Bundle；这不代表生产 Archive 已就绪。

退出条件：每项生产入口都有明确处置，所有 ID 异常都有人工复核路径，且不存在未列明 writer。

## R-C：确定性迁移与影子读取

- Registry 只接收批准的 staging 导入，保存来源、源记录键、迁移批次、转换版本和源记录可提供的原始时间戳；Registry 自身的 `createdAt`/`updatedAt` 只表示 Registry 记录时间。
- Legacy ID 原样映射；缺失、冲突或不可解释记录进入人工复核，不生成看似正常的新 alias 掩盖问题。
- 构建影子 PublicProfile、Publication、NFC 和 Archive 投影，并与当前公开结果进行聚合对账。
- 影子读取无副作用，不授予 Registry 生产写权限。

退出条件：数量、唯一性、引用完整性、公开隐私和历史 URL/NFC 解析均达到批准阈值。

## R-D：写入切换

切换以有依赖关系的事实组为边界：

- Passenger 组：Passenger、PublicProfile、Publication、Passenger 图片及公开投影。
- NFC 组：NFC Binding、Resolver 和写入流程；必须在 Passenger 组之后或同一批准窗口切换。
- Access 组：PassengerAccess、RecoveryIdentity、凭证和设备授权；启用前必须证明没有另一套生产 writer。

每个切换窗口必须按以下顺序完成：

1. 冻结该事实组的旧写入口，并排空相关任务、队列和重试，记录静止水位；不得用关闭无关 Commerce 流程代替事实组冻结。
2. 先撤销或显式拒绝 Legacy/vNext 旧 principals 对该事实组数据库和 Bucket 的写权限，并同时通过 IAM policy simulation 与真实 `AccessDenied` 探针证明旧 writer 已失效。
3. 仅由隔离的 migration/importer principal 导入最终增量；该 principal 对旧 Legacy DB/Bucket 只能读，旧源全部 mutation actions 必须显式 deny 并通过真实 `AccessDenied` 探针，只可写 Registry staging/final import surface。导入后在静止水位执行最终数量、alias、来源 revision、图片 checksum、缺失名称和时间戳对账。
4. 只有最终对账通过后，才启用 Registry writer fence 并接受该事实组的第一笔生产写入。
5. 验证 API/事件幂等，记录切换版本、静止水位、探针证据和负责人。

Registry 接受第一笔生产写入前可以按批准方案恢复旧 writer。接受第一笔写入后，不得仅靠 DNS 或恢复单个 Legacy 入口回切；必须执行覆盖整个事实组的反向迁移和对账。

## R-E：稳定运行与最终归档

- Legacy 和 vNext 只保留最小 API/事件权限，持续验证不存在直写或双写。
- 定期运行 Registry → Archive synthetic consumer contract 和生产就绪审计。
- 真正终止业务前，另行批准生产快照、图片净化、路由、DNS、回滚和隐私处置，再导出最后快照并切换 `/p/*`、`/n/*`。

Archive synthetic provenance 兼容已提交于
`2d00447a4fd72409debb7847f6b1bdfe4f2a5b96`，但尚未部署。真实图片、生产
ID/历史 URL 清单、快照存储、路由和 cutover 审查仍全部开放。
