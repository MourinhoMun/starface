<template>
  <div class="prompt-preview">
    <div class="header">
      <h3>生成参数预览</h3>
      <button class="generate-btn" @click="$emit('generate')" :disabled="generating">
        {{ generating ? '正在为您生成中，请耐心等待...' : '🚀 开始生成' }}
        <span class="cost">{{ cost }} 积分</span>
      </button>
    </div>

    <div class="prompts-list">
      <div v-for="(prompt, index) in prompts" :key="index" class="prompt-item">
        <div class="prompt-title">
          图像 {{ index + 1 }}（融合比例 {{ prompt.ratio }}%）
        </div>
        <div class="summary-card">
          <div class="summary-row">
            <span class="summary-label">你的占比</span>
            <span class="summary-value">{{ prompt.ratio }}%</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">明星占比</span>
            <span class="summary-value">{{ 100 - parseInt(prompt.ratio) }}%</span>
          </div>
          <div class="summary-hint">AI 将依据参数自动生成最优图像</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps(['prompts', 'cost', 'generating']);
const emit = defineEmits(['generate', 'update:prompts']);
</script>

<style scoped>
.prompt-preview {
  background: #ffffff;
  padding: 20px;
  border-radius: 12px;
  border: 1px solid #e0e3e8;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 10px;
}

h3 {
  color: #1a1a2e;
  font-size: 18px;
  margin: 0;
}

.generate-btn {
  background: linear-gradient(90deg, #ff4d4d, #f9cb28);
  border: none;
  padding: 12px 24px;
  border-radius: 30px;
  color: #fff;
  font-weight: bold;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 4px 15px rgba(255, 77, 77, 0.3);
  transition: transform 0.2s;
}

.generate-btn:hover:not(:disabled) {
  transform: scale(1.05);
}

.generate-btn:disabled {
  opacity: 0.6;
  cursor: waiting;
}

.cost {
  background: rgba(0,0,0,0.2);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}

.prompts-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.prompt-item {
  background: #f8f9fb;
  padding: 15px;
  border-radius: 8px;
  border-left: 4px solid #7c4dff;
}

.prompt-title {
  color: #666;
  font-size: 12px;
  margin-bottom: 10px;
  font-weight: bold;
}

.summary-card {
  background: #ffffff;
  border: 1px solid #e0e3e8;
  border-radius: 6px;
  padding: 12px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 13px;
}

.summary-label {
  color: #888;
}

.summary-value {
  font-weight: bold;
  color: #333;
}

.summary-hint {
  margin-top: 10px;
  font-size: 11px;
  color: #aaa;
  text-align: center;
  border-top: 1px dashed #e0e3e8;
  padding-top: 8px;
}
</style>
