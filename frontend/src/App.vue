<template>
  <div class="app-container">
    <header>
      <div class="header-left">
        <a href="https://pengip.com" class="home-btn">← 返回主页</a>
        <div class="logo">My Star Face</div>
      </div>
      <div class="balance" @click="showActivation = true">
        💰 {{ balance }} 积分
        <span class="recharge-tip">(充值/激活)</span>
      </div>
    </header>

    <!-- Mobile Tab Bar -->
    <div class="mobile-tabs">
      <button :class="{ active: mobileTab === 'settings' }" @click="mobileTab = 'settings'">⚙️ 设置</button>
      <button :class="{ active: mobileTab === 'result' }" @click="mobileTab = 'result'">🖼️ 结果</button>
    </div>

    <main>
      <div class="panel left" :class="{ 'mobile-hidden': mobileTab !== 'settings' }">
        <div class="section-tip">上传照片：
          <br>• 只上传第1张：AI 会将你的面部特征与“明星名字”融合（可能会触发合规限制导致失败）。
          <br>• 上传第1张 + 第2张：进入“双人融合”模式（更稳定）。
          <br><span class="tip-scene">建议：正脸、光线均匀、无遮挡、不要过度美颜。</span>
        </div>
        <ImageUpload @update:image="handleImageUpload" />
        <div class="form-group">
          <label>第二张照片（可选，用于两张照片融合）</label>
          <div class="field-tip">上传第二张后，系统会优先按“两张照片融合”生成，不再依赖明星名字。</div>
          <ImageUpload @update:image="handleImageUpload2" />
        </div>

        <div class="form-group">
          <label>想融合的明星 (Star Name)</label>
          <div class="field-tip">输入你想融合的明星名字，支持中英文。例如输入"吴彦祖"，AI 会将你的面部与该明星特征混合。</div>
          <input v-model="starName" type="text" placeholder="例如: 吴彦祖, Taylor Swift..." />
        </div>

        <div class="section-tip">选择融合比例：数值越高越像你自己，越低越像明星。<br><span class="tip-scene">单张模式适合精细调整一张；批量模式一次生成5张不同比例，方便对比选择。</span></div>
        <FusionControl
          v-model:mode="mode"
          v-model:singleRatio="singleRatio"
          v-model:batchRatios="batchRatios"
        />

        <div class="form-group">
          <label>输出分辨率</label>
          <div class="field-tip">1K 更快更省；2K 更清晰（15 积分/张）。</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
            <label style="display:flex;gap:6px;align-items:center;cursor:pointer;">
              <input type="radio" value="1k" v-model="outputResolution" />
              <span>1K（10积分/张）</span>
            </label>
            <label style="display:flex;gap:6px;align-items:center;cursor:pointer;">
              <input type="radio" value="2k" v-model="outputResolution" />
              <span>2K（15积分/张）</span>
            </label>
          </div>
        </div>

        <div class="section-tip">自定义服装、背景、发型和姿势，让生成结果更符合你的想象。<br><span class="tip-scene">不填则 AI 自动决定；勾选"保持原图"则保留你照片中的原始元素；点击"随机日常"可快速获得灵感。</span></div>
        <SceneStyling :modelValue="styling" />

        <!-- Mobile: generate button at bottom of settings -->
        <div class="mobile-generate-wrap">
          <PromptPreview
            :prompts="generatedPrompts"
            :cost="estimatedCost"
            :generating="isGenerating"
            @generate="handleGenerateMobile"
          />
        </div>
      </div>

      <div class="panel right" :class="{ 'mobile-hidden': mobileTab !== 'result' }">
        <!-- History Toggle -->
        <div style="text-align: right; margin-bottom: 10px;">
           <button @click="showHistory = !showHistory" class="history-btn">
             {{ showHistory ? '返回生成 (Back)' : '📜 历史记录 (History)' }}
           </button>
        </div>

        <!-- History View -->
        <div v-if="showHistory" class="history-view">
           <h3 style="color:#1a1a2e; margin-bottom: 20px;">历史生成记录</h3>
           <div class="results-grid">
              <div v-for="(img, idx) in historyImages" :key="idx" class="result-card">
                 <img :src="img.imageUrl" />
                 <span class="date-label">{{ new Date(img.createdAt).toLocaleString() }}</span>
                 <!-- Use API URL so the download works regardless of relative path base -->
                 <a :href="toAbsoluteApiUrl(img.imageUrl)" download class="download-btn">⬇</a>
              </div>
           </div>
        </div>

        <!-- Generate View -->
        <div v-else>
            <!-- Desktop: prompt preview here; mobile: hidden (shown in settings tab) -->
            <div class="desktop-only">
              <PromptPreview
                :prompts="generatedPrompts"
                :cost="estimatedCost"
                :generating="isGenerating"
                @generate="handleGenerate"
              />
            </div>

            <!-- Results -->
            <div v-if="results.length > 0" class="results-grid">
              <div v-for="(img, idx) in results" :key="idx" class="result-card">
                <template v-if="img">
                  <img :src="img" />
                  <a :href="img" download class="download-btn">⬇</a>
                </template>
                <template v-else>
                  <div class="fail-card">
                    <div class="fail-title">生成失败</div>
                    <div class="fail-reason">{{ resultErrors[idx] || '未知原因' }}</div>
                  </div>
                </template>
              </div>
              <p v-if="results.every(r => !r)" style="color:#f55; text-align:center; width:100%;">所有图片生成失败，请重试</p>
            </div>
            <div v-else class="empty-result">
              <p>完成左侧设置后点击"开始生成"</p>
            </div>
        </div>
      </div>
    </main>

    <!-- 肖像权专项免责声明（每次会话必须确认） -->
    <div v-if="showDisclaimer" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:1rem;">
      <div style="background:#fff;border-radius:16px;max-width:580px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.4);">
        <div style="padding:1.5rem 1.75rem 1rem;border-bottom:1px solid #ede9fe;background:#f5f3ff;border-radius:16px 16px 0 0;">
          <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem;">
            <span style="font-size:1.75rem;">⚠️</span>
            <div>
              <h2 style="font-size:1.2rem;font-weight:800;color:#4c1d95;margin:0;">肖像权与AI合规使用声明</h2>
              <p style="font-size:0.8rem;color:#6d28d9;margin:0.2rem 0 0;">My Star Face · 每次使用前必须阅读并同意</p>
            </div>
          </div>
        </div>
        <div ref="disclaimerContentRef" @scroll="handleDisclaimerScroll" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:1.25rem 1.75rem;color:#1e293b;font-size:0.88rem;line-height:1.75;">
          <p style="font-weight:700;color:#7c3aed;margin:0 0 1rem;">请认真阅读以下全部内容。滚动至底部后方可勾选同意。</p>

          <h3 style="font-size:0.95rem;font-weight:700;color:#1e293b;margin:1rem 0 0.5rem 0;">一、肖像权法律义务</h3>
          <p style="margin:0.4rem 0;">根据《民法典》第1019条，自然人对其肖像享有肖像权，任何组织或个人不得未经肖像权人同意制作、使用、公开其肖像。</p>
          <ul style="padding-left:1.25rem;margin:0.4rem 0;">
            <li style="margin:0.3rem 0;"><strong>上传他人照片</strong>（包括明星、公众人物、朋友等）须已取得其<strong>明示授权</strong>；</li>
            <li style="margin:0.3rem 0;">将生成图像<strong>对外传播或商业使用</strong>须额外获得相关权利人授权；</li>
            <li style="margin:0.3rem 0;">任何因违规使用他人肖像而产生的法律责任，由用户自行承担。</li>
          </ul>

          <h3 style="font-size:0.95rem;font-weight:700;color:#1e293b;margin:1rem 0 0.5rem 0;">二、AI生成内容合规标识</h3>
          <p style="margin:0.4rem 0;">根据《生成式人工智能服务管理暂行办法》（2023年）及《互联网信息服务深度合成管理规定》：</p>
          <ul style="padding-left:1.25rem;margin:0.4rem 0;">
            <li style="margin:0.3rem 0;">本工具生成的所有图像均为 AI 合成，<strong>不代表真实人物形象</strong>；</li>
            <li style="margin:0.3rem 0;">如需分享生成图像，<strong>必须明确标注"AI生成/合成图像"</strong>，不得以假乱真；</li>
            <li style="margin:0.3rem 0;">严禁将生成图像用于<strong>诈骗、造谣、诽谤、骚扰</strong>等违法用途。</li>
          </ul>

          <h3 style="font-size:0.95rem;font-weight:700;color:#1e293b;margin:1rem 0 0.5rem 0;">三、平台服务性质</h3>
          <p style="margin:0.4rem 0;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:0.5rem 0.75rem;color:#92400e;">本工具仅供<strong>娱乐体验和创意探索</strong>使用。生成结果为 AI 模拟效果，与真实人物不存在关联，不构成任何形式的侵权行为的证明材料。</p>
          <p style="margin:0.4rem 0;">本工具仅提供技术服务，不对用户违规使用行为承担任何法律责任。</p>

          <p style="margin:1.25rem 0 0;font-size:0.8rem;color:#64748b;text-align:center;">如不同意以上条款，请立即关闭本工具。</p>
        </div>
        <div style="padding:1rem 1.75rem 1.25rem;border-top:1px solid #e2e8f0;background:#f8fafc;border-radius:0 0 16px 16px;">
          <label v-if="!disclaimerScrolled" style="display:flex;align-items:center;gap:0.5rem;color:#94a3b8;font-size:0.85rem;margin-bottom:0.75rem;cursor:not-allowed;">
            <input type="checkbox" disabled style="cursor:not-allowed;" />
            请先滚动阅读完整条款 ↑
          </label>
          <label v-else style="display:flex;align-items:center;gap:0.5rem;color:#334155;font-size:0.85rem;margin-bottom:0.75rem;cursor:pointer;">
            <input type="checkbox" v-model="disclaimerChecked" style="cursor:pointer;width:16px;height:16px;" />
            我已阅读并同意上述条款，我将合法合规使用本工具，上传的照片均已获得相关权利人授权
          </label>
          <button
            @click="acceptDisclaimer"
            :disabled="!disclaimerScrolled || !disclaimerChecked"
            style="width:100%;padding:0.7rem;border-radius:8px;font-weight:700;font-size:0.95rem;border:none;cursor:pointer;transition:all 0.2s;"
            :style="(!disclaimerScrolled || !disclaimerChecked) ? 'background:#e2e8f0;color:#94a3b8;cursor:not-allowed;' : 'background:#7c3aed;color:#fff;cursor:pointer;'"
          >
            {{ (!disclaimerScrolled || !disclaimerChecked) ? '请阅读并勾选同意后继续' : '我同意并继续使用' }}
          </button>
        </div>
      </div>
    </div>

    <ActivationModal
      :isOpen="showActivation"
      @close="showActivation = false"
      @activated="handleActivated"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue';
