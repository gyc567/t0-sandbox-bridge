# Provider AML File Download + Tracking — 方案

> 状态：方案稿（待实施）
>
> 目标：OFI 上传 AML 文件后，Provider 端能下载到真实文件本体，并能在审计日志中跟踪上传动态。

## 1. 现状分析

| 项 | 当前状态 |
|---|---------|
| **OFI 端** | 选了 `File` 对象，但只把 metadata（filename / size / type）发给 server。**文件本体被丢弃** |
| **后端存储** | `Payment.amlFile` 只存 metadata 4 字段。**没有 blob 存储** |
| **Provider 端** | Panel 显示"AML file (from OFI): report.pdf (12 KB) at ..."，但**没有 Download 按钮**（也没数据可下载） |
| **审计轨迹** | 没有任何 "AML file uploaded" 事件。`OfiAmlEvent` 只有 approve/reject 决策 |

这是**双重问题**：缺下载能力 + 文件本体根本没传过来。

## 2. 设计决策

| 维度 | 选择 | 理由 |
|------|------|------|
| **文件存储** | 内存 Map（Uint8Array） | Sandbox-only；改动最小；dev 阶段足够 |
| **Provider 下载** | Server-fn 返回 base64，前端 Blob URL + `<a download>` | 不引入独立 binary 路由；改动小 |
| **跟踪粒度** | 单一 `AmlFileUploaded` 事件（paymentId / filename / fileSize / uploadedAt） | 覆盖核心审计需求；不增加 Provider UI 复杂度 |

## 3. 数据流

```
OFI 浏览器                  routes/ofi.tsx                server-fn                  SandboxNetwork
┌──────────┐                ┌─────────────┐               ┌─────────────┐            ┌──────────────┐
│ <input>  │── File ───────▶│ onUploadAml │──base64 + ──▶│ ofiUpload   │──Uint8 ──▶│ amlBlobs Map │
│ (file)   │                │   File       │  meta       │  AmlFileFn  │  Array     │ (per payment)│
└──────────┘                └─────────────┘               └─────────────┘            └──────────────┘
                                                                                          │
                                                                                          │ recordAmlFile
                                                                                          ▼
                                                                              ┌──────────────────────┐
                                                                              │ Payment.amlFile.meta │
                                                                              └──────────────────────┘

Provider 浏览器              routes/provider.tsx           server-fn
┌──────────┐                ┌─────────────┐               ┌──────────────┐
│ Download │──click────────▶│ onDownload  │───────────────▶│ downloadAml │──Uint8 ──▶ base64 → blob URL
│  button  │                │   AmlFile   │               │   FileFn    │  Array         → <a download>
└──────────┘                └─────────────┘               └──────────────┘
```

## 4. 文件改动清单

| 文件 | 性质 | 内容 |
|------|------|------|
| `src/lib/t0/types.ts` | 修改 | `AmlFileBlob` 类型；`AmlFileUploaded` NetworkEvent |
| `src/lib/t0/provider.ts` | 修改 | `amlBlobs: Map<string, Uint8Array>` + `recordAmlBlob` / `getAmlBlob` |
| `src/lib/t0/network.ts` | 修改 | 转发 `recordAmlBlob` / `getAmlBlob` 包装 |
| `src/lib/t0/aml-blob.ts` | **新增** | `bytesToBase64` / `base64ToBytes` 纯函数工具（Node + browser 双路径） |
| `src/lib/t0/t0.functions.ts` | 修改 | `ofiUploadAmlFileFn` 加 `bytesBase64` 字段；新增 `downloadAmlFileFn` |
| `src/routes/ofi.tsx` | 修改 | `onUploadAmlFile` 用 `file.arrayBuffer()` → base64 |
| `src/routes/provider.tsx` | 修改 | 新增 `onDownloadAmlFile(paymentId)` + blob URL + `<a download>` |
| `src/components/provider/ManualAmlPanel.tsx` | 修改 | 加 Download 按钮 + `onDownloadAmlFile` prop |
| `src/lib/t0/aml-blob.test.ts` | **新增** | 4 个 base64 helper 测试 |
| `src/lib/t0/provider.test.ts` | 增量 | `recordAmlBlob` / `getAmlBlob` 测试 |
| `src/lib/t0/t0.functions.aml.test.ts` | 增量 | 上传后下载字节级 round-trip；不存在 payment 下载抛错 |
| `src/components/provider/ManualAmlPanel.test.tsx` | 增量 | Download 按钮存在 + handler 测试 |

