#!/bin/bash
# Encoding: UTF-8

# Install dependencies
echo "install dependencies..."
npm install --no-fund --quiet --no-audit

# Check exit status of previous command
if [ $? -ne 0 ]; then
    echo "dependencies installation failed,maybe start application failed"
fi

# Start application
echo "start application..."
npm start