<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  NModal,
  NForm,
  NFormItem,
  NInput,
  NButton,
  NAlert,
  NCheckbox,
  useMessage,
} from 'naive-ui';
import { ShieldAlert, User, Lock, LogIn, UserPlus } from 'lucide-vue-next';
import {
  AuthClientService,
  type UserAccount,
} from '../../services/auth-client-service';

const props = withDefaults(
  defineProps<{
    show: boolean;
    mode?: 'admin' | 'user';
    closable?: boolean;
  }>(),
  {
    mode: 'user',
    closable: true,
  }
);

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void;
  (e: 'success', user: UserAccount): void;
}>();

const message = useMessage();

// Active tab: 'login' | 'register'
const activeTab = ref<'login' | 'register'>('login');
const username = ref('');
const password = ref('');
const confirmPassword = ref('');
const rememberMe = ref(true);
const loading = ref(false);
const errorMsg = ref<string | null>(null);

const REMEMBER_USERNAME_KEY = 'typesense_remember_username';

onMounted(() => {
  const savedUsername = localStorage.getItem(REMEMBER_USERNAME_KEY);
  if (savedUsername) {
    username.value = savedUsername;
    rememberMe.value = true;
  }
});

// Currently logged-in user (if any)
const currentUser = computed(() => AuthClientService.getCurrentUser());

// Switch between login and register tabs
function switchTab(tab: 'login' | 'register') {
  activeTab.value = tab;
  errorMsg.value = null;
  password.value = '';
  confirmPassword.value = '';
}

// Submit login
async function handleLogin() {
  const u = username.value.trim();
  const p = password.value.trim();

  if (!u || !p) {
    errorMsg.value = '请输入账号和密码';
    return;
  }

  loading.value = true;
  errorMsg.value = null;

  try {
    const user = await AuthClientService.login(u, p);

    if (rememberMe.value) {
      localStorage.setItem(REMEMBER_USERNAME_KEY, u);
    } else {
      localStorage.removeItem(REMEMBER_USERNAME_KEY);
    }

    // Role check for admin mode
    if (props.mode === 'admin' && user.role !== 'admin') {
      AuthClientService.logout();
      errorMsg.value = `账号「${user.username}」为普通成员，无管理控制台访问权限。`;
      loading.value = false;
      return;
    }

    message.success(props.mode === 'admin' ? `欢迎管理员 ${user.username}` : `欢迎回来，${user.username}`);
    emit('success', user);
    emit('update:show', false);
    resetForm();
  } catch (err: any) {
    errorMsg.value = err.message || '登录失败，请检查账号密码';
  } finally {
    loading.value = false;
  }
}

