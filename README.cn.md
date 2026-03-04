# Cursor-To-OpenAI

[English](README.md) | 中文

将Cursor的API请求转发到OpenAI，支持多个API Key轮询。

## 项目特点

- 🔑 **多Key轮询**: 配置多个API Key轮询，提高可用性
- 🚀 **简易配置**: 一键配置脚本，快速搭建环境
- 📊 **状态监控**: 查看API Key使用情况
- 🔧 **易于维护**: 便捷的维护脚本，简化日常操作

## 🚀 基础安装
### 克隆项目
```
git clone https://github.com/liuw1535/cursor-to-openai.git
```
### 进入项目
```
cd cursor-to-openai
```
### 安装依赖
```
npm install
```

## ⚙️ 配置项目
```
npm run setup
```
- 只需填写自定义密钥和是否启用TLS伪造代理服务器
- 其他选项可直接回车跳过或随意填写
- 🛡️ 如频繁遇到封号问题，建议启用TLS服务器
- 配置不满意可重新执行此命令修改

## 🏃 启动服务
```
npm start
```

## 🔍 使用方法
1. 访问管理界面: `http://127.0.0.1:3010`
2. 使用页面底部蓝色按钮获取cookie
3. 在酒馆页面配置:
   - API地址: `http://127.0.0.1:3010/v1`
   - 密钥: `sk-text` (如果配置时输入的是"text")

## 📧 账号注册建议
- 推荐使用域名邮箱(子域名邮箱更佳)
- 搜索"cloudfare 域名邮箱"获取配置教程
- ⚠️ 每次注册账号不超过2个，避免被封

## 🛠️ 常用命令
```
npm start           # 启动项目
npm run setup       # 修改配置
```

## 环境配置

在`.env`文件中配置以下关键参数：

- `API_KEYS`: API Key与Cookie的映射关系（JSON格式）
- `USE_TLS_PROXY`: (true)启用tls服务器，可以避免阻止请求(block)的问题
- `PROXY_PLATFORM`: 启用tls服务器时对应的平台，默认auto自动检测

系统启动时会自动合并`.env`中的API Keys和`data/api_keys.json`中的API Keys，确保数据一致性。

## 部署方式

### 使用Docker Compose

```bash
# 创建配置文件
cp .env.example .env
mkdir -p data
cp data/admin.example.json data/admin.json

# 创建管理员账户
node scripts/create-admin.js

# 启动服务
docker compose up -d --build

# 查看日志
docker compose logs -f

# 停止服务
docker compose down
```

## API使用示例

### Python示例

```python
from openai import OpenAI

# 使用自定义API Key
client = OpenAI(api_key="your_custom_api_key",
                base_url="http://localhost:3010/v1")

# 或直接使用Cookie
# client = OpenAI(api_key="user_...",
#                base_url="http://localhost:3010/v1")

response = client.chat.completions.create(
    model="claude-3-7-sonnet",
    messages=[
        {"role": "user", "content": "Hello."},
    ],
    stream=False
)

print(response.choices)
```

## 注意事项

- 请妥善保管你的WorkosCursorSessionToken
- 本项目仅用于学习和研究目的，请遵守Cursor的使用条款

## 致谢

- 本项目基于[cursor-api](https://github.com/zhx47/cursor-api)(by zhx47)
- 整合了[cursor-api](https://github.com/lvguanjun/cursor-api)(by lvguanjun)的提交内容

# 日志系统

项目集成了统一的日志系统，可以通过以下方式配置：

## 日志级别配置

1. 在 `.env` 文件中设置环境变量
   ```
   LOG_LEVEL=INFO
   LOG_FORMAT=colored
   LOG_TO_FILE=true
   LOG_MAX_SIZE=10
   LOG_MAX_FILES=10
   ```
2. 在启动命令中指定环境变量，例如：`LOG_LEVEL=DEBUG npm start`

支持的日志级别有：
- ERROR：只显示错误信息
- WARN：显示警告和错误信息
- INFO：显示一般信息、警告和错误信息（默认）
- DEBUG：显示调试信息、一般信息、警告和错误信息
- TRACE：显示所有日志信息

## 日志格式

日志格式为：`[级别] 时间戳 日志内容`，不同级别使用不同颜色显示，方便区分：
- ERROR：红色
- WARN：黄色
- INFO：绿色
- DEBUG：蓝色
- TRACE：青色
- HTTP：青色（专用于HTTP请求日志）

## HTTP请求日志

项目使用 Morgan 中间件记录 HTTP 请求，并集成到统一日志系统中：

1. 在 `.env` 文件中设置 HTTP 日志格式：
   ```
   # 选项: tiny, combined, common, dev, short
   MORGAN_FORMAT=tiny
   ```

2. HTTP 日志会以 `[HTTP]` 前缀显示，使用青色高亮，便于识别

3. Morgan 格式选项说明：
   - `tiny`: 最简洁的格式，仅包含方法、URL、状态码、响应时间
   - `combined`: 标准的 Apache 组合日志格式，包含 IP、时间、请求、状态码、响应大小、referrer、user-agent
   - `common`: 标准的 Apache 通用日志格式，类似 combined 但不包含 referrer 和 user-agent
   - `dev`: 开发友好的彩色格式，包含方法、URL、状态码(带颜色)、响应时间
   - `short`: 更短的格式，包含方法、URL、状态码、响应时间、响应大小

## 文件日志

项目支持将日志同时输出到控制台和文件，可以通过以下配置启用：

1. 在 `.env` 文件中设置：`LOG_TO_FILE=true`
2. 可选配置:
   - `LOG_MAX_SIZE`: 日志文件最大大小，单位MB，默认10MB
   - `LOG_MAX_FILES`: 保留的历史日志文件数量，默认10个

日志文件存储在项目根目录的 `logs` 文件夹下:
- 当前日志文件: `app.log`
- 历史日志文件: `app-2023-05-05T12-45-30-000Z.log`

文件日志会自动轮转，当日志文件大小超过设定值时，会创建新的日志文件并保留最近的N个文件。

## 代码中使用

在代码中可以按需使用不同级别的日志：

```javascript
const logger = require('./utils/logger');

logger.error('这是错误信息');
logger.warn('这是警告信息');
logger.info('这是一般信息');
logger.debug('这是调试信息');
logger.trace('这是跟踪信息');
logger.http('这是HTTP请求日志');
```
