# Private Customizations

本文件记录所有私有定制功能，与上游 fork 基线 `d1e98d9` 对比。供合并主分支时追溯和重制。

---

## 总览

基线：`d1e98d9 fix(codebuddy): only send reasoning params when client requests reasoning`
上游最新：`origin/master`（`9845a17 # v0.5.30`）

### 双方都改过的文件

| # | 文件 | 你的改动 | 上游改动 | 实际影响 |
|---|------|---------|---------|---------|
| 1 | `CLAUDE.md` | 新增，项目文档 | **也新增了**，内容完全不同 | **合并时需手动选一** |
| 2 | `.gitignore` | 注释掉 `deploy*.sh` 取消忽略 | 末尾追加 `.graphifyignore` 等 3 条 | 应能自动合并 |
| 3 | `open-sse/config/runtimeConfig.js` | `FETCH_CONNECT_TIMEOUT_MS` 60s → 120s | 添加 `SEARXNG_URL` 和 `envUrl()` 函数 | 应能自动合并 |

> `docker-compose.yml` 不再属于冲突项 — 本地定制已移到 `docker-compose-local.yml`，合并时直接接受上游版本。

### 仅你的分支改过的文件（合并无冲突）

| # | 提交 | 文件 | 说明 |
|---|------|------|------|
| 5 | a45c2e4 | `docker-compose-local.yml` | **本地部署配置**（自定义网络/卷/密码），与上游 `docker-compose.yml` 隔离 |
| 6 | ea43dd2 | `.claude/settings.json` | Claude Code 安全策略（权限拒绝 + PreToolUse hook） |
| 7 | ea43dd2 | `pnpm-lock.yaml` | pnpm lock 文件（上游用 npm，不互通） |
| 8 | ea43dd2 | `src/shared/components/BatchModelSelectModal.js` | 批量选择弹窗组件 |
| 9 | ea43dd2 | `src/shared/components/index.js` | 导出 BatchModelSelectModal |
| 10 | ea43dd2 | `src/app/(dashboard)/dashboard/combos/page.js` | Combo 表单集成批量选择 |
| 11 | b13a2fd | `deploy.sh` | Docker 部署脚本（指向 `docker-compose-local.yml`） |
| 12 | 751d74e | `src/app/(dashboard)/dashboard/providers/\[id\]/CompatibleModelsSection.js` | 集成"测试全部并清理"按钮 |
| 13 | 751d74e | `src/app/(dashboard)/dashboard/providers/\[id\]/TestAllAndCleanButton.js` | 批量测试并自动删除失效模型 |
| 14 | 3f44aea | `src/shared/components/BatchModelSelectModal.js` | 自定义模型区拆 Vision / Other 子分组（同 #8） |
| 15 | bd5a85d | `.codegraph/.gitignore` | CodeGraph 索引排除文件 |

> 以上 11 条 upstream 均未触碰对应文件，合并时不会冲突，cherry-pick 即可。

---

## 冲突文件的详细对比

### `CLAUDE.md`

你的版本（751d74e）：129 行，聚焦项目命令、架构两层结构、数据库层、CLI 包。
上游版本（origin/master）：91 行，包含更多测试说明、`docs/ARCHITECTURE.md` 引用、Translator 引擎说明、RTK 说明。

**合并策略**：保留上游版本作为基础，把你版本中独有的内容（two-layer structure、数据库 repos、CLI 包发布命令）移植过去。

### 3. `.gitignore` — 低风险

你的改动（b13a2fd）：第 69 行 `deploy*.sh` → `#deploy*.sh`（取消忽略）
上游改动：第 75 行后追加 `.graphifyignore`、`graphify-out/*`、`.next-analyze/*`

> git 应能自动合并。若冲突，保留上游新增的 3 条，同时保留你的 `#deploy*.sh`。

### 4. `runtimeConfig.js` — 低风险

你的改动（bd5a85d）：`FETCH_CONNECT_TIMEOUT_MS` 60s → 120s
上游改动：新增 `envUrl()` 函数 + `SEARXNG_URL` 常量（在文件前半段）

