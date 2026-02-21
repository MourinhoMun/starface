const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const db = require('./db'); // Ensure db.js also handles paths or we move db logic here? 
// Actually db.js probably uses relative path. Let's check db.js content first?
// Wait, I should stick to modifying server.js but I need to know if db.js is used.
// The file view showed `const db = require('./db');`. I should verify db.js.
// Assuming db.js does `new sqlite3.Database('./database.sqlite')`. 
// I will need to edit db.js as well.
// For server.js, let's just setup the express app.

const app = express();
const PORT = 3001;
const JWT_SECRET = 'my-star-face-secret'; // Prod: use env
const AI_API_KEY = 'sk-f7kFhPwh50OWjBsNQaXrlo2oQUnapXIvDLblAOsyGO0aGqSk'; // Provided by User

// Ensure images dir exists
const IMAGES_DIR = path.join(__dirname, 'public/images');
if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

app.use(cors());
// IMPORTANT: Increase limit for base64 images
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// Serve static images
app.use('/images', express.static(IMAGES_DIR));

// --- Middleware ---

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- Helper: Call Gemini Text ---
const callGeminiText = async (prompt) => {
    try {
        const payload = {
            contents: [{
                role: 'user',
                parts: [{ text: prompt }]
            }]
        };

        const res = await axios.post(
            `https://yunwu.ai/v1beta/models/gemini-2.5-pro:generateContent?key=${AI_API_KEY}`,
            payload,
            { headers: { 'Content-Type': 'application/json' } }
        );

        if (res.data && res.data.candidates && res.data.candidates.length > 0) {
            return res.data.candidates[0].content.parts[0].text;
        }
        return "AI Response Error";
    } catch (error) {
        console.error("Gemini Text Error:", error.response ? error.response.data : error.message);
        throw new Error("Text Gen Failed");
    }
};

