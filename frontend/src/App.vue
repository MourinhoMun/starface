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
        <div class="section-tip">上传一张你的正面清晰照片，AI 会将你的面部特征与明星融合。<br><span class="tip-scene">适合场景：想看看自己和偶像融合后的效果，或制作个性化头像。</span></div>
        <ImageUpload @update:image="handleImageUpload" />

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
                 <a :href="img.imageUrl" download class="download-btn">⬇</a>
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
              <div v-for="(img, idx) in results.filter(r => r)" :key="idx" class="result-card">
                <img :src="img" />
                <a :href="img" download class="download-btn">⬇</a>
              </div>
              <p v-if="results.every(r => !r)" style="color:#f55; text-align:center; width:100%;">所有图片生成失败，请重试</p>
            </div>
            <div v-else class="empty-result">
              <p>完成左侧设置后点击"开始生成"</p>
            </div>
        </div>
      </div>
    </main>

    <ActivationModal 
      :isOpen="showActivation" 
      @close="showActivation = false"
      @activated="handleActivated"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import axios from 'axios';
import ImageUpload from './components/ImageUpload.vue';
import FusionControl from './components/FusionControl.vue';
import SceneStyling from './components/SceneStyling.vue';
import PromptPreview from './components/PromptPreview.vue';
import ActivationModal from './components/ActivationModal.vue';

// State
const balance = ref(0);
const showActivation = ref(false);
const isGenerating = ref(false);
const showHistory = ref(false);
const mobileTab = ref('settings');
const historyImages = ref([]);

const userImage = ref(null);
const starName = ref('');
const mode = ref('single');
const singleRatio = ref(50);
const batchRatios = ref([20, 40, 60, 80, 100]); // 5 default ratios

const styling = reactive({
  clothing: { text: '', keep: false },
  background: { text: '', keep: false },
  hair: { text: '', keep: false },
  pose: { text: '', keep: false }
});

const generatedPrompts = ref([]);
const results = ref([]);

// Mock API URL (Dev)
// In production, this would be relative or configured
const API_URL = '/starface/api/v1';

// Computed
const estimatedCost = computed(() => {
  return mode.value === 'single' ? 10 : 50;
});

// Logic
const handleImageUpload = (img) => {
  userImage.value = img;
};

const handleActivated = (data) => {
  balance.value = data.balance;
};

// Prompt Generation Logic
const generatePromptText = (ratio) => {
  const userW = (parseInt(ratio) / 100).toFixed(1);
  const starW = (1 - userW).toFixed(1);
  
  const clothing = styling.clothing.keep ? "same clothing" : (styling.clothing.text || "elegant");
  const bg = styling.background.keep ? "same background" : (styling.background.text || "studio");
  const hair = styling.hair.keep ? "" : (styling.hair.text ? `, hair: ${styling.hair.text}` : "");
  const pose = styling.pose.keep ? "" : (styling.pose.text ? `, pose: ${styling.pose.text}` : "");

  return `(Masterpiece, 1k), mixing [User]:${userW} and ${starName.value || 'Star'}:${starW}${hair}${pose}, wearing ${clothing}, background: ${bg}, (photorealistic:1.4)`;
};

const updatePrompts = () => {
  const newPrompts = [];
  const negative = "(worst quality:1.4), lowres, bad anatomy, error, watermark";

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
watch([starName, mode, singleRatio, batchRatios, styling], updatePrompts, { deep: true });

// Actions
const handleGenerate = async () => {
  if (balance.value < estimatedCost.value) {
    alert("余额不足，请充值！");
    showActivation.value = true;
    return;
  }

  isGenerating.value = true;
  try {
    const token = localStorage.getItem('auth_token');
    const res = await axios.post(`${API_URL}/proxy/generate`, {
      batch_size: mode.value === 'single' ? 1 : 5,
      prompts: generatedPrompts.value,
      userImageBase64: userImage.value // Pass uploaded image data
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    results.value = res.data.images;
    balance.value = res.data.remaining_points;
    // Refresh history
    fetchHistory();
  } catch (err) {
    alert(err.response?.data?.error || "生成失败");
  } finally {
    isGenerating.value = false;
  }
};

const fetchHistory = async () => {
  const token = localStorage.getItem('auth_token');
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
  const token = localStorage.getItem('auth_token');
  if (token) {
    try {
      const res = await axios.get(`${API_URL}/user/balance`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      balance.value = res.data.balance;
      fetchHistory();
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
