#!/bin/bash
# Vercel 部署脚本
# 用法: ./scripts/deploy.sh [production|preview]

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
PROJECT_NAME="t0-sandbox-bridge"
BUILD_COMMAND="bun run build"
INSTALL_COMMAND="bun install"

# 部署类型
DEPLOY_TYPE="${1:-preview}"

echo -e "${YELLOW}======================================${NC}"
echo -e "${YELLOW}  T-0 Sandbox Bridge 部署脚本${NC}"
echo -e "${YELLOW}======================================${NC}"

# 步骤 1: 安装依赖
echo -e "\n${GREEN}[1/5]${NC} 安装依赖..."
$INSTALL_COMMAND

# 步骤 2: 构建项目
echo -e "\n${GREEN}[2/5]${NC} 构建项目..."
$BUILD_COMMAND

# 验证构建输出
if [ ! -d ".output/public" ]; then
    echo -e "${RED}错误: 构建输出目录 .output/public 不存在${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} 构建成功"

# 步骤 3: 部署到 Vercel
echo -e "\n${GREEN}[3/5]${NC} 部署到 Vercel..."

if [ "$DEPLOY_TYPE" = "production" ]; then
    echo -e "${YELLOW}部署到生产环境...${NC}"
    DEPLOY_OUTPUT=$(vercel --prod --yes 2>&1)
else
    echo -e "${YELLOW}部署到预览环境...${NC}"
    DEPLOY_OUTPUT=$(vercel --yes 2>&1)
fi

# 提取部署 URL
DEPLOY_URL=$(echo "$DEPLOY_OUTPUT" | grep -oP 'https://[a-zA-Z0-9-]+\.vercel\.app' | head -1)

if [ -z "$DEPLOY_URL" ]; then
    echo -e "${RED}错误: 无法获取部署 URL${NC}"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

echo -e "${GREEN}✓${NC} 部署完成: $DEPLOY_URL"

# 步骤 4: 等待部署就绪
echo -e "\n${GREEN}[4/5]${NC} 等待部署就绪..."
sleep 10

# 步骤 5: 验证部署
echo -e "\n${GREEN}[5/5]${NC} 验证部署..."

# 测试沙盒页面 (跟随重定向)
HTTP_STATUS=$(curl -sL -o /dev/null -w "%{http_code}" "${DEPLOY_URL}/sandbox" 2>/dev/null)
if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "${GREEN}✓${NC} 沙盒页面响应正常 (HTTP $HTTP_STATUS)"
else
    echo -e "${YELLOW}⚠${NC} 沙盒页面响应异常 (HTTP $HTTP_STATUS)"
fi

# 测试文档页面
HTTP_STATUS=$(curl -sL -o /dev/null -w "%{http_code}" "${DEPLOY_URL}/docs" 2>/dev/null)
if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "${GREEN}✓${NC} 文档页面响应正常 (HTTP $HTTP_STATUS)"
else
    echo -e "${YELLOW}⚠${NC} 文档页面响应异常 (HTTP $HTTP_STATUS)"
fi

# 测试静态资源
HTTP_STATUS=$(curl -sL -o /dev/null -w "%{http_code}" "${DEPLOY_URL}/assets" 2>/dev/null)
if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "${GREEN}✓${NC} 静态资源响应正常 (HTTP $HTTP_STATUS)"
else
    echo -e "${YELLOW}⚠${NC} 静态资源响应异常 (HTTP $HTTP_STATUS)"
fi

echo -e "\n${GREEN}======================================${NC}"
echo -e "${GREEN}  部署完成!${NC}"
echo -e "${GREEN}======================================${NC}"
echo -e "\n访问地址:"
echo -e "  首页: ${GREEN}${DEPLOY_URL}/${NC}"
echo -e "  沙盒: ${GREEN}${DEPLOY_URL}/sandbox${NC}"
echo -e "  文档: ${GREEN}${DEPLOY_URL}/docs${NC}"
echo -e "\n仪表盘: ${YELLOW}https://vercel.com/dashboard${NC}"

# 如果是生产部署，输出生产 URL
if [ "$DEPLOY_TYPE" = "production" ]; then
    echo -e "\n${GREEN}生产环境部署成功!${NC}"
fi