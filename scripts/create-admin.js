const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const ADMIN_FILE = path.join(__dirname, '../data/admin.json');

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Generate salt
function generateSalt() {
    return crypto.randomBytes(16).toString('hex');
}

// Hash password with salt
function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

// Prompt user for input
function question(query) {
    return new Promise((resolve) => {
        rl.question(query, resolve);
    });
}

async function main() {
    try {
        console.log('Create admin account\n');

        // Get user input
        const username = await question('Enter admin username: ');
        const password = await question('Enter admin password: ');

        // Generate salt and password hash
        const salt = generateSalt();
        const hash = hashPassword(password, salt);

        // Create admin data
        const adminData = {
            admin: {
                username,
                salt,
                hash
            }
        };

        // Ensure data directory exists
        const dataDir = path.dirname(ADMIN_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Write to file
        fs.writeFileSync(ADMIN_FILE, JSON.stringify(adminData, null, 2));

        console.log('\nAdmin account created successfully!');
        console.log('Please keep account information secure. Do not commit admin.json to version control.');

    } catch (error) {
        console.error('Failed to create admin account:', error);
    } finally {
        rl.close();
    }
}

main(); 