import axios from 'axios';
import ImageUpload from './components/ImageUpload.vue';
import FusionControl from './components/FusionControl.vue';
import SceneStyling from './components/SceneStyling.vue';
import PromptPreview from './components/PromptPreview.vue';
import ActivationModal from './components/ActivationModal.vue';

// ── 肖像权免责声明
const DISCLAIMER_KEY = 'starface_disclaimer_v1';
const showDisclaimer = ref(false);
const disclaimerScrolled = ref(false);
const disclaimerChecked = ref(false);
const disclaimerContentRef = ref(null);

function checkDisclaimer() {
  if (!sessionStorage.getItem(DISCLAIMER_KEY)) {
    showDisclaimer.value = true;
  }
}
function acceptDisclaimer() {
  sessionStorage.setItem(DISCLAIMER_KEY, '1');
  showDisclaimer.value = false;
}
function handleDisclaimerScroll(e) {
  const el = e.target;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 5) {
    disclaimerScrolled.value = true;
  }
}

// 当弹窗显示时检查：若内容不需要滚动（高度未超出容器），直接标记为已读
watch(showDisclaimer, (val) => {
  if (val) {
    nextTick(() => {
      const el = disclaimerContentRef.value;
      if (el && el.scrollHeight <= el.clientHeight + 5) {
        disclaimerScrolled.value = true;
      }
    });
  }
});