## 5. 关键代码骨架

### 5.1 Blob 存储（provider.ts）

```typescript
private readonly amlBlobs = new Map<string, Uint8Array>();

recordAmlBlob(paymentId: string, bytes: Uint8Array): void {
  if (!this.payments.has(paymentId)) throw new Error("unknown payment");
  this.amlBlobs.set(paymentId, bytes);
}

getAmlBlob(paymentId: string): Uint8Array | undefined {
  return this.amlBlobs.get(paymentId);
}
```

### 5.2 Server-fn（t0.functions.ts）

```typescript
export const ofiUploadAmlFileFn = createServerFn({ method: "POST" })
  .validator((d: {
    paymentId: string;
    filename: string;
    fileSize: number;
    fileType: string;
    bytesBase64: string;
  }) => d)
  .handler(async ({ data }) => {
    const bytes = base64ToBytes(data.bytesBase64);
    const reviewResult = await reviewAmlUpload({
      paymentId: data.paymentId, filename: data.filename,
      fileSize: data.fileSize, fileType: data.fileType,
    });
    sandboxNetwork.recordAmlBlob(data.paymentId, bytes);
    sandboxNetwork.recordAmlFile(data.paymentId, {
      filename: data.filename, fileSize: data.fileSize,
      fileType: data.fileType, uploadedAt: Date.now(),
    });
    // Emit audit event.
    providerService.emitEvent({
      type: "AmlFileUploaded",
      paymentId: data.paymentId,
      filename: data.filename,
      fileSize: data.fileSize,
      uploadedAt: Date.now(),
    });
    return reviewResult;
  });

export const downloadAmlFileFn = createServerFn({ method: "POST" })
  .validator((d: { paymentId: string }) => d)
  .handler(async ({ data }) => {
    const payment = sandboxNetwork.listPayments().find((p) => p.id === data.paymentId);
    if (!payment?.amlFile) throw new Error("no AML file for payment");
    const bytes = sandboxNetwork.getAmlBlob(data.paymentId);
    if (!bytes) throw new Error("AML file metadata present but blob missing");
    return {
      filename: payment.amlFile.filename,
      fileType: payment.amlFile.fileType,
      bytesBase64: bytesToBase64(bytes),
    };
  });
```

### 5.3 前端下载（routes/provider.tsx）

```typescript
const onDownloadAmlFile = async (paymentId: string) => {
  await run(async () => {
    const result = await downloadAmlFile({ data: { paymentId } });
    const bytes = base64ToBytes(result.bytesBase64);
    const blob = new Blob([bytes], { type: result.fileType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
};
```

### 5.4 OFI 发送文件字节（routes/ofi.tsx）

```typescript
const onUploadAmlFile = async (paymentId: string, file: File) => {
  await run(async () => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const bytesBase64 = bytesToBase64(bytes);
    await uploadAmlFile({
      data: {
        paymentId, filename: file.name, fileSize: file.size,
        fileType: file.type || "application/octet-stream",
        bytesBase64,
      },
    });
  });
};
```

### 5.5 base64 编解码（src/lib/t0/aml-blob.ts）

```typescript
export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
```

### 5.6 UI 增量

```
AML file (from OFI): report.pdf (12 KB) at 12:34  [⬇ Download]
```

只多一个按钮。`<Button size="sm" variant="ghost">` + `lucide-react` 的 `Download` 图标。`disabled={busy || !hasFile}`。

