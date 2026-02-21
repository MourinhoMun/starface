<template>
  <div class="prompt-preview">
    <div class="header">
      <h3>提示词预览 (Prompt Review)</h3>
      <button class="generate-btn" @click="$emit('generate')" :disabled="generating">
        {{ generating ? '正在为您生成中，请耐心等待...' : '🚀 开始生成 (Start Generation)' }}
        <span class="cost">{{ cost }} 积分</span>
      </button>
    </div>

    <div class="prompts-list">
      <div v-for="(prompt, index) in prompts" :key="index" class="prompt-item">
        <div class="prompt-title">
          Image {{ index + 1 }} (Ratio: {{ prompt.ratio }}%)
        </div>
        <div class="prompt-content">
          <label>正向提示词 (Positive)</label>
          <textarea v-model="prompt.positive" rows="4"></textarea>
          
          <label>负向提示词 (Negative)</label>
          <textarea v-model="prompt.negative" rows="2" class="negative"></textarea>
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

label {
  color: #888;
  font-size: 12px;
  display: block;
  margin-bottom: 4px;
}

textarea {
  width: 100%;
  background: #ffffff;
  border: 1px solid #d0d3d8;
  color: #333;
  padding: 8px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
  resize: vertical;
  margin-bottom: 10px;
}

textarea:focus {
  border-color: #7c4dff;
  outline: none;
}

.negative {
  border-color: #ffcccc;
  background: #fff5f5;
  color: #cc4444;
}
</style>
