<template>
  <div class="styling-input">
    <div class="styling-header">
      <label class="label">{{ label }}</label>
      <div class="actions">
        <button class="ai-btn" @click="generateAI" :disabled="keepOriginal || loading">
          ✨ {{ loading ? '随机中...' : '随机日常' }}
        </button>
        <label class="keep-check">
          <input type="checkbox" v-model="keepOriginal" @change="handleKeepChange" />
          保持原图
        </label>
      </div>
    </div>
    <input
      type="text"
      v-model="internalValue"
      :placeholder="placeholder"
      :disabled="keepOriginal"
      class="text-input"
    />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import stylingData from '../data/styling_data.js';

const props = defineProps(['label', 'placeholder', 'modelValue', 'keep', 'type']);
const emit = defineEmits(['update:modelValue', 'update:keep']);

const internalValue = ref(props.modelValue);
const keepOriginal = ref(props.keep);
const loading = ref(false);

watch(() => props.modelValue, (val) => internalValue.value = val);
watch(internalValue, (val) => emit('update:modelValue', val));
watch(keepOriginal, (val) => emit('update:keep', val));

const handleKeepChange = () => {
  if (keepOriginal.value) internalValue.value = "";
};

const generateAI = () => {
  loading.value = true;
  keepOriginal.value = false;
  
  // Simulate a short delay for UX
  setTimeout(() => {
    const list = stylingData[props.type];
    if (list && list.length > 0) {
      const randomItem = list[Math.floor(Math.random() * list.length)];
      internalValue.value = randomItem;
    } else {
      internalValue.value = "日常风格";
    }
    loading.value = false;
  }, 300);
};
</script>

<style scoped>
.styling-input {
  margin-bottom: 20px;
}

.styling-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.label {
  font-size: 14px;
  color: #555;
}

.actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.ai-btn {
  background: transparent;
  border: 1px solid #7c4dff;
  color: #7c4dff;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.ai-btn:hover:not(:disabled) {
  background: rgba(124, 77, 255, 0.1);
}

.text-input {
  width: 100%;
  background: #ffffff;
  border: 1px solid #d0d3d8;
  color: #1a1a2e;
  padding: 10px;
  border-radius: 6px;
  font-size: 14px;
}

.text-input:focus {
  border-color: #7c4dff;
  outline: none;
}

.keep-check {
  font-size: 12px;
  color: #888;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
</style>
