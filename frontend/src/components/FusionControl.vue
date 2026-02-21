<template>
  <div class="fusion-control">
    <div class="mode-switch">
      <button :class="{ active: mode === 'single' }" @click="$emit('update:mode', 'single')">单张模式 (Single)</button>
      <button :class="{ active: mode === 'batch' }" @click="$emit('update:mode', 'batch')">批量模式 (Batch x5)</button>
    </div>

    <!-- Single Mode -->
    <div v-if="mode === 'single'" class="slider-group">
      <div class="slider-labels">
        <span>像我 (User)</span>
        <span>像明星 (Star)</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        :value="singleRatio"
        @input="$emit('update:singleRatio', $event.target.value)"
        class="range-slider"
      />
      <div class="current-val">{{ singleRatio }}% 像我</div>
    </div>

    <!-- Batch Mode -->
    <div v-else class="batch-sliders">
      <div v-for="(val, index) in batchRatios" :key="index" class="batch-slider-row">
        <label>图 {{ index + 1 }}</label>
        <input
          type="range"
          min="0"
          max="100"
          :value="val"
          @input="updateBatch(index, $event.target.value)"
          class="range-slider small"
        />
        <span>{{ val }}%</span>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps(['mode', 'singleRatio', 'batchRatios']);
const emit = defineEmits(['update:mode', 'update:singleRatio', 'update:batchRatios']);

const updateBatch = (index, value) => {
  const newRatios = [...props.batchRatios];
  newRatios[index] = value;
  emit('update:batchRatios', newRatios);
};
</script>

<style scoped>
.fusion-control {
  background: #222;
  padding: 20px;
  border-radius: 12px;
  margin-bottom: 20px;
}

.mode-switch {
  display: flex;
  background: #111;
  border-radius: 8px;
  padding: 4px;
  margin-bottom: 20px;
  gap: 10px;
}

.mode-switch button {
  flex: 1;
  background: transparent;
  border: none;
  color: #666;
  padding: 8px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.3s;
}

.mode-switch button.active {
  background: #333;
  color: #fff;
  font-weight: bold;
}

.range-slider {
  width: 100%;
  -webkit-appearance: none;
  background: linear-gradient(90deg, #7c4dff, #ff4d4d);
  height: 6px;
  border-radius: 3px;
  outline: none;
}

.range-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  background: #fff;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 10px rgba(0,0,0,0.5);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  color: #888;
  font-size: 12px;
  margin-bottom: 10px;
}

.current-val {
  text-align: center;
  color: #7c4dff;
  font-weight: bold;
  margin-top: 10px;
}

.batch-slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  color: #ccc;
  font-size: 12px;
}
</style>