// State
const balance = ref(0);
const showActivation = ref(false);
const isGenerating = ref(false);
const showHistory = ref(false);
const mobileTab = ref('settings');
const historyImages = ref([]);

const userImage = ref(null);
const userImage2 = ref(null);
const starName = ref('');
const mode = ref('single');
const singleRatio = ref(50);
const batchRatios = ref([20, 40, 60, 80, 100]); // 5 default ratios

// 输出分辨率：1K(10积分) / 2K(15积分)
const outputResolution = ref('1k');

const styling = reactive({
  clothing: { text: '', keep: false },
  background: { text: '', keep: false },
  hair: { text: '', keep: false },
  pose: { text: '', keep: false }
});

const generatedPrompts = ref([]);
const results = ref([]);
const resultErrors = ref([]);

// Mock API URL (Dev)
// In production, this would be relative or configured
const API_URL = '/starface/api/v1';

function toAbsoluteApiUrl(maybeRelativeUrl) {
  if (!maybeRelativeUrl) return maybeRelativeUrl;
  // If backend returns relative URLs (e.g. /api/v1/files/xxx), prefix with API base.
  if (typeof maybeRelativeUrl === 'string' && maybeRelativeUrl.startsWith('/api/')) {
    return `/starface${maybeRelativeUrl}`;
  }
  return maybeRelativeUrl;
}

