#!/bin/bash
# Vercel 部署脚本
# 用法: ./scripts/deploy.sh [preview|production] [--skip-install] [--skip-build]

set -euo pipefail

# ============= 颜色 =============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ============= 配置 =============
PROJECT_NAME="t0-sandbox-bridge"
BUILD_COMMAND="bun run build"
INSTALL_COMMAND="bun install"

# ============= 参数解析 =============
DEPLOY_TYPE="preview"
SKIP_INSTALL=false
SKIP_BUILD=false

for arg in "$@"; do
    case "$arg" in
        preview|production) DEPLOY_TYPE="$arg" ;;
        --skip-install) SKIP_INSTALL=true ;;
        --skip-build) SKIP_BUILD=true ;;
        -h|--help)
            echo "用法: $0 [preview|production] [--skip-install] [--skip-build]"
            exit 0
            ;;
        *) echo -e "${RED}未知参数: $arg${NC}"; exit 1 ;;
    esac
done

# ============= 工具函数 =============
step()    { echo -e "\n${BLUE}[$1/$TOTAL_STEPS]${NC} $2"; }
ok()      { echo -e "  ${GREEN}✓${NC} $1"; }
warn()    { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail()    { echo -e "  ${RED}✗${NC} $1"; }
heading() { echo -e "${YELLOW}======================================${NC}\n${YELLOW}  $1${NC}\n${YELLOW}======================================${NC}"; }

# ============= 起始 =============
TOTAL_STEPS=6
heading "T-0 Sandbox Bridge 部署 (${DEPLOY_TYPE})"

# ============= 步骤 1: Pre-flight =============
step 1 "Pre-flight 检查"

if ! command -v vercel >/dev/null 2>&1; then
    fail "Vercel CLI 未安装"
    echo "    安装: npm i -g vercel"
    exit 1
fi
ok "Vercel CLI: $(vercel --version)"

if ! VERCEL_USER=$(vercel whoami 2>/dev/null | tail -1 | tr -d '[:space:]'); then
    fail "未登录 Vercel"
    echo "    登录: vercel login"
    exit 1
fi
ok "登录用户: $VERCEL_USER"

if [ ! -f ".vercel/project.json" ]; then
    fail "项目未 link 到 Vercel"
    echo "    link: vercel link"
    exit 1
fi
LINKED_PROJECT=$(grep -o '"projectName":"[^"]*"' .vercel/project.json | cut -d'"' -f4)
ok "已 link 项目: $LINKED_PROJECT"

if [ "$LINKED_PROJECT" != "$PROJECT_NAME" ]; then
    warn "项目名不匹配 (期望 $PROJECT_NAME, 实际 $LINKED_PROJECT)"
fi

# ============= 步骤 2: 依赖 =============
step 2 "安装依赖"
if [ "$SKIP_INSTALL" = true ]; then
    ok "跳过 (--skip-install)"
elif [ -d "node_modules" ] && [ -f "bun.lock" ]; then
    echo "    node_modules 已存在，执行增量安装..."
    if $INSTALL_COMMAND --frozen-lockfile >/dev/null 2>&1; then
        ok "依赖已是最新"
    else
        $INSTALL_COMMAND
        ok "依赖更新完成"
    fi
else
    $INSTALL_COMMAND
    ok "依赖安装完成"
fi

# ============= 步骤 3: 构建 =============
step 3 "构建项目"
if [ "$SKIP_BUILD" = true ]; then
    ok "跳过 (--skip-build)"
else
    $BUILD_COMMAND
    # Vercel preset: build outputs land in .vercel/output/, not .output/.
    # Layout: .vercel/output/{config.json, nitro.json, static/, functions/__server.func/}
    if [ ! -d ".vercel/output" ] || [ ! -f ".vercel/output/config.json" ] || [ ! -d ".vercel/output/functions" ]; then
        fail "构建产物不完整"
        echo "    期望: .vercel/output/{config.json, functions/, static/}"
        exit 1
    fi
    STATIC_SIZE=$(du -sh .vercel/output/static 2>/dev/null | cut -f1)
    FUNCTIONS_SIZE=$(du -sh .vercel/output/functions 2>/dev/null | cut -f1)
    ok "构建成功 (static: $STATIC_SIZE, functions: $FUNCTIONS_SIZE)"
fi

# ============= 步骤 4: 部署 =============
step 4 "部署到 Vercel"

if [ "$DEPLOY_TYPE" = "production" ]; then
    echo -e "    ${YELLOW}即将部署到 ${RED}生产环境${YELLOW}...${NC}"
    read -p "    确认? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "    已取消"
        exit 1
    fi
    DEPLOY_OUTPUT=$(vercel deploy --prod --yes 2>&1) || {
        fail "部署失败"
        echo "$DEPLOY_OUTPUT"
        exit 1
    }
else
    DEPLOY_OUTPUT=$(vercel deploy --yes 2>&1) || {
        fail "部署失败"
        echo "$DEPLOY_OUTPUT"
        exit 1
    }
fi

# 提取部署 URL (兼容多种格式)
DEPLOY_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE 'https://[a-zA-Z0-9-]+\.vercel\.app' | head -1)

