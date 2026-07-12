<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## 工程原则

1. **KISS 设计原则** — 保持代码整洁，用最简方案解决问题。
2. **高内聚，低耦合** — 使用精简的设计模式，避免过度工程化。
3. **100% 测试覆盖** — 所有新增功能代码都必须有测试，保证测试通过率达到 100%。
4. **保留测试用例** — 所有测试用例代码必须保留，并输出测试报告。

## 执行纪律

- **先想清楚再写代码** — 陈述假设，不确定就问，杜绝猜测。
- **从最简方案入手** — 只写能解决问题的最少代码，不加任何多余抽象。
- **像手术一样精准修改** — 不碰与需求无关的代码，每行改动都对应明确要求。
- **以目标驱动执行** — 写第一行代码前，把模糊指令转化为可验证的成功标准。