// Computed
const estimatedCost = computed(() => {
  const count = mode.value === 'single' ? 1 : 5;
  const per = outputResolution.value === '2k' ? 15 : 10;
  return per * count;
});

// Logic
const handleImageUpload = (img) => {
  userImage.value = img;
};

const handleImageUpload2 = (img) => {
  userImage2.value = img;
};

const handleActivated = (data) => {
  balance.value = data.balance;
};

// Prompt Generation Logic
const generatePromptText = (ratio) => {
  const userPct = parseInt(ratio);
  const starPct = 100 - userPct;
  const hasSecond = !!userImage2.value;
  const starLabel = starName.value || 'the celebrity';

  const clothing = styling.clothing.keep
    ? 'wearing the same clothing as in the original photo'
    : (styling.clothing.text ? `wearing ${styling.clothing.text}` : 'wearing elegant attire');
  const bg = styling.background.keep
    ? 'Keep the original background unchanged.'
    : (styling.background.text ? `Place the subject against a ${styling.background.text} background.` : 'Place the subject against a clean studio background.');
  const hair = styling.hair.keep
    ? ''
    : (styling.hair.text ? ` Style the hair as ${styling.hair.text}.` : '');
  const pose = styling.pose.keep
    ? ''
    : (styling.pose.text ? ` The subject should be ${styling.pose.text}.` : '');

  const resLine = outputResolution.value === '2k'
    ? 'Output at 2048x2048 resolution.'
    : 'Output at 1024x1024 resolution.';

  if (hasSecond) {
    return `Blend the faces from IMAGE 1 (${userPct}% influence) and IMAGE 2 (${starPct}% influence) into a single, realistic new person. Keep both identities' key facial features while producing a coherent natural face. The result must look like a real human being — not AI-generated or CGI. Preserve completely natural skin texture: visible pores, fine surface hair, subtle color variations, realistic skin sheen, minor natural imperfections such as small blemishes or capillaries. Do not smooth, airbrush, or beautify the skin in any way. The face must look photorealistic with natural depth, accurate lighting, and consistent skin tone. ${clothing} ${bg}${hair}${pose} ${resLine}`;
  }

  return `Naturally blend the face of the person in the uploaded photo (${userPct}% influence) with the appearance of ${starLabel} (${starPct}% influence). The result must look like a real human being — not AI-generated or CGI. Preserve completely natural skin texture: visible pores, fine surface hair, subtle color variations, realistic skin sheen, minor natural imperfections such as small blemishes or capillaries. Do not smooth, airbrush, or beautify the skin in any way. The face must look photorealistic with natural depth, accurate lighting, and consistent skin tone. ${clothing} ${bg}${hair}${pose} ${resLine}`;
};

