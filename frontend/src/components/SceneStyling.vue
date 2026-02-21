<template>
  <div class="scene-styling">
    <h3>场景与造型 (Scene & Styling)</h3>
    <StylingInput
      label="服装 (Clothing)"
      placeholder="输入服装描述 (例如: 红色复古丝绒旗袍)..."
      v-model="modelValue.clothing.text"
      v-model:keep="modelValue.clothing.keep"
      type="clothing"
    />
    <StylingInput
      label="背景 (Background)"
      placeholder="输入背景描述 (例如: 赛博朋克雨夜)..."
      v-model="modelValue.background.text"
      v-model:keep="modelValue.background.keep"
      type="background"
    />
    <StylingInput
      label="发型 (Hairstyle)"
      placeholder="输入发型 (例如: 长卷发, 寸头)..."
      v-model="modelValue.hair.text"
      v-model:keep="modelValue.hair.keep"
      type="hair"
    />
    <StylingInput
      label="姿势 (Pose)"
      placeholder="输入姿势 (例如: 侧身回眸, 双手交叉)..."
      v-model="modelValue.pose.text"
      v-model:keep="modelValue.pose.keep"
      type="pose"
    />
  </div>
</template>

<script setup>
import StylingInput from './StylingInput.vue';

const props = defineProps(['modelValue']);
const emit = defineEmits(['update:modelValue']);

// Assuming parent passes a reactive object for styling properties
</script>

<style scoped>
.scene-styling {
  background: #f0f2f5;
  padding: 20px;
  border-radius: 12px;
  margin-bottom: 20px;
}

h3 {
  color: #1a1a2e;
  font-size: 16px;
  margin-bottom: 15px;
  border-left: 3px solid #7c4dff;
  padding-left: 10px;
}
</style>
