<template>
  <div class="app-container">
    <header>
      <div class="logo">My Star Face</div>
      <div class="balance" @click="showActivation = true">
        💰 {{ balance }} 积分
        <span class="recharge-tip">(充值/激活)</span>
      </div>
    </header>

    <main>
      <div class="panel left">
        <ImageUpload @update:image="handleImageUpload" />
        
        <div class="form-group">
          <label>想融合的明星 (Star Name)</label>
          <input v-model="starName" type="text" placeholder="例如: 吴彦祖, Taylor Swift..." />
        </div>

        <FusionControl 
          v-model:mode="mode"
          v-model:singleRatio="singleRatio"
          v-model:batchRatios="batchRatios"
        />

        <SceneStyling :modelValue="styling" />
      </div>

      <div class="panel right">
        <!-- History Toggle -->
        <div style="text-align: right; margin-bottom: 10px;">
           <button @click="showHistory = !showHistory" class="history-btn">
             {{ showHistory ? '返回生成 (Back)' : '📜 历史记录 (History)' }}
           </button>
        </div>

        <!-- History View -->
        <div v-if="showHistory" class="history-view">
           <h3 style="color:#fff; margin-bottom: 20px;">历史生成记录</h3>
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
            <!-- Prompt Preview & Generate -->
            <PromptPreview 
              :prompts="generatedPrompts" 
              :cost="estimatedCost"
              :generating="isGenerating"
              @generate="handleGenerate"
            />

            <!-- Results -->
            <div v-if="results.length > 0" class="results-grid">
              <div v-for="(img, idx) in results.filter(r => r)" :key="idx" class="result-card">
                <img :src="img" />
                <a :href="img" download class="download-btn">⬇</a>
              </div>
              <p v-if="results.every(r => !r)" style="color:#f55; text-align:center; width:100%;">所有图片生成失败，请重试</p>
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
const API_URL = '/api/v1';

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
  background: #111;
  color: #fff;
  font-family: 'Inter', sans-serif;
}

.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 30px;
  background: #1a1a1a;
  border-bottom: 1px solid #333;
}

.logo { font-size: 20px; font-weight: bold; background: linear-gradient(90deg, #7c4dff, #00ff88); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.balance { cursor: pointer; background: #333; padding: 6px 12px; border-radius: 20px; font-size: 14px; color: #f9cb28; }
.balance:hover { background: #444; }
.recharge-tip { font-size: 10px; color: #888; margin-left: 5px; }

main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.panel {
  flex: 1;
  padding: 30px;
  overflow-y: auto;
}

.panel.left { border-right: 1px solid #222; max-width: 500px; }
.panel.right { background: #000; }

.form-group { margin-bottom: 20px; }
.form-group label { display: block; margin-bottom: 8px; color: #888; font-size: 12px; }
.form-group input { width: 100%; padding: 12px; background: #222; border: 1px solid #444; color: #fff; border-radius: 6px; }

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
  border: 1px solid #333;
}

.result-card img { width: 100%; height: 100%; object-fit: cover; }
.download-btn { position: absolute; bottom: 10px; right: 10px; background: rgba(0,0,0,0.7); color: #fff; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; text-decoration: none; }

.history-btn {
  background: #333;
  color: #fff;
  border: 1px solid #555;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
}
.history-btn:hover { background: #444; }

.date-label {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    background: rgba(0,0,0,0.6);
    color: #aaa;
    font-size: 10px;
    padding: 4px;
    text-align: left;
}
</style>