// Submit register (user role)
async function handleRegister() {
  const u = username.value.trim();
  const p = password.value.trim();
  const cp = confirmPassword.value.trim();

  if (!u || !p) {
    errorMsg.value = '请输入账号和密码';
    return;
  }

  if (p !== cp) {
    errorMsg.value = '两次输入的密码不一致';
    return;
  }

  loading.value = true;
  errorMsg.value = null;

  try {
    const user = await AuthClientService.register(u, p);

    if (rememberMe.value) {
      localStorage.setItem(REMEMBER_USERNAME_KEY, u);
    }

    message.success(`注册成功，已自动登录为：${user.username}`);
    emit('success', user);
    emit('update:show', false);
    resetForm();
  } catch (err: any) {
    errorMsg.value = err.message || '注册失败';
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  if (!rememberMe.value) {
    username.value = '';
  }
  password.value = '';
  confirmPassword.value = '';
  errorMsg.value = null;
}
</script>

<template>
  <NModal
    :show="show"
    :mask-closable="closable"
    :closable="closable"
    preset="card"
    class="auth-modal"
    style="width: 92vw; max-width: 420px; border-radius: 20px; box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.15);"
    @update:show="emit('update:show', $event)"
  >
    <!-- Header with Logo and dynamic title -->
    <div class="auth-header">
      <div v-if="mode === 'admin'" class="auth-logo-badge admin">
        <ShieldAlert class="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
      </div>
      <div v-else class="auth-logo-badge">
        <img src="/favicon.svg" alt="TypeSense" class="w-7 h-7" />
      </div>

      <h3 class="auth-title">
        <template v-if="mode === 'admin'">管理员鉴权登录</template>
        <template v-else-if="activeTab === 'login'">登录你的账户</template>
        <template v-else>创建你的账户</template>
      </h3>
    </div>

    <!-- Conflict warning for admin mode -->
    <div v-if="mode === 'admin' && currentUser && currentUser.role !== 'admin'" class="mb-3">
      <NAlert type="warning" :bordered="false">
        当前普通成员「{{ currentUser.username }}」无管理权限，请使用管理员账号。
      </NAlert>
    </div>

    <!-- Error message alert -->
    <NAlert v-if="errorMsg" type="error" :bordered="false" class="auth-error-alert" closable @close="errorMsg = null">
      {{ errorMsg }}
    </NAlert>

    <!-- Admin login form -->
    <div v-if="mode === 'admin'" class="auth-form-container">
      <NForm @submit.prevent="handleLogin">
        <NFormItem label="管理员账号">
          <NInput
            v-model:value="username"
            placeholder="请输入用户名"
            size="large"
            :disabled="loading"
            autocomplete="username"
          >
            <template #prefix>
              <User class="w-4 h-4 text-slate-400 mr-1" />
            </template>
          </NInput>
        </NFormItem>

        <NFormItem label="管理员密码">
          <NInput
            v-model:value="password"
            type="password"
            show-password-on="click"
            placeholder="请输入密码"
            size="large"
            :disabled="loading"
            autocomplete="current-password"
          >
            <template #prefix>
              <Lock class="w-4 h-4 text-slate-400 mr-1" />
            </template>
          </NInput>
        </NFormItem>

        <div class="auth-options-row">
          <NCheckbox v-model:checked="rememberMe">记住账号</NCheckbox>
        </div>

        <NButton
          type="primary"
          block
          size="large"
          class="auth-submit-btn"
          :loading="loading"
          attr-type="submit"
        >
          <template #icon>
            <LogIn class="w-4 h-4" />
          </template>
          登录
        </NButton>
      </NForm>
    </div>

    <!-- Respondent user forms (Login / Register) -->
    <div v-else class="auth-form-container">
      <!-- Login View -->
      <NForm v-if="activeTab === 'login'" @submit.prevent="handleLogin">
        <NFormItem label="用户名">
          <NInput
            v-model:value="username"
            placeholder="请输入用户名"
            size="large"
            :disabled="loading"
            autocomplete="username"
          >
            <template #prefix>
              <User class="w-4 h-4 text-slate-400 mr-1" />
            </template>
          </NInput>
        </NFormItem>

        <NFormItem label="密码">
          <NInput
            v-model:value="password"
            type="password"
            show-password-on="click"
            placeholder="请输入密码"
            size="large"
            :disabled="loading"
            autocomplete="current-password"
          >
            <template #prefix>
              <Lock class="w-4 h-4 text-slate-400 mr-1" />
            </template>
          </NInput>
        </NFormItem>

        <div class="auth-options-row">
          <NCheckbox v-model:checked="rememberMe">记住账号</NCheckbox>
        </div>

        <NButton
          type="primary"
          block
          size="large"
          class="auth-submit-btn"
          :loading="loading"
          attr-type="submit"
        >
          <template #icon>
            <LogIn class="w-4 h-4" />
          </template>
          登录
        </NButton>

        <!-- Google-style clear switch entry to register -->
        <div class="auth-switch-footer">
          <span>还没有账户？</span>
          <button type="button" class="auth-link-btn" @click="switchTab('register')">
            立即注册
          </button>
        </div>
      </NForm>

      <!-- Register View -->
      <NForm v-else @submit.prevent="handleRegister">
        <NFormItem label="用户名">
          <NInput
            v-model:value="username"
            placeholder="设置用户名"
            size="large"
            :disabled="loading"
            autocomplete="username"
          >
            <template #prefix>
              <User class="w-4 h-4 text-slate-400 mr-1" />
            </template>
          </NInput>
        </NFormItem>

        <NFormItem label="密码">
          <NInput
            v-model:value="password"
            type="password"
            show-password-on="click"
            placeholder="设置密码 (至少 4 位)"
            size="large"
            :disabled="loading"
            autocomplete="new-password"
          >
            <template #prefix>
              <Lock class="w-4 h-4 text-slate-400 mr-1" />
            </template>
          </NInput>
        </NFormItem>

        <NFormItem label="确认密码">
          <NInput
            v-model:value="confirmPassword"
            type="password"
            show-password-on="click"
            placeholder="请再次输入密码"
            size="large"
            :disabled="loading"
            autocomplete="new-password"
          >
            <template #prefix>
              <Lock class="w-4 h-4 text-slate-400 mr-1" />
            </template>
          </NInput>
        </NFormItem>

        <NButton
          type="primary"
          block
          size="large"
          class="auth-submit-btn"
          :loading="loading"
          attr-type="submit"
        >
          <template #icon>
            <UserPlus class="w-4 h-4" />
          </template>
          注册
        </NButton>

        <!-- Google-style clear switch entry to login -->
        <div class="auth-switch-footer">
          <span>已有账户？</span>
          <button type="button" class="auth-link-btn" @click="switchTab('login')">
            直接登录
          </button>
        </div>
      </NForm>
    </div>
  </NModal>
</template>

<style scoped>
.auth-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 24px;
}

.auth-logo-badge {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f8fafc;
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  margin-bottom: 12px;
}

.auth-logo-badge.admin {
  background: rgba(79, 70, 229, 0.08);
  border-color: rgba(79, 70, 229, 0.2);
}

.auth-title {
  font-size: 1.35rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
  letter-spacing: -0.02em;
}

:root.dark .auth-title {
  color: #f8fafc;
}

.auth-error-alert {
  margin-bottom: 16px;
  border-radius: 8px;
}

.auth-options-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  margin-top: -6px;
}

.auth-submit-btn {
  margin-top: 4px;
  font-weight: 600;
  height: 42px;
  border-radius: 10px;
}

.auth-switch-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  font-size: 0.9rem;
  color: #64748b;
  gap: 4px;
}

:root.dark .auth-switch-footer {
  border-top-color: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
}

.auth-link-btn {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: #4f46e5;
  cursor: pointer;
  transition: color 0.15s ease;
  outline: none;
}

.auth-link-btn:hover {
  color: #4338ca;
  text-decoration: underline;
}

:root.dark .auth-link-btn {
  color: #818cf8;
}

:root.dark .auth-link-btn:hover {
  color: #a5b4fc;
}
</style>
