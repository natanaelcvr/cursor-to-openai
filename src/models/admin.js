const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Admin data file path
const ADMIN_FILE = path.join(__dirname, '../../data/admin.json');
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Ensure data directory exists
const dataDir = path.dirname(ADMIN_FILE);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure admin.json file exists
if (!fs.existsSync(ADMIN_FILE)) {
    fs.writeFileSync(ADMIN_FILE, JSON.stringify({ admin: null }), 'utf8');
}

class Admin {
    constructor() {
        this.loadAdmin();
    }

    // Load admin data
    loadAdmin() {
        try {
            const data = fs.readFileSync(ADMIN_FILE, 'utf8');
            this.admin = JSON.parse(data).admin;
        } catch (error) {
            console.error('Failed to load admin data:', error);
            this.admin = null;
        }
    }

    // Save admin data
    saveAdmin() {
        try {
            fs.writeFileSync(ADMIN_FILE, JSON.stringify({ admin: this.admin }), 'utf8');
        } catch (error) {
            console.error('Failed to save admin data:', error);
            throw error;
        }
    }

    // Check if admin already exists
    hasAdmin() {
        return !!this.admin;
    }

    // Register admin
    register(username, password) {
        if (this.hasAdmin()) {
            throw new Error('Admin account already exists');
        }

        // Generate salt
        const salt = crypto.randomBytes(16).toString('hex');
        // Hash password with salt
        const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');

        this.admin = {
            username,
            salt,
            hash
        };

        this.saveAdmin();
        return this.generateToken(username);
    }

    // Verify password
    verifyPassword(password, salt, hash) {
        const testHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
        return testHash === hash;
    }

    // Login validation
    login(username, password) {
        if (!this.admin || username !== this.admin.username) {
            throw new Error('Invalid username or password');
        }

        if (!this.verifyPassword(password, this.admin.salt, this.admin.hash)) {
            throw new Error('Invalid username or password');
        }

        return this.generateToken(username);
    }

    // Generate JWT token
    generateToken(username) {
        return jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
    }

    // Verify JWT token
    verifyToken(token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            return {
                success: true,
                username: decoded.username
            };
        } catch (error) {
            return {
                success: false,
                error: 'Invalid token'
            };
        }
    }
}

module.exports = new Admin(); 