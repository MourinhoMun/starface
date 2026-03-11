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

// SaaS: never embed upstream API keys in build artifacts.
// Only read from runtime environment.
const AI_API_KEY = process.env.AI_API_KEY || '';
if (!AI_API_KEY) {
    throw new Error('AI_API_KEY is required');
}

// Ensure images dir exists
const IMAGES_DIR = path.join(__dirname, 'public/images');
if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// Keep simple ownership mapping in-memory (best-effort). For stronger isolation,
// migrate to a DB table (filename -> userId).
const FILE_OWNERS = new Map();

// SaaS: restrict CORS by allowlist (comma-separated). If unset, only allow localhost for dev.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (ALLOWED_ORIGINS.length === 0) {
            if (/^https?:\/\/localhost(?::\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin)) {
                return cb(null, true);
            }
            return cb(new Error('CORS: origin not allowed'));
        }
        if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        return cb(new Error('CORS: origin not allowed'));
    },
    credentials: true,
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.use('/images', express.static(IMAGES_DIR));

// --- Middleware: verify token via pengip.com balance check ---
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.sendStatus(401);

    try {
        const r = await axios.get(`${LICENSE_BACKEND_URL}/api/v1/user/balance`, {
            headers: { Authorization: authHeader },
            validateStatus: () => true,
        });
        if (r.status === 200 && r.data?.userId) {
            req.authHeader = authHeader;
            req.userId = r.data.userId;
            return next();
        }
        if (r.status === 401 || r.status === 403) {
            return res.status(r.status).json({ error: r.data?.error || 'Invalid token' });
        }
        // SaaS: fail closed on unexpected responses.
        return res.status(503).json({ error: '授权服务暂不可用，请稍后重试' });
    } catch (err) {
        const status = err.response?.status;
        if (status === 401 || status === 403) {
            return res.status(status).json({ error: err.response.data?.error || 'Invalid token' });
        }
        // SaaS: fail closed on network errors.
        return res.status(503).json({ error: '授权服务暂不可用，请稍后重试' });
    }
};

// --- Helper: deduct points (fire-and-forget) ---
const deductPoints = (authHeader, software) => {
    axios.post(`${LICENSE_BACKEND_URL}/api/v1/proxy/use`,
        { software },
        { headers: { Authorization: authHeader, 'Content-Type': 'application/json' }, validateStatus: () => true }
    ).then((r) => {
        if (r.status !== 200) {
            console.error('Deduct points failed:', r.data || `HTTP ${r.status}`);
        }
    }).catch(err => console.error('Deduct points failed:', err.response?.data || err.message));
};

