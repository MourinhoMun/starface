const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const LICENSE_BACKEND_URL = process.env.LICENSE_BACKEND_URL || 'https://pengip.com';
// __EMBEDDED_AI_KEY__ is replaced at build time by build_release.bat
// In dev, falls back to AI_API_KEY from .env
const _EMBEDDED = '__EMBEDDED_AI_KEY__';
const AI_API_KEY = _EMBEDDED.startsWith('__') ? (process.env.AI_API_KEY || '') : _EMBEDDED;

// Ensure images dir exists
const IMAGES_DIR = path.join(__dirname, 'public/images');
if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.use('/images', express.static(IMAGES_DIR));

// --- Middleware: verify token via pengip.com balance check ---
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.sendStatus(401);

    try {
        await axios.get(`${LICENSE_BACKEND_URL}/api/v1/user/balance`, {
            headers: { Authorization: authHeader }
        });
        req.authHeader = authHeader;
        next();
    } catch (err) {
        const status = err.response?.status;
        if (status === 401 || status === 403) return res.status(status).json({ error: err.response.data?.error || 'Invalid token' });
        next(); // network error: graceful degradation, let through
    }
};

// --- Helper: deduct points (fire-and-forget) ---
const deductPoints = (authHeader, software) => {
    axios.post(`${LICENSE_BACKEND_URL}/api/v1/proxy/use`,
        { software },
        { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } }
    ).catch(err => console.error('Deduct points failed:', err.response?.data || err.message));
};

// --- Helper: Call Gemini Text ---
const callGeminiText = async (prompt) => {
    const res = await axios.post(
        `https://yunwu.ai/v1beta/models/gemini-2.5-pro:generateContent?key=${AI_API_KEY}`,
        { contents: [{ role: 'user', parts: [{ text: prompt }] }] },
        { headers: { 'Content-Type': 'application/json' } }
    );
    if (res.data?.candidates?.length > 0) {
        return res.data.candidates[0].content.parts[0].text;
    }
    throw new Error('No text response');
};