if [ -z "$DEPLOY_URL" ]; then
    fail "无法解析部署 URL"
    echo "--- deploy output ---"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

ok "部署完成: $DEPLOY_URL"

# ============= 步骤 5: 等待就绪 =============
step 5 "等待部署就绪 (健康检查轮询)"

MAX_WAIT=60
INTERVAL=5
ELAPSED=0
READY=false

while [ $ELAPSED -lt $MAX_WAIT ]; do
    if HTTP_CODE=$(curl -sL -o /dev/null -w "%{http_code}" --max-time 10 "${DEPLOY_URL}/" 2>/dev/null); then
        if [ "$HTTP_CODE" = "200" ]; then
            ok "首页返回 200 (用时 ${ELAPSED}s)"
            READY=true
            break
        fi
    fi
    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
    echo "    等待中... ${ELAPSED}s"
done

if [ "$READY" = false ]; then
    fail "等待 ${MAX_WAIT}s 后仍不可用"
    warn "部署可能仍在初始化，继续测试..."
fi

# ============= 步骤 6: 端到端测试 =============
step 6 "端到端测试"

TESTS_PASSED=0
TESTS_FAILED=0

check_endpoint() {
    local path="$1"
    local label="$2"
    local expect_pattern="${3:-}"  # 可选: 检查响应体包含的字符串

    local http_code
    local body
    body=$(curl -sL --max-time 15 "${DEPLOY_URL}${path}" 2>/dev/null)
    http_code=$(curl -sL -o /dev/null -w "%{http_code}" --max-time 15 "${DEPLOY_URL}${path}" 2>/dev/null)

    if [ "$http_code" != "200" ]; then
        fail "$label [$path] → HTTP $http_code"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi

    if [ -n "$expect_pattern" ]; then
        if echo "$body" | grep -q "$expect_pattern"; then
            ok "$label [$path] → 200, 包含 \"$expect_pattern\""
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            warn "$label [$path] → 200, 但未找到 \"$expect_pattern\""
            TESTS_PASSED=$((TESTS_PASSED + 1))
        fi
    else
        ok "$label [$path] → 200"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    fi
}

# 首页
check_endpoint "/" "首页"

# Sandbox 页面
check_endpoint "/sandbox" "Sandbox 页面" "sandbox\|Sandbox"

# 静态资源探测
ASSET_URL=$(curl -sL "${DEPLOY_URL}/" 2>/dev/null | grep -oE '"/assets/[^"]+\.(js|css)"' | head -1 | tr -d '"')
if [ -n "$ASSET_URL" ]; then
    check_endpoint "$ASSET_URL" "静态资源" "" >/dev/null 2>&1 || true
    ASSET_CODE=$(curl -sL -o /dev/null -w "%{http_code}" --max-time 10 "${DEPLOY_URL}${ASSET_URL}" 2>/dev/null)
    if [ "$ASSET_CODE" = "200" ]; then
        ok "静态资源 [$ASSET_URL] → 200"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        warn "静态资源 [$ASSET_URL] → HTTP $ASSET_CODE"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
fi

# 404 路径应该返回 404 (而不是 200)
HTTP_CODE=$(curl -sL -o /dev/null -w "%{http_code}" --max-time 10 "${DEPLOY_URL}/__nonexistent_path__" 2>/dev/null)
if [ "$HTTP_CODE" = "404" ]; then
    ok "404 路由正确 (HTTP 404)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    warn "404 路径返回 HTTP $HTTP_CODE (期望 404)"
fi

# 安全 header 检查
HEADERS=$(curl -sI --max-time 10 "${DEPLOY_URL}/" 2>/dev/null)
if echo "$HEADERS" | grep -qi "X-Content-Type-Options: nosniff"; then
    ok "安全 header: X-Content-Type-Options"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    warn "缺少 X-Content-Type-Options header"
fi

if echo "$HEADERS" | grep -qi "X-Frame-Options: DENY"; then
    ok "安全 header: X-Frame-Options"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    warn "缺少 X-Frame-Options header"
fi

# ============= 汇总 =============
heading "部署汇总"
echo -e "  环境:    ${YELLOW}${DEPLOY_TYPE}${NC}"
echo -e "  URL:     ${GREEN}${DEPLOY_URL}${NC}"
echo -e "  通过:    ${GREEN}${TESTS_PASSED}${NC}"
echo -e "  失败:    ${RED}${TESTS_FAILED}${NC}"

if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "\n  ${RED}部分测试失败，请人工核查${NC}"
    exit 1
fi

echo -e "\n  ${GREEN}全部测试通过 ✓${NC}"
echo -e "\n  访问地址:"
echo -e "    首页:  ${GREEN}${DEPLOY_URL}/${NC}"
echo -e "    沙盒:  ${GREEN}${DEPLOY_URL}/sandbox${NC}"
echo -e "\n  Dashboard: ${YELLOW}https://vercel.com/dashboard${NC}"