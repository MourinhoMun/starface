<template>
  <div class="upload-area" @click="triggerUpload">
    <div v-if="!imageSrc" class="upload-placeholder">
      <div class="icon-upload">📷</div>
      <p>点击上传您的照片 (正脸/半身)</p>
    </div>
    <img v-else :src="imageSrc" class="preview-img" alt="User Upload" />
    <input
      type="file"
      ref="fileInput"
      accept="image/*"
      style="display: none"
      @change="handleFileChange"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue';

const emit = defineEmits(['update:image']);
const imageSrc = ref(null);
const fileInput = ref(null);

const triggerUpload = () => {
  fileInput.value.click();
};

const handleFileChange = (event) => {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      imageSrc.value = e.target.result;
      emit('update:image', e.target.result);
    };
    reader.readAsDataURL(file);
  }
};
</script>

<style scoped>
.upload-area {
  width: 100%;
  height: 300px;
  background: #1a1a1a;
  border: 2px dashed #444;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.3s ease;
}

.upload-area:hover {
  border-color: #00ff88;
  background: #222;
}

.upload-placeholder {
  text-align: center;
  color: #888;
}

.icon-upload {
  font-size: 48px;
  margin-bottom: 15px;
  opacity: 0.7;
}

.preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
