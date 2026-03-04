#!/data/data/com.termux/files/usr/bin/bash

# Project management script (numeric selection)

echo "Please select an operation:"
echo "1. Update cookie"
echo "2. Start project"
echo "3. Manage emails"
echo "4. Initialize configuration"
echo "5. Update project code"
echo "6. Backup project"
echo "7. Exit"

read -p "Enter a number (1-7): " choice

case $choice in
    1)
        echo "Updating cookie..."
        npm run refresh-cookies
        ;;
    2)
        echo "Starting project..."
        npm start
        ;;
    3)
        echo "Managing emails..."
        npm run manage-emails
        ;;
    4)
        echo "Initializing configuration files..."
        npm run setup
        ;;
    5)
        echo "Updating project code..."
        git pull
        ;;
    6)
        echo "Backing up project..."
        DATE=$(date +%Y%m%d_%H%M%S)
        tar -czf "backup_$DATE.tar.gz" .
        echo "Backup completed: backup_$DATE.tar.gz"
        ;;
    7)
        echo "Exiting"
        exit 0
        ;;
    *)
        echo "Error: Please enter a number between 1-7"
        exit 1
        ;;
esac