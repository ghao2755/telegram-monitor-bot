#!/bin/bash

# 确保脚本以bash执行
export SHELL=/bin/bash

# 设置颜色变量
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # 无颜色

# 显示欢迎信息
function show_welcome() {
    echo -e "${GREEN}======================================${NC}"
    echo -e "${GREEN}  Telegram 监控机器人启动脚本${NC}"
    echo -e "${GREEN}======================================${NC}"
}

# 检查Node.js是否已安装
function check_node() {
    echo -e "${YELLOW}检查Node.js安装情况...${NC}"
    if command -v node &> /dev/null && command -v npm &> /dev/null; then
        NODE_VERSION=$(node --version)
        NPM_VERSION=$(npm --version)
        echo -e "${GREEN}Node.js已安装 (版本: $NODE_VERSION)${NC}"
        echo -e "${GREEN}npm已安装 (版本: $NPM_VERSION)${NC}"
        return 0
    else
        echo -e "${RED}错误: 未找到Node.js或npm，请先安装。${NC}"
        echo -e "${YELLOW}请参考项目中的INSTALL_GUIDE.md文件进行安装。${NC}"
        return 1
    fi
}

# 检查并创建.env文件
function check_env() {
    echo -e "${YELLOW}检查.env配置文件...${NC}"
    if [ -f .env ]; then
        echo -e "${GREEN}.env文件已存在${NC}"
        # 检查必要的环境变量
        if grep -q "^BOT_TOKEN=" .env && grep -q "^ADMIN_IDS=" .env; then
            echo -e "${GREEN}必要的环境变量已配置${NC}"
            return 0
        else
            echo -e "${YELLOW}警告: .env文件缺少必要的环境变量${NC}"
            echo -e "${YELLOW}请确保BOT_TOKEN和ADMIN_IDS已正确设置${NC}"
            return 0 # 继续执行，但提示用户
        fi
    else
        echo -e "${YELLOW}.env文件不存在，正在从.env.example创建...${NC}"
        if [ -f .env.example ]; then
            cp .env.example .env
            echo -e "${GREEN}已创建.env文件，请编辑该文件并设置必要的环境变量${NC}"
            return 1
        else
            echo -e "${RED}错误: 找不到.env.example文件，无法创建.env文件${NC}"
            return 1
        fi
    fi
}

# 安装依赖
function install_deps() {
    echo -e "${YELLOW}安装项目依赖...${NC}"
    npm install
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}依赖安装成功${NC}"
        return 0
    else
        echo -e "${RED}依赖安装失败，请检查错误信息${NC}"
        return 1
    fi
}

# 启动机器人
function start_bot() {
    local mode=$1
    echo -e "${YELLOW}正在启动Telegram监控机器人 (模式: $mode)...${NC}"
    
    if [ "$mode" = "dev" ]; then
        # 开发模式
        npm run dev
    else
        # 生产模式
        npm start
    fi
    
    # 检查退出码，如果是3则表示需要重启
    exit_code=$?
    if [ $exit_code -eq 3 ]; then
        echo -e "${YELLOW}机器人需要重启...${NC}"
        start_bot $mode
    fi
    
    return $exit_code
}

# 主函数
function main() {
    show_welcome
    
    # 检查Node.js
    if ! check_node; then
        exit 1
    fi
    
    # 检查.env文件
    if ! check_env; then
        exit 1
    fi
    
    # 安装依赖
    if ! install_deps; then
        exit 1
    fi
    
    # 确定运行模式
    mode="prod"
    if [ "$1" = "dev" ]; then
        mode="dev"
    fi
    
    # 启动机器人
    start_bot $mode
}

# 执行主函数
main $1