// --- Helper: Call Gemini Image (Preview) ---
const callGeminiImage = async (prompt, base64Image) => {
    try {
        // Detect Mime Type
        const match = base64Image.match(/^data:(image\/\w+);base64,/);
        const mimeType = match ? match[1] : "image/jpeg";
        const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");

        const payload = {
            contents: [{
                role: 'user',
                parts: [
                    { text: prompt },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: cleanBase64
                        }
                    }
                ]
            }]
        };

        const res = await axios.post(
            `https://yunwu.ai/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${AI_API_KEY}`,
            payload,
            { headers: { 'Content-Type': 'application/json' } }
        );

        // Log partial response for debugging (hide huge base64)
        if (res.data && res.data.candidates) {
            const logCandidates = JSON.parse(JSON.stringify(res.data.candidates));
            logCandidates.forEach(c => {
                if (c.content && c.content.parts) {
                    c.content.parts.forEach(p => {
                        if (p.inline_data && p.inline_data.data) {
                            p.inline_data.data = `<Base64 Data Length: ${p.inline_data.data.length}>`;
                        }
                    });
                }
            });
            console.log("Gemini Image Response (Snippet):", JSON.stringify(logCandidates, null, 2));
        }

        if (res.data && res.data.candidates && res.data.candidates.length > 0) {
            const candidate = res.data.candidates[0];
            console.log("Candidate finishReason:", candidate.finishReason);
            console.log("Candidate has content:", !!candidate.content);
            console.log("Candidate content has parts:", !!(candidate.content && candidate.content.parts));

            if (!candidate.content || !candidate.content.parts) {
                console.error("No content.parts in candidate!");
                return null;
            }

            const parts = candidate.content.parts;
            console.log("Number of parts:", parts.length);

            for (let pi = 0; pi < parts.length; pi++) {
                const part = parts[pi];
                console.log(`Part ${pi} keys:`, Object.keys(part));

                if (part.inline_data) {
                    console.log(`Part ${pi} has inline_data, mime:`, part.inline_data.mime_type, "data length:", part.inline_data.data ? part.inline_data.data.length : 0);
                    return `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
                }
                if (part.inlineData) {
                    // camelCase variant
                    console.log(`Part ${pi} has inlineData (camelCase), mime:`, part.inlineData.mimeType, "data length:", part.inlineData.data ? part.inlineData.data.length : 0);
                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
                if (part.text) {
                    console.log(`Part ${pi} has text, first 100 chars:`, part.text.substring(0, 100));
                    if (part.text.startsWith('data:')) {
                        return part.text;
                    }
                    if (part.text.startsWith('http')) {
                        return part.text;
                    }
                }
            }

            console.log("No image data found in any part!");
            return null;
        }
        console.log("No candidates in response!");
        return null;
    } catch (error) {
        console.error("Gemini Image Error:", error.response ? JSON.stringify(error.response.data) : error.message);
        throw new Error("Image Gen Failed");
    }
};

// --- Helper: Save Base64 to File ---
// --- Helper: Save Base64 to File ---
function saveImageLocally(userId, dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:')) return null;

    try {
        const split = dataUrl.split('base64,');
        if (split.length < 2) return null;

        const header = split[0];
        // Join the rest in case there are multiple 'base64,' for some weird reason, mostly just index 1
        const body = split.slice(1).join('base64,');

        // Extract extension
        const typeMatch = header.match(/data:(image\/\w+);/);
        const type = typeMatch ? typeMatch[1] : 'image/png';
        const ext = type.split('/')[1] || 'png';

        // Buffer from base64 (handles newlines automatically)
        const buffer = Buffer.from(body, 'base64');

        const filename = `${userId}-${Date.now()}-${uuidv4()}.${ext}`;
        const filepath = path.join(IMAGES_DIR, filename);

        fs.writeFileSync(filepath, buffer);
        console.log(`Image saved to: ${filepath}`);
        return `http://localhost:${PORT}/images/${filename}`;
    } catch (e) {
        console.error("Failed to save image locally:", e);
        return null;
    }
}

// --- Routes ---

// 1. Activate / Recharge
app.post('/api/v1/user/activate', (req, res) => {
    const { code, deviceId } = req.body;
    if (!code || !deviceId) return res.status(400).json({ error: 'Code and deviceId are required' });

    db.get('SELECT * FROM activation_codes WHERE code = ?', [code], (err, row) => {
        if (err) return res.status(500).json({ error: 'DB Error' });
        if (!row) return res.status(404).json({ error: 'Invalid activation code' });

        // Logic:
        // 1. Check if this device already redeemed this exact code
        // 2. If not, check if code is fully used (currentUses >= maxUses)
        // 3. Check types: if recharge, user must exist. if license, create user if needed.

        db.get('SELECT * FROM code_redemptions WHERE code = ? AND deviceId = ?', [code, deviceId], (err, redemption) => {
            if (err) return res.status(500).json({ error: 'DB Error checking redemption' });

            // Case A: Device already used this code. 
            // Return success (idempotent), return token, DO NOT add points again.
            if (redemption) {
                db.get('SELECT * FROM users WHERE userId = ?', [deviceId], (err, user) => {
                    if (err || !user) return res.status(500).json({ error: 'System Error: User missing for activated device' });

                    const token = jwt.sign({ userId: deviceId }, JWT_SECRET, { expiresIn: '365d' });
                    return res.json({ success: true, token, user });
                });
                return;
            }

            // Case B: New device for this code.
            // Check limits
            if (row.status === 'used' || row.currentUses >= row.maxUses) {
                return res.status(400).json({ error: 'Activation code has reached maximum uses' });
            }

            // Proceed with Transaction
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                const userId = deviceId;

                // 1. Check User Existence
                db.get('SELECT * FROM users WHERE userId = ?', [userId], (err, user) => {
                    if (err) { db.run('ROLLBACK'); return res.status(500).json({ error: 'DB Error' }); }

                    // Enforce Recharge Rule: User must exist
                    if (row.type === 'recharge' && !user) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ error: 'User not found for this device. Please activate a license first.' });
                    }

                    // 2. Add Points / Create User
                    let newBal = row.points;
                    if (!user) {
                        // Type is guaranteed to be 'license' here due to check above (or mixed, but we treat non-recharge as creating)
                        db.run('INSERT INTO users (userId, balance) VALUES (?, ?)', [userId, row.points]);
                    } else {
                        newBal = user.balance + row.points;
                        db.run('UPDATE users SET balance = ? WHERE userId = ?', [newBal, userId]);
                    }

                    // 3. Record Redemption
                    db.run('INSERT INTO code_redemptions (code, deviceId) VALUES (?, ?)', [code, deviceId]);

                    // 4. Update Code Status
                    const newUses = row.currentUses + 1;
                    let newStatus = 'active';
                    if (newUses >= row.maxUses) {
                        newStatus = 'used';
                    }

                    db.run('UPDATE activation_codes SET currentUses = ?, status = ? WHERE code = ?',
                        [newUses, newStatus, code],
                        (err) => {
                            if (err) {
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: 'Update Failed' });
                            }

                            db.run('COMMIT', () => {
                                const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '365d' });
                                res.json({
                                    success: true,
                                    token,
                                    user: { userId, balance: newBal }
                                });
                            });
                        }
                    );
                });
            });
        });
    });
});

