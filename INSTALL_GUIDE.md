# 安装指南

看起来您的系统中尚未安装Node.js和npm。请按照以下步骤安装必要的依赖，以便能够正常运行Telegram监控机器人。

## 在macOS上安装Node.js

### 方法1：使用Homebrew（推荐）

如果您已经安装了Homebrew，可以使用以下命令安装Node.js：

```bash
# 更新Homebrew
brew update

# 安装Node.js
brew install node

# 验证安装
node -v
npm -v
```

### 方法2：直接从官网下载安装包

1. 访问Node.js官方网站：https://nodejs.org/zh-cn/
2. 下载最新的LTS版本（长期支持版本）安装包
3. 打开安装包并按照提示完成安装
4. 打开终端并验证安装：
   ```bash
   node -v
   npm -v
   ```

## 在Windows上安装Node.js

1. 访问Node.js官方网站：https://nodejs.org/zh-cn/
2. 下载最新的LTS版本安装包
3. 运行安装程序并按照提示完成安装
4. 打开命令提示符或PowerShell并验证安装：
   ```bash
   node -v
   npm -v
   ```

## 在Linux上安装Node.js

### Ubuntu/Debian

```bash
# 更新包列表
sudo apt update

# 安装Node.js和npm
sudo apt install nodejs npm

# 验证安装
node -v
npm -v
```

### CentOS/RHEL

```bash
# 使用EPEL仓库
sudo yum install epel-release

# 安装Node.js和npm
sudo yum install nodejs npm

# 验证安装
node -v
npm -v
```

### 使用Node Version Manager (NVM)（推荐用于所有Linux发行版）

NVM允许您安装和管理多个Node.js版本：

```bash
# 安装NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
# 或者
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# 重新加载shell配置
source ~/.bashrc
# 或者如果使用zsh
source ~/.zshrc

# 安装最新的LTS版本
nvm install --lts

# 验证安装
node -v
npm -v
```

## 安装完成后

安装完成Node.js和npm后，回到项目目录并运行以下命令来安装项目依赖：

```bash
cd /Users/mac/Desktop/telegram bot zf
npm install
```

## 配置环境变量

复制`.env.example`文件并创建`.env`文件：

```bash
cp .env.example .env
```

然后编辑`.env`文件，填入您的机器人Token和管理员ID：

```
BOT_TOKEN=你的机器人token
ADMIN_IDS=管理员ID列表，用逗号分隔
NODE_ENV=production
```

## 启动机器人

依赖安装完成且配置正确后，可以使用以下命令启动机器人：

```bash
# 生产环境
npm start

# 开发环境（支持热重载）
npm run dev
```

## 获取Telegram机器人Token

如果您还没有机器人Token，请按照以下步骤获取：

1. 在Telegram中搜索@BotFather并开始对话
2. 发送`/newbot`命令创建新机器人
3. 按照提示设置机器人名称和用户名
4. 完成后，@BotFather会提供一个API Token，请保存好这个Token

## 获取用户ID

要获取您的用户ID（用于设置ADMIN_IDS）：

1. 在Telegram中搜索@userinfobot并开始对话
2. 机器人会立即回复您的用户ID

---

如果您在安装过程中遇到任何问题，请参考Node.js官方文档或寻求相关技术支持。