## 6. NetworkEvent 新增

```typescript
| {
    type: "AmlFileUploaded";
    paymentId: string;
    filename: string;
    fileSize: number;
    uploadedAt: number;
  };
```

## 7. 测试覆盖策略

| 测试文件 | 增量 | 用例数 |
|---------|------|--------|
| `aml-blob.test.ts` | 新增 | 4 (字节级 round-trip / 空 / 中文文件名 / 大文件) |
| `provider.test.ts` | 增量 | 3 (`recordAmlBlob` / `getAmlBlob` / blob 独立于 metadata) |
| `t0.functions.aml.test.ts` | 增量 | 3 (上传后下载字节级一致 / 不存在 payment 下载抛错 / metadata+blob 都写对) |
| `ManualAmlPanel.test.tsx` | 增量 | 3 (有 amlFile 时按钮存在 / legacy 警告时按钮禁用 / click 触发回调) |

预期：~752 + 13 = **~765** 测试；新功能 100% 行覆盖。

## 8. 风险点

| 风险 | 缓解 |
|------|------|
| 10MB 文件 base64 后 ~13MB，server-fn JSON 传输可能慢 | sandbox 限制 10MB 已经存在；base64 1.33×大小可接受 |
| `btoa` 在大文件上 String.fromCharCode 拼接 O(n²) | 用 `Buffer.from(bytes).toString('base64')` 在 Node 端（dev/prod 都走 Node），避免浏览器路径 |
| 内存 Map 不持久化 | **明示是 sandbox-only**；文档里写清楚生产环境要走真实存储（对象存储 / KMS 加密） |
| TanStack Start server-fn 是否支持 Uint8Array 返回 | 测试用 base64 string 兜底，**完全不走 Uint8Array 返回** |
| Dev server SSR / hydration 期间 `window` undefined | base64 工具纯函数，无 DOM 依赖 |

## 9. 不在范围

- 不修 `unknown quote` external-quote bug（独立 PR）
- 不动 OFI / Provider 其他 tab
- 不动 Quote management、payout
- 不写 Provider 端的 AmlActivityLog panel（可选增量）
- 不持久化到磁盘
- 不改 sandbox 默认 AML 是 mandatory 的行为
- 不动 10MB 文件大小上限

## 10. 设计原则对照

- **KISS**：内存 Map + base64 字符串，避免 multipart/form-data；UI 只加一个按钮
- **高内聚**：blob 存储在 `PayoutProviderService`（已有所有 payment 状态），UI 只展示
- **低耦合**：`downloadAmlFileFn` 只读，不依赖 review 逻辑；OFI 上传和 Provider 下载各自独立 server-fn
- **不影响无关**：仅触及 AML 链路 + Provider panel + OFI upload handler
- **100% 新功能覆盖**：每个新方法 + 每个新 server-fn + UI 按钮都有测试

## 11. 实施顺序

1. **Phase 1** — `types.ts` 加 `AmlFileBlob` + `AmlFileUploaded` NetworkEvent
2. **Phase 2** — `provider.ts` 加 `amlBlobs` Map + `recordAmlBlob` / `getAmlBlob`
3. **Phase 3** — `network.ts` 转发两个方法
4. **Phase 4** — `aml-blob.ts` 新文件 + base64 helpers + 测试
5. **Phase 5** — `t0.functions.ts` 重构 `ofiUploadAmlFileFn` + 新增 `downloadAmlFileFn` + emit `AmlFileUploaded` 事件
6. **Phase 6** — `routes/ofi.tsx` `onUploadAmlFile` 改用 `file.arrayBuffer()` → base64
7. **Phase 7** — `routes/provider.tsx` `onDownloadAmlFile` + blob URL + `<a download>` 触发
8. **Phase 8** — `ManualAmlPanel.tsx` 加 Download 按钮 + tests
9. **Phase 9** — typecheck + 全量测试 + 覆盖率 + 浏览器 E2E + 测试报告