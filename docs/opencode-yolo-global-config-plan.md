# OpenCode 全局 YOLO 权限配置方案

> 日期: 2026-07-04
> 目标: 配置 OpenCode 全局权限为 YOLO 等价模式，自动批准权限请求。

## 当前环境

本机 OpenCode:

```text
opencode 1.3.2
```

全局配置文件:

```text
~/.config/opencode/opencode.json
```

当前配置已经包含 provider、MCP、plugin、model、compaction 等内容。配置里有敏感 key，修改时必须保留原内容，不重写整份文件。

## 结论

不要写顶层 `yolo: true`。

原因:

1. 当前官方 schema `https://opencode.ai/config.json` 没有顶层 `yolo` 字段。
2. schema 设置了 `additionalProperties: false`。
3. 写入未知字段可能导致配置校验失败或被忽略。

当前版本更稳的 YOLO 等价配置是:

```json
{
  "permission": "allow"
}
```

这表示所有权限请求默认允许。

## 推荐变更

在 `~/.config/opencode/opencode.json` 顶层新增:

```json
"permission": "allow"
```

合并后的形态:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": "allow",
  "compaction": {
    "auto": false,
    "prune": false
  },
  "mcp": {},
  "model": "...",
  "plugin": [],
  "provider": {}
}
```

上面只是结构示例。实际执行时必须保留现有 `mcp`、`plugin`、`provider` 的完整内容。

## 可选细粒度写法

如果不想全局一刀切，也可以改成对象:

```json
{
  "permission": {
    "read": "allow",
    "edit": "allow",
    "glob": "allow",
    "grep": "allow",
    "list": "allow",
    "bash": "allow",
    "task": "allow",
    "external_directory": "allow",
    "todowrite": "allow",
    "question": "allow",
    "webfetch": "allow",
    "websearch": "allow",
    "lsp": "allow",
    "doom_loop": "allow",
    "skill": "allow"
  }
}
```

第一版建议用 `"permission": "allow"`，更短，也更符合 YOLO 语义。

## 执行步骤

1. 备份当前配置:

```bash
cp ~/.config/opencode/opencode.json ~/.config/opencode/opencode.json.backup.$(date +%Y-%m-%d_%H-%M-%S)
```

2. 修改 JSON:

```json
"permission": "allow"
```

3. 校验 JSON:

```bash
node -e "JSON.parse(require('fs').readFileSync(process.env.HOME + '/.config/opencode/opencode.json', 'utf8')); console.log('ok')"
```

4. 验证 OpenCode 可启动:

```bash
opencode --version
```

5. 新开一个 OpenCode session，触发 `bash/edit/webfetch` 类工具调用，确认不再弹权限确认。

## 回滚

如果配置异常，恢复备份:

```bash
cp ~/.config/opencode/opencode.json.backup.YYYY-MM-DD_HH-MM-SS ~/.config/opencode/opencode.json
```

如果只是想关闭 YOLO 等价模式，删除顶层:

```json
"permission": "allow"
```

或改成:

```json
"permission": "ask"
```

## 暂不做

1. 不安装 `opencode-yolo` 插件。
2. 不写 `yolo: true`。
3. 不改 provider、MCP、plugin 配置。
4. 不把 API key 移动位置。

插件会额外改变对话行为。当前目标只是自动批准权限请求，`permission: "allow"` 已覆盖。
