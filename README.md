# Cursor-To-OpenAI

English | [中文](README.cn.md)

Forward Cursor API requests to OpenAI, with support for multiple API Keys rotation.

## Features

- 🔑 **Multiple Keys Rotation**: Configure multiple API Keys rotation to improve availability
- 🚀 **Easy Configuration**: One-click configuration script for quick setup
- 📊 **Status Monitoring**: Monitor API Key usage status
- 🔧 **Easy Maintenance**: Convenient maintenance scripts to simplify daily operations

## 🚀 Basic Installation
### Clone Repository
```
git clone https://github.com/liuw1535/cursor-to-openai.git
```
### Enter Project Directory
```
cd cursor-to-openai
```
### Install Dependencies
```
npm install
```

## ⚙️ Configure Project
```
npm run setup
```
- Just fill in the custom key and whether to enable TLS proxy server
- Other options can be skipped by pressing Enter or filled in randomly
- 🛡️ If you frequently encounter account blocking issues, it's recommended to enable TLS server
- If you're not satisfied with the configuration, you can re-run this command to modify it

## 🏃 Start Service
```
npm start
```

## 🔍 Usage
1. Access the management interface: `http://127.0.0.1:3010`
2. Use the blue button at the bottom of the page to get cookies
3. Configure in the Tavern page:
   - API address: `http://127.0.0.1:3010/v1`
   - Key: `sk-text` (if "text" was entered during configuration)

## 📧 Account Registration Recommendations
- Recommended to use domain email (subdomain email is better)
- Search for "cloudfare domain email" for configuration tutorials
- ⚠️ Register no more than 2 accounts at a time to avoid being blocked

## 🛠️ Common Commands
```
npm start           # Start project
npm run setup       # Modify configuration
```

## Environment Configuration

Configure the following key parameters in the `.env` file:

- `API_KEYS`: Mapping relationship between API Key and Cookie (JSON format)
- `USE_TLS_PROXY`: (true) Enable TLS server, which can avoid request blocking issues
- `PROXY_PLATFORM`: The platform corresponding to the TLS server when enabled, default is auto detection

The system will automatically merge API Keys from `.env` and `data/api_keys.json` at startup to ensure data consistency.

## Deployment Method

### Using Docker Compose

```bash
# Create configuration files
cp .env.example .env
mkdir -p data
cp data/admin.example.json data/admin.json

# Create admin account
node scripts/create-admin.js

# Start service
docker compose up -d --build

# View logs
docker compose logs -f

# Stop service
docker compose down
```

## API Usage Example

### Python Example

```python
from openai import OpenAI

# Use custom API Key
client = OpenAI(api_key="your_custom_api_key",
                base_url="http://localhost:3010/v1")

# Or use Cookie directly
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

## Notes

- Please keep your WorkosCursorSessionToken secure
- This project is for learning and research purposes only, please comply with Cursor's terms of use

## Acknowledgements

- This project is based on [cursor-api](https://github.com/zhx47/cursor-api) (by zhx47)
- Integrated content from [cursor-api](https://github.com/lvguanjun/cursor-api) (by lvguanjun)

# Logging System

The project integrates a unified logging system, which can be configured through the following methods:

## Log Level Configuration

1. Set environment variables in the `.env` file
   ```
   LOG_LEVEL=INFO
   LOG_FORMAT=colored
   LOG_TO_FILE=true
   LOG_MAX_SIZE=10
   LOG_MAX_FILES=10
   ```
2. Specify environment variables in the startup command, for example: `LOG_LEVEL=DEBUG npm start`

Supported log levels include:
- ERROR: Only display error messages
- WARN: Display warning and error messages
- INFO: Display general information, warnings, and error messages (default)
- DEBUG: Display debug information, general information, warnings, and error messages
- TRACE: Display all log information

## Log Format

The log format is: `[LEVEL] timestamp log content`, with different levels displayed in different colors for easy differentiation:
- ERROR: Red
- WARN: Yellow
- INFO: Green
- DEBUG: Blue
- TRACE: Cyan
- HTTP: Cyan (dedicated to HTTP request logs)

## HTTP Request Logs

The project uses the Morgan middleware to record HTTP requests, integrated into the unified logging system:

1. Set HTTP log format in the `.env` file:
   ```
   # Options: tiny, combined, common, dev, short
   MORGAN_FORMAT=tiny
   ```

2. HTTP logs will be displayed with the `[HTTP]` prefix, highlighted in cyan for easy identification

3. Morgan format options explanation:
   - `tiny`: The most concise format, including only method, URL, status code, response time
   - `combined`: Standard Apache combined log format, including IP, time, request, status code, response size, referrer, user-agent
   - `common`: Standard Apache common log format, similar to combined but without referrer and user-agent
   - `dev`: Developer-friendly colored format, including method, URL, status code (with color), response time
   - `short`: Shorter format, including method, URL, status code, response time, response size

## File Logs

The project supports outputting logs to both console and files, which can be enabled with the following configuration:

1. Set in the `.env` file: `LOG_TO_FILE=true`
2. Optional configuration:
   - `LOG_MAX_SIZE`: Maximum size of log file, in MB, default 10MB
   - `LOG_MAX_FILES`: Number of historical log files to keep, default 10

Log files are stored in the `logs` folder in the project root directory:
- Current log file: `app.log`
- Historical log file: `app-2023-05-05T12-45-30-000Z.log`

File logs will automatically rotate, creating a new log file when the log file size exceeds the set value and keeping the most recent N files.

## Usage in Code

Different log levels can be used as needed in the code:

```javascript
const logger = require('./utils/logger');

logger.error('This is an error message');
logger.warn('This is a warning message');
logger.info('This is a general information message');
logger.debug('This is a debug message');
logger.trace('This is a trace message');
logger.http('This is an HTTP request log');
```