// 2. Balance
app.get('/api/v1/user/balance', authenticateToken, (req, res) => {
    db.get('SELECT balance FROM users WHERE userId = ?', [req.user.userId], (err, row) => {
        if (err) return res.status(500).json({ error: 'DB Error' });
        if (!row) return res.status(404).json({ error: 'User not found' });
        res.json({ balance: row.balance });
    });
});

// 3. AI Suggestion (Text Gen)
app.post('/api/v1/proxy/ai-suggestion', authenticateToken, async (req, res) => {
    const { type, style } = req.body; // type: clothing/background..., style: user input hint
    const prompt = `请生成一个关于"${type}"的简短中文描述，风格偏向"${style || '随机'}"。直接返回描述文本，不要啰嗦。例如：红色晚礼服`;

    try {
        const text = await callGeminiText(prompt);
        res.json({ success: true, text: text.trim().replace(/^['"]|['"]$/g, '') });
    } catch (e) {
        res.status(500).json({ error: 'AI Suggestion Failed' });
    }
});

// 4. Image Generation (Main)
app.post('/api/v1/proxy/generate', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const { prompts, userImageBase64 } = req.body;
    // prompts: [{ positive, negative, ratio }]

    if (!prompts || !prompts.length || !userImageBase64) {
        return res.status(400).json({ error: 'Missing prompts or image' });
    }

    const count = prompts.length;
    const COST_PER_IMAGE = 10;
    const totalCost = COST_PER_IMAGE * count;

    db.get('SELECT balance FROM users WHERE userId = ?', [userId], (err, user) => {
        if (err) return res.status(500).json({ error: 'DB Error' });
        if (!user || user.balance < totalCost) return res.status(402).json({ error: 'Insufficient Balance' });

        // Deduct First
        db.run('UPDATE users SET balance = balance - ? WHERE userId = ?', [totalCost, userId], async function (err) {
            if (err) return res.status(500).json({ error: 'Deduction Error' });

            const results = [];
            try {
                // Process sequentially to avoid rate limits? Or parallel?
                // Let's do sequential for safety with this API key.
                for (let i = 0; i < count; i++) {
                    const p = prompts[i];
                    const fullPrompt = `Please edit this image based on the instructions: ${p.positive}. Negative prompt: ${p.negative}`;
                    console.log(`Generating Image ${i + 1}/${count}...`);

                    const imgData = await callGeminiImage(fullPrompt, userImageBase64);
                    console.log(`Image ${i + 1} result type:`, imgData ? imgData.substring(0, 50) + '...' : 'NULL');

                    if (imgData) {
                        // Return base64 directly to frontend for immediate display
                        results.push(imgData);

                        // Save to disk in background (non-blocking) for history
                        const savedUrl = saveImageLocally(userId, imgData);
                        db.run('INSERT INTO usage_logs (userId, actionType, cost, status, prompt) VALUES (?, ?, ?, ?, ?)',
                            [userId, 'generate_image', COST_PER_IMAGE, 'success', savedUrl || 'base64_direct']);
                    } else {
                        results.push(null);
                        db.run('INSERT INTO usage_logs (userId, actionType, cost, status, prompt) VALUES (?, ?, ?, ?, ?)',
                            [userId, 'generate_image', COST_PER_IMAGE, 'failed', 'generation_failed']);
                    }
                }

                res.json({
                    success: true,
                    images: results,
                    remaining_points: user.balance - totalCost
                });

            } catch (apiErr) {
                // If critical failure, maybe refund? 
                // Simple implementation: no automatic refund for now, log error.
                console.error("Gen Loop Error:", apiErr);
                res.status(500).json({ error: 'Generation Process Failed' });
            }
        });
    });
});

// 5. History Endpoint
app.get('/api/v1/user/history', authenticateToken, (req, res) => {
    const userId = req.user.userId;
    // We are storing the Image URL in the 'prompt' field for simplicity in usage_logs, 
    // or we can parse it if we stored JSON.
    // Ideally we should have a separate table, but usage_logs is fine for now.
    // Let's assume usage_logs stores the image URL in 'prompt' column if actionType is generate_image_result (hacky but fast)
    // Actually, in the loop above I stored finalUrl in the prompt field.

    db.all('SELECT prompt as imageUrl, createdAt FROM usage_logs WHERE userId = ? AND actionType = "generate_image" ORDER BY createdAt DESC LIMIT 50', [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB Error' });
        res.json({ history: rows });
    });
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
