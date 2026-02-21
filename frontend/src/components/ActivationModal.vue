<template>
  <div v-if="isOpen" class="modal-overlay">
    <div class="modal">
      <h2>软件激活 (Activate Software)</h2>
      <p class="desc">请输入您的激活码以开始使用</p>
      
      <div class="input-group">
        <input 
          type="text" 
          v-model="code" 
          placeholder="XXXX-XXXX-XXXX-XXXX" 
          maxlength="19"
          class="code-input"
        />
      </div>

       <div class="contact-info-prominent">
        <p>如需获取激活码，请添加鹏哥微信：<span class="highlight">peng_ip</span></p>
      </div>

      <div class="status-msg" :class="{ error: isError }">{{ statusMsg }}</div>

      <button @click="handleActivate" class="activate-btn" :disabled="loading">
        {{ loading ? '激活中...' : '立即激活' }}
      </button>

   <!-- Removed bottom contact-info as it's now moved up -->
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import axios from 'axios';

const props = defineProps(['isOpen']);
const emit = defineEmits(['activated', 'close']);

const code = ref('');
const statusMsg = ref('');
const isError = ref(false);
const loading = ref(false);

// Generate or get persistent Device ID
const getDeviceId = () => {
  let mid = localStorage.getItem('device_id');
  if (!mid) {
    mid = 'device-' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('device_id', mid);
  }
  return mid;
};

const handleActivate = async () => {
  if (!code.value) {
    statusMsg.value = "请输入激活码";
    isError.value = true;
    return;
  }

  loading.value = true;
  statusMsg.value = "";
  isError.value = false;

  try {
    const res = await axios.post('/api/v1/user/activate', {
      code: code.value,
      deviceId: getDeviceId()
    });

    if (res.data.success) {
      statusMsg.value = "激活成功！";
      localStorage.setItem('auth_token', res.data.token);
      emit('activated', res.data.user);
      setTimeout(() => emit('close'), 1500);
    }
  } catch (err) {
    isError.value = true;
    // Map specific errors if needed, otherwise show returned error
    statusMsg.value = err.response?.data?.error || "激活失败，请检查网络或激活码";
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(5px);
}

.modal {
  background: #2a2a2a;
  padding: 30px;
  border-radius: 16px;
  width: 400px;
  text-align: center;
  border: 1px solid #444;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}

h2 {
  color: #fff;
  margin-bottom: 10px;
}

.desc {
  color: #aaa;
  font-size: 14px;
  margin-bottom: 20px;
}

.code-input {
  width: 100%;
  padding: 12px;
  background: #111;
  border: 1px solid #444;
  color: #fff;
  border-radius: 8px;
  font-family: monospace;
  font-size: 18px;
  text-align: center;
  letter-spacing: 2px;
  margin-bottom: 5px; /* Reduced margin to stick closer to contact info */
}

.code-input:focus {
  border-color: #00ff88;
  outline: none;
}

.contact-info-prominent {
  margin-bottom: 20px;
  font-size: 14px;
  color: #ccc;
}

.contact-info-prominent p {
  margin: 0;
}

.activate-btn {
  width: 100%;
  padding: 12px;
  background: linear-gradient(90deg, #00ff88, #00cc6a);
  border: none;
  font-weight: bold;
  color: #000;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  transition: transform 0.2s;
}

.activate-btn:hover:not(:disabled) {
  transform: scale(1.02);
}

.activate-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.status-msg {
  height: 20px;
  font-size: 14px;
  color: #00ff88;
  margin-bottom: 10px;
}

.status-msg.error {
  color: #ff4d4d;
}

.highlight {
  color: #00ff88;
  font-weight: bold;
  font-size: 16px;
}
</style>