> git 应能自动合并。合并后确认 `FETCH_CONNECT_TIMEOUT_MS` 仍是 `120 * 1000`。

---

## 详细变更

### `.claude/settings.json` (ea43dd2)

Claude Code 安全策略：
- 拒绝自动执行 `npm run` / `pnpm run` / `yarn run` / `bun run`
- 拒绝 `cp .env.example .env`（防止覆盖实际配置）
- PreToolUse hook 拦截并提示

### `pnpm-lock.yaml` (ea43dd2)

pnpm lock 文件。合并后运行 `pnpm install` 重新生成。

### `BatchModelSelectModal.js` (ea43dd2 + 3f44aea)

批量选择模型的弹窗组件。按 Provider 分组、折叠、全选/取消。

二次优化（3f44aea）：`__custom_models` 组内按 `getCaps(m)?.vision` 拆为 Vision / Other 子分组，带独立折叠和全选。

### `index.js` (ea43dd2)

```js
export { default as BatchModelSelectModal } from "./BatchModelSelectModal";
```

### `combos/page.js` (ea43dd2)

ComboFormModal 中新增 `<BatchModelSelectModal>`：
```jsx
<BatchModelSelectModal
  onAdd={(newModels) => setModels([...models, ...newModels])}
  addedModelValues={models}
  activeProviders={activeProviders}
/>
```

### `docker-compose.yml` (a45c2e4)

见上方冲突对比。关键定制参数：
- 卷：`/mnt/user/appdata/9router:/app/data`
- 时区：`TZ=Asia/Shanghai`
- 密码：`INITIAL_PASSWORD=9router`
- 网络：`my-service-net`，静态 IP `172.18.0.59`
- 重启：`unless-stopped`

### `deploy.sh` (b13a2fd)

```bash
docker compose down --remove-orphans
docker compose up -d --build
```

### `.gitignore` (b13a2fd)

```diff
- deploy*.sh
+#deploy*.sh
```

### `CompatibleModelsSection.js` (751d74e)

右上角新增 Test All & Clean 按钮：
```jsx
import TestAllAndCleanButton from "./TestAllAndCleanButton";
{allModels.length > 0 && (
  <TestAllAndCleanButton
    allModels={allModels}
    providerStorageAlias={providerStorageAlias}
    onDeleteCustomModel={onDeleteCustomModel}
    onDeleteAlias={onDeleteAlias}
    onTestResult={(id, status) => setModelTestResults(...)}
  />
)}
```

### `TestAllAndCleanButton.js` (751d74e)

遍历所有模型调用 `/api/models/test`，失败的自动删除。custom 模型走 `onDeleteCustomModel`，别名走 `onDeleteAlias`。

### `runtimeConfig.js` (bd5a85d)

```js
FETCH_CONNECT_TIMEOUT_MS: 60 * 1000  → 120 * 1000
```

---

## 合并流程

1. **合并上游**：`git merge origin/master`
2. **解决 1 个冲突**：`CLAUDE.md` 手动合并
3. **确认自动合并**：`.gitignore` 和 `runtimeConfig.js` 验证无误
4. **接受上游 `docker-compose.yml`**：本地定制已在 `docker-compose-local.yml` 中
5. **cherry-pick 其余定制**：
   ```bash
   git cherry-pick ea43dd2   # 跳过大文件 pnpm-lock.yaml，重新生成
   git cherry-pick a45c2e4   # docker-compose-local.yml
   git cherry-pick b13a2fd   # deploy.sh + .gitignore
   git cherry-pick 751d74e   # CompatibleModelsSection.js + TestAllAndCleanButton.js（跳过 CLAUDE.md）
   git cherry-pick bd5a85d   # .codegraph/.gitignore + runtimeConfig.js
   ```
   > 3f44aea（BatchModelSelectModal 优化）已在 ea43dd2 中，无需重复 cherry-pick。