const updatePrompts = () => {
  const newPrompts = [];
  const negative = "deformed, blurry, bad anatomy, disfigured, mutation, extra limbs, watermark, oversmoothed skin, airbrushed, plastic skin, fake, CGI, illustration";

  if (mode.value === 'single') {
    newPrompts.push({
      ratio: singleRatio.value,
      positive: generatePromptText(singleRatio.value),
      negative
    });
  } else {
    batchRatios.value.forEach(r => {
      newPrompts.push({
        ratio: r,
        positive: generatePromptText(r),
        negative
      });
    });
  }
  generatedPrompts.value = newPrompts;
};

// Watchers to auto-update prompts
watch([starName, mode, singleRatio, batchRatios, styling, outputResolution], updatePrompts, { deep: true });

// Actions
const handleGenerate = async () => {
  if (balance.value < estimatedCost.value) {
    alert("余额不足，请充值！");
    showActivation.value = true;
    return;
  }

  isGenerating.value = true;
  try {
    const token = localStorage.getItem('pengip_token');
    const res = await axios.post(`${API_URL}/proxy/generate`, {
      batch_size: mode.value === 'single' ? 1 : 5,
      prompts: generatedPrompts.value,
      output_resolution: outputResolution.value,
      userImageBase64: userImage.value, // Pass uploaded image data
      userImageBase64_2: userImage2.value // Optional second image for two-photo fusion
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // Backend now returns richer per-image result objects: { ok, url } or { ok:false, error }
    const imgs = res.data.images || [];
    results.value = imgs.map((it) => {
      if (!it) return null;
      if (typeof it === 'string') return it;
      if (it.ok && it.url) return it.url;
      return null;
    });

    // Human-friendly error messages for failed items
    resultErrors.value = imgs.map((it) => {
      if (!it || typeof it === 'string') return null;
      if (it.ok) return null;
      const e = it.error || {};
      const status = e.httpStatus;
      const finishReason = e.finishReason;
      const msgText = (e.finishMessage || e.message || e.text || '').toString();

      if (status === 429) return '上游AI限流（请求太频繁），建议等10-30秒再试';
      if (status === 502 || status === 503) return '上游AI通道临时故障（502/503），建议稍后重试';
      if (msgText.toLowerCase().includes('specific real person') || msgText.includes('特定') || msgText.includes('明星')) {
        return '模型拒绝：涉及指定真人/明星融合（合规限制）。建议改用“两张照片融合”模式';
      }
      if (finishReason === 'IMAGE_OTHER') return '模型未返回图片（IMAGE_OTHER）：提示词可能触发限制或不够清晰，建议换提示词/换图再试';
      if (finishReason === 'STOP' && msgText) return `模型中止：${msgText.substring(0, 80)}`;
      return msgText ? `生成失败：${msgText.substring(0, 80)}` : '生成失败：未知原因';
    });
    balance.value = res.data.remaining_points;
    // Refresh history
    fetchHistory();
  } catch (err) {
    const msg = err.response?.data?.error || "生成失败";
    alert(msg);
  } finally {
    isGenerating.value = false;
  }
};

const fetchHistory = async () => {
  const token = localStorage.getItem('pengip_token');
  if (!token) return;
  
  try {
    const res = await axios.get(`${API_URL}/user/history`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    historyImages.value = res.data.history;
  } catch(e) {
    console.error("Failed to fetch history");
  }
};

const handleGenerateMobile = async () => {
  await handleGenerate();
  mobileTab.value = 'result';
};

watch(showHistory, (val) => {
    if(val) fetchHistory();
});

onMounted(async () => {
  // 先尝试从主站获取 token
  try {
    const res = await axios.get('https://pengip.com/api/v1/user/token', { withCredentials: true });
    if (res.data.token) {
      localStorage.setItem('pengip_token', res.data.token);
      balance.value = res.data.user.balance;
      fetchHistory();
      checkDisclaimer();
      return;
    }
  } catch (e) {}
  
  // 如果主站没有，检查本地 token
  const token = localStorage.getItem('pengip_token');
  if (token) {
    try {
      const res = await axios.get(`${API_URL}/user/balance`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      balance.value = res.data.balance;
      fetchHistory();
      checkDisclaimer();
    } catch (e) {
      showActivation.value = true;
    }
  } else {
    showActivation.value = true;
  }
  updatePrompts();
});
</script>

<style>
/* Global Styles */
body {
  margin: 0;
  background: #f4f5f7;
  color: #1a1a2e;
  font-family: 'Inter', sans-serif;
}

.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: #ffffff;
  border-bottom: 1px solid #e0e3e8;
  flex-shrink: 0;
}

.logo { font-size: 20px; font-weight: bold; background: linear-gradient(90deg, #7c4dff, #00cc6a); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.balance { cursor: pointer; background: #f0f0f5; padding: 6px 12px; border-radius: 20px; font-size: 14px; color: #7c4dff; }
.balance:hover { background: #e8e8f5; }
.recharge-tip { font-size: 10px; color: #999; margin-left: 5px; }

main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.panel {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.panel.left { border-right: 1px solid #e0e3e8; max-width: 500px; }
.panel.right { background: #f4f5f7; }

.form-group { margin-bottom: 20px; }
.form-group label { display: block; margin-bottom: 8px; color: #666; font-size: 12px; }
.form-group input { width: 100%; padding: 12px; background: #ffffff; border: 1px solid #d0d3d8; color: #1a1a2e; border-radius: 6px; }

.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
  margin-top: 30px;
}

.result-card {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  aspect-ratio: 1;
  border: 1px solid #e0e3e8;
}

.result-card img { width: 100%; height: 100%; object-fit: cover; }

.fail-card {
  width: 100%;
  height: 100%;
  background: #fff5f5;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 14px;
  gap: 8px;
}
.fail-title { font-weight: 700; color: #c53030; font-size: 14px; }
.fail-reason { font-size: 12px; color: #742a2a; line-height: 1.4; }

.download-btn { position: absolute; bottom: 10px; right: 10px; background: rgba(0,0,0,0.7); color: #fff; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; text-decoration: none; }

.history-btn {
  background: #ffffff;
  color: #555;
  border: 1px solid #d0d3d8;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
}
.history-btn:hover { background: #f0f0f5; }

.header-left { display: flex; align-items: center; gap: 15px; }
.home-btn { color: #666; font-size: 13px; text-decoration: none; padding: 6px 12px; border: 1px solid #d0d3d8; border-radius: 6px; transition: all 0.2s; }
.home-btn:hover { color: #1a1a2e; border-color: #aaa; background: #f0f0f5; }

.section-tip { background: #f0eeff; border-left: 3px solid #7c4dff; padding: 10px 14px; border-radius: 0 6px 6px 0; margin-bottom: 16px; font-size: 13px; color: #555; line-height: 1.6; }
.tip-scene { color: #7c4dff; font-size: 12px; }
.field-tip { font-size: 12px; color: #888; margin-bottom: 8px; line-height: 1.5; }

.date-label {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    background: rgba(0,0,0,0.6);
    color: #aaa;
    font-size: 10px;
    padding: 4px;
    text-align: left;
}

/* Mobile tabs - hidden on desktop */
.mobile-tabs { display: none; }
.mobile-generate-wrap { display: none; }
.empty-result { display: none; }

@media (max-width: 768px) {
  header { padding: 10px 15px; }
  .logo { font-size: 16px; }
  .recharge-tip { display: none; }

  .mobile-tabs {
    display: flex;
    background: #ffffff;
    border-bottom: 1px solid #e0e3e8;
    flex-shrink: 0;
  }
  .mobile-tabs button {
    flex: 1;
    padding: 12px;
    background: transparent;
    border: none;
    color: #999;
    font-size: 14px;
    cursor: pointer;
    border-bottom: 2px solid transparent;
  }
  .mobile-tabs button.active {
    color: #1a1a2e;
    border-bottom-color: #7c4dff;
  }

  main {
    flex-direction: column;
    overflow: visible;
    height: auto;
  }

  .panel {
    max-width: 100% !important;
    border-right: none !important;
    padding: 15px;
    overflow-y: visible;
  }

  .mobile-hidden { display: none !important; }
  .desktop-only { display: none !important; }
  .mobile-generate-wrap { display: block; }
  .empty-result { display: block; color: #999; text-align: center; padding: 40px 0; }
}
</style>