// --- Helper: Call Gemini Image (with retry on 502/503) ---
const callGeminiImage = async (prompt, base64Image, retries = 2) => {
    const match = base64Image.match(/^data:(image\/\w+);base64,/);
    const mimeType = match ? match[1] : 'image/jpeg';
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt > 0) {
            console.log(`[GeminiImage] Retry ${attempt}/${retries} after 2s (prev error: ${lastError?.message})`);
            await new Promise(r => setTimeout(r, 2000));
        }
        try {
            const res = await axios.post(
                `https://yunwu.ai/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${AI_API_KEY}`,
                {
                    contents: [{
                        role: 'user',
                        parts: [
                            { text: prompt },
                            { inline_data: { mime_type: mimeType, data: cleanBase64 } }
                        ]
                    }]
                },
                { headers: { 'Content-Type': 'application/json' } }
            );

            const candidates = res.data?.candidates || [];
            console.log('[GeminiImage] candidates:', candidates.length, '| finishReason:', candidates[0]?.finishReason);
            if (candidates.length > 0) {
                const parts = candidates[0].content?.parts || [];
                console.log('[GeminiImage] parts:', parts.map(p => p.inline_data ? 'inline_data' : p.inlineData ? 'inlineData' : `text(${p.text?.substring(0,80)})`));
                for (const part of parts) {
                    if (part.inline_data) return `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
                    if (part.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                    if (part.text?.startsWith('data:') || part.text?.startsWith('http')) return part.text;
                }
            }
            console.log('[GeminiImage] no image data found, raw response:', JSON.stringify(res.data).substring(0, 300));
            return null;
        } catch (e) {
            const status = e.response?.status;
            if ((status === 502 || status === 503) && attempt < retries) {
                lastError = e;
                continue;
            }
            throw e;
        }
    }
};

// --- Helper: Save Base64 to File ---
function saveImageLocally(userId, dataUrl) {
    if (!dataUrl?.startsWith('data:')) return null;
    try {
        const [header, body] = dataUrl.split('base64,');
        const ext = (header.match(/data:(image\/\w+);/) || [])[1]?.split('/')[1] || 'png';
        const filename = `${userId}-${Date.now()}-${uuidv4()}.${ext}`;
        fs.writeFileSync(path.join(IMAGES_DIR, filename), Buffer.from(body, 'base64'));
        return `/starface-images/${filename}`;
    } catch (e) {
        console.error('Failed to save image:', e);
        return null;
    }
}

// --- Routes ---

// 1. Activate / Recharge �?proxy to pengip.com
app.post('/api/v1/user/activate', async (req, res) => {
    const { code, deviceId } = req.body;
    if (!code || !deviceId) return res.status(400).json({ error: 'Code and deviceId are required' });

    try {
        const { data, status } = await axios.post(`${LICENSE_BACKEND_URL}/api/v1/user/activate`,
            { code, deviceId },
            { validateStatus: () => true }
        );
        res.status(status).json(data);
    } catch (err) {
        res.status(500).json({ error: 'Authorization server unreachable' });
    }
});

// 2. Balance �?proxy to pengip.com
app.get('/api/v1/user/balance', async (req, res) => {
    try {
        const { data, status } = await axios.get(`${LICENSE_BACKEND_URL}/api/v1/user/balance`, {
            headers: { Authorization: req.headers['authorization'] || '' },
            validateStatus: () => true
        });
        res.status(status).json(data);
    } catch (err) {
        res.status(500).json({ error: 'Authorization server unreachable' });
    }
});

// 3. AI Suggestion (Text Gen) �?costs mystarface_suggestion points
app.post('/api/v1/proxy/ai-suggestion', authenticateToken, async (req, res) => {
    const { type, style } = req.body;
    const prompt = `请生成一个关�?${type}"的简短中文描述，风格偏向"${style || '随机'}"。直接返回描述文本，不要啰嗦。例如：红色晚礼服`;

    try {
        const text = await callGeminiText(prompt);
        deductPoints(req.authHeader, 'mystarface_suggestion');
        res.json({ success: true, text: text.trim().replace(/^['"]|['"]$/g, '') });
    } catch (e) {
        res.status(500).json({ error: 'AI Suggestion Failed' });
    }
});

// 4. Image Generation – single: 10pts (mystarface_generate), batch x5: 50pts (mystarface_generate_batch)
app.post('/api/v1/proxy/generate', authenticateToken, async (req, res) => {
    const { prompts, userImageBase64 } = req.body;

    if (!prompts?.length || !userImageBase64) {
        return res.status(400).json({ error: 'Missing prompts or image' });
    }

    const isBatch = prompts.length > 1;
    const COST_PER_IMAGE = 10;
    const totalCost = COST_PER_IMAGE * prompts.length;

    // Pre-check balance
    try {
        const balRes = await axios.get(`${LICENSE_BACKEND_URL}/api/v1/user/balance`, {
            headers: { Authorization: req.authHeader },
            validateStatus: () => true
        });
        if (balRes.status !== 200 || balRes.data.balance < totalCost) {
            return res.status(402).json({ error: 'Insufficient points' });
        }
    } catch (e) {
        // network error: graceful degradation
    }

    // Batch mode: deduct 50 points upfront in one call
    if (isBatch) {
        await axios.post(`${LICENSE_BACKEND_URL}/api/v1/proxy/use`,
            { software: 'mystarface_generate_batch' },
            { headers: { Authorization: req.authHeader, 'Content-Type': 'application/json' } }
        ).catch(err => console.error('Batch deduct failed:', err.response?.data || err.message));
    }

    const results = [];
    for (const p of prompts) {
        try {
            const fullPrompt = `${p.positive}\n\nCRITICAL REQUIREMENTS: The output must look completely photorealistic — like a real photograph, not AI-generated. Skin must have visible pores, fine surface hair, subtle texture and color variations, and natural imperfections. Do not smooth, airbrush, or apply any beauty filter. The lighting should be natural and consistent. Avoid any plastic, waxy, or CGI-like appearance. Output at 1024x1024 resolution.`;
            const imgData = await callGeminiImage(fullPrompt, userImageBase64);

            if (imgData) {
                const savedUrl = saveImageLocally('user', imgData);
                results.push(savedUrl || imgData);
                // Single mode: deduct per image after success
                if (!isBatch) {
                    deductPoints(req.authHeader, 'mystarface_generate');
                }
            } else {
                results.push(null);
            }
        } catch (e) {
            console.error(`Image gen error (prompt index ${results.length}):`, e.message);
            results.push(null);
        }
    }

    const balRes = await axios.get(`${LICENSE_BACKEND_URL}/api/v1/user/balance`, {
        headers: { Authorization: req.authHeader },
        validateStatus: () => true
    }).catch(() => ({ data: { balance: 0 } }));

    res.json({
        success: true,
        images: results,
        remaining_points: balRes.data.balance
    });
});

// 5. History - list saved images
app.get('/api/v1/user/history', authenticateToken, (req, res) => {
    try {
        const files = fs.readdirSync(IMAGES_DIR)
            .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
            .map(f => ({
                imageUrl: `https://pengip.com/starface-images/${f}`,
                createdAt: fs.statSync(path.join(IMAGES_DIR, f)).mtimeMs
            }))
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 50);
        res.json({ history: files });
    } catch (e) {
        res.json({ history: [] });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
