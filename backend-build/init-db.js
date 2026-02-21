const db = require('./db');
const crypto = require('crypto');

function generateCode() {
    // Generate 16 random characters excluding confusing ones
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 31 chars
    let code = '';
    for (let i = 0; i < 16; i++) {
        // Using crypto.randomInt for secure random
        const idx = crypto.randomInt(0, chars.length);
        code += chars[idx];
        if ((i + 1) % 4 === 0 && i !== 15) {
            code += '-';
        }
    }
    return code;
}

db.serialize(() => {
    // Create Users Table (UserWallet)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        userId TEXT PRIMARY KEY,
        balance INTEGER DEFAULT 0,
        totalConsumed INTEGER DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Create Activation Codes Table
    db.run(`CREATE TABLE IF NOT EXISTS activation_codes (
        code TEXT PRIMARY KEY,
        type TEXT NOT NULL, 
        points INTEGER NOT NULL,
        status TEXT DEFAULT 'unused', -- unused, active, used
        maxUses INTEGER DEFAULT 3,
        currentUses INTEGER DEFAULT 0,
        batch_id TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Create Code Redemptions Table (Track device usage per code)
    db.run(`CREATE TABLE IF NOT EXISTS code_redemptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        deviceId TEXT NOT NULL,
        redeemedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(code, deviceId)
    )`);

    // Create Usage Logs Table
    db.run(`CREATE TABLE IF NOT EXISTS usage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        actionType TEXT NOT NULL,
        cost INTEGER NOT NULL,
        status TEXT NOT NULL,
        prompt TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    console.log('Database tables initialized.');

    // Seed some test codes
    const stmt = db.prepare("INSERT OR IGNORE INTO activation_codes (code, type, points, batch_id) VALUES (?, ?, ?, ?)");

    // Generate 5 license codes (new user + 100 points)
    for (let i = 0; i < 5; i++) {
        const code = generateCode();
        stmt.run(code, 'license', 100, 'TEST-BATCH-001');
        console.log(`Generated License Code: ${code} (100 pts)`);
    }

    // Generate 5 recharge codes (500 pts)
    for (let i = 0; i < 5; i++) {
        const code = generateCode();
        stmt.run(code, 'recharge', 500, 'TEST-BATCH-001');
        console.log(`Generated Recharge Code: ${code} (500 pts)`);
    }

    stmt.finalize();
});

db.close();