const refundPoints = (authHeader, userId, amount, relatedId, reason) => {
    const secret = process.env.INTERNAL_REFUND_SECRET || '';
    return axios.post(`${LICENSE_BACKEND_URL}/api/v1/points/refund`,
        { userId, amount, relatedId, reason },
        { headers: { 'x-internal-refund-secret': secret, Authorization: authHeader, 'Content-Type': 'application/json' }, validateStatus: () => true }
    );
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

// --- Helper: Call Gemini Image (with retry / backoff on 429/502/503) ---
const callGeminiImage = async (prompt, base64Image, base64Image2 = null, retries = 4) => {
    const match = base64Image.match(/^data:(image\/\w+);base64,/);
    const mimeType = match ? match[1] : 'image/jpeg';
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');

    const match2 = base64Image2 ? base64Image2.match(/^data:(image\/\w+);base64,/) : null;
    const mimeType2 = match2 ? match2[1] : 'image/jpeg';
    const cleanBase64_2 = base64Image2 ? base64Image2.replace(/^data:image\/\w+;base64,/, '') : null;

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt > 0) {
            const status = lastError?.response?.status;
            // Exponential backoff with jitter; be gentler on 429.
            const baseDelayMs = status === 429 ? 2500 : 1500;
            const delayMs = Math.min(15000, baseDelayMs * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 400);
            console.log(`[GeminiImage] Retry ${attempt}/${retries} after ${delayMs}ms (prev status: ${status || 'n/a'} | ${lastError?.message})`);
            await new Promise(r => setTimeout(r, delayMs));
        }
        try {
            const res = await axios.post(
        `https://yunwu.ai/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${AI_API_KEY}`,
                {
                    contents: [{
                        role: 'user',
                        parts: [
                            { text: prompt },
                            { inline_data: { mime_type: mimeType, data: cleanBase64 } },
                            ...(cleanBase64_2 ? [{ inline_data: { mime_type: mimeType2, data: cleanBase64_2 } }] : [])
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
                    if (part.inline_data) return { dataUrl: `data:${part.inline_data.mime_type};base64,${part.inline_data.data}` };
                    if (part.inlineData) return { dataUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` };
                    if (part.text?.startsWith('data:') || part.text?.startsWith('http')) return { dataUrl: part.text };
                }

                const finishReason = candidates[0]?.finishReason;
                const finishMessage = candidates[0]?.finishMessage;
                const textParts = parts.filter(p => typeof p.text === 'string').map(p => p.text).join('\n');
                return { dataUrl: null, error: { finishReason, finishMessage, text: textParts.substring(0, 300) } };
            }
            console.log('[GeminiImage] no image data found, raw response:', JSON.stringify(res.data).substring(0, 300));
            return { dataUrl: null, error: { finishReason: 'NO_IMAGE', finishMessage: 'No image returned', text: JSON.stringify(res.data).substring(0, 300) } };
        } catch (e) {
            const status = e.response?.status;
            // Retry 429/502/503 with backoff
            if ((status === 429 || status === 502 || status === 503) && attempt < retries) {
                lastError = e;
                continue;
            }
            throw e;
        }
    }
    return { dataUrl: null, error: { finishReason: 'RETRY_EXHAUSTED', finishMessage: 'Retries exhausted' } };
};

// --- Helper: Save Base64 to File ---
function saveImageLocally(userId, dataUrl) {
    if (!dataUrl?.startsWith('data:')) return null;
    try {
        const [header, body] = dataUrl.split('base64,');
        const ext = (header.match(/data:(image\/\w+);/) || [])[1]?.split('/')[1] || 'png';
        // Keep userId out of filenames to reduce info leakage.
        const filename = `${Date.now()}-${uuidv4()}.${ext}`;
        fs.writeFileSync(path.join(IMAGES_DIR, filename), Buffer.from(body, 'base64'));
        return `/api/v1/files/${filename}`;
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
    const { prompts, userImageBase64, userImageBase64_2 } = req.body;

    if (!prompts?.length || !userImageBase64) {
        return res.status(400).json({ error: 'Missing prompts or image' });
    }

    const isBatch = prompts.length > 1;
    const COST_PER_IMAGE = 10;
    const totalCost = COST_PER_IMAGE * prompts.length;

    // Pre-check balance (SaaS: fail closed on backend errors)
    try {
        const balRes = await axios.get(`${LICENSE_BACKEND_URL}/api/v1/user/balance`, {
            headers: { Authorization: req.authHeader },
            validateStatus: () => true
        });
        if (balRes.status !== 200) {
            return res.status(503).json({ error: '授权服务暂不可用，请稍后重试' });
        }
        if (balRes.data.balance < totalCost) {
            return res.status(402).json({ error: 'Insufficient points' });
        }
    } catch (e) {
        return res.status(503).json({ error: '授权服务暂不可用，请稍后重试' });
    }

    // Batch mode: deduct 50 points upfront in one call.
    // Later we will refund the difference based on how many images actually succeeded.
    if (isBatch) {
        const d = await axios.post(`${LICENSE_BACKEND_URL}/api/v1/proxy/use`,
            { software: 'mystarface_generate_batch' },
            { headers: { Authorization: req.authHeader, 'Content-Type': 'application/json' }, validateStatus: () => true }
        ).catch(err => ({ status: err.response?.status || 500, data: err.response?.data || { error: err.message } }));

        if (d.status !== 200) {
            return res.status(402).json({ error: d.data?.error || '积分扣除失败，请稍后重试' });
        }
    }

    const results = [];
    for (const p of prompts) {
        try {
            const fullPrompt = `${p.positive}\n\nCRITICAL REQUIREMENTS: The output must look completely photorealistic — like a real photograph, not AI-generated. Skin must have visible pores, fine surface hair, subtle texture and color variations, and natural imperfections. Do not smooth, airbrush, or apply any beauty filter. The lighting should be natural and consistent. Avoid any plastic, waxy, or CGI-like appearance. Output at 1024x1024 resolution.`;
            const img = await callGeminiImage(fullPrompt, userImageBase64, userImageBase64_2);

            if (img?.dataUrl) {
                const savedUrl = saveImageLocally(req.userId || 'unknown', img.dataUrl);
                if (savedUrl && req.userId) {
                    const filename = savedUrl.split('/').pop();
                    if (filename) FILE_OWNERS.set(filename, req.userId);
                }
                results.push({ ok: true, url: savedUrl || img.dataUrl });
                // Single mode: deduct per image after success
                if (!isBatch) {
                    deductPoints(req.authHeader, 'mystarface_generate');
                }
            } else {
                results.push({ ok: false, error: img?.error || { finishReason: 'NO_IMAGE' } });
            }
        } catch (e) {
            const status = e.response?.status;
            console.error(`Image gen error (prompt index ${results.length}):`, status ? `HTTP ${status}` : e.message);
            results.push({ ok: false, error: { httpStatus: status, message: e.response?.data?.error?.message || e.message } });
        }
    }

    // Refund logic for batch: charged 50 upfront, final price is 10 * successCount
    if (isBatch && req.userId) {
        const successCount = results.filter(r => r && r.ok).length;
        const shouldCharge = 10 * successCount;
        const toRefund = Math.max(0, 50 - shouldCharge);

        if (toRefund > 0) {
            const relatedId = `starface_batch_${Date.now()}_${uuidv4()}`;
            const rr = await refundPoints(req.authHeader, req.userId, toRefund, relatedId, `StarFace batch refund: success=${successCount}/5`).catch((e) => ({ status: e.response?.status || 500, data: e.response?.data }));
            if (rr.status !== 200) {
                console.error('Refund failed:', rr.data || `HTTP ${rr.status}`);
            }
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

// 5. Files - authenticated download (avoid public static exposure)
app.get('/api/v1/files/:filename', authenticateToken, (req, res) => {
    const filename = req.params.filename;
    const owner = FILE_OWNERS.get(filename);
    if (!owner || !req.userId || owner !== req.userId) {
        return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(IMAGES_DIR, filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    return res.sendFile(filePath);
});

// 6. History - list saved images (per-user)
app.get('/api/v1/user/history', authenticateToken, (req, res) => {
    try {
        if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

        const files = fs.readdirSync(IMAGES_DIR)
            .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
            .filter(f => FILE_OWNERS.get(f) === req.userId)
            .map(f => ({
                imageUrl: `/api/v1/files/${f}`,
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
