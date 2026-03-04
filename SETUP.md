# Cursor-To-OpenAI One-Click Setup Guide

This document will guide you through setting up the Cursor-To-OpenAI environment using the one-click configuration tool.

## Preparation

Before you begin, ensure you have:

1. Forked the [Cursor-Register-fix](https://github.com/liuw1535/Cursor-Register-fix) repository to your GitHub account
2. Created a GitHub Personal Access Token with `repo` permission
3. At least one Gmail account with two-factor authentication enabled
4. Created an Application Password for your Gmail account

## Configuration Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Run the Configuration Script

```bash
npm run setup
```

Or run directly:

```bash
node setup.js
```

### 3. Enter Information According to Prompts

The script will guide you to enter the following information:

- GitHub username: Your GitHub account username
- GitHub Token: Your Personal Access Token
- API Key: Custom API Key for accessing the service
- Gmail account: Gmail address for automatic Cursor account registration
- Gmail Application Password: Application password for the Gmail account (not the email password)

### 4. Steps to Create Application Password

If you have not yet created a Gmail application password, follow these steps:

1. Visit [Google Account Security Settings](https://myaccount.google.com/security)
2. In the "Signing in to Google" section, click "2-Step Verification"
   (If 2-Step Verification is not enabled, you need to enable it first)
3. At the bottom of the page, find "App passwords" and click to enter
4. In the "Select app" dropdown, choose "Other (Custom name)"
5. Enter a name, for example "Cursor Registration"
6. Click "Generate"
7. Copy the generated 16-digit application password (format: xxxx xxxx xxxx xxxx)

### 5. Manage Email Configuration

The system provides a dedicated email configuration management tool to add, modify, or delete emails at any time:

```bash
npm run manage-emails
```

Using this tool you can:
- View all configured emails
- Add new Gmail accounts
- Modify existing Gmail account configuration
- Delete Gmail accounts that are no longer in use

## After Configuration

After configuration is complete, you can:

1. Start the service:

```bash
npm start
```

2. Manually trigger Cookie refresh:

```bash
npm run refresh-cookies:force
```

## Configuration File Description

The script generates an `.env` file containing the following main configurations:

- `API_KEYS`: API Key to Cookie mapping
- `GITHUB_OWNER`: Your GitHub username
- `GITHUB_TOKEN`: Your GitHub Personal Access Token
- `REGISTER_EMAIL_CONFIGS`: Gmail account configuration for automatic registration

## Notes

1. GitHub Token needs repo permission to access your forked repository
2. Gmail Application Password is different from your Gmail login password; it is specifically generated for third-party applications
3. MIN_COOKIE_COUNT is set to 1000 to ensure the system will attempt to refresh Cookies
4. After configuration, you can view and manage Cookie status through the Web interface
5. Always ensure at least one valid Gmail account is configured, otherwise the auto-refresh feature will not work properly
