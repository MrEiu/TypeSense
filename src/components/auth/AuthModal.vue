<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  NModal,
  NCard,
  NTabs,
  NTabPane,
  NForm,
  NFormItem,
  NInput,
  NButton,
  NAlert,
  NTag,
  NSpace,
  useMessage,
} from 'naive-ui';
import { ShieldAlert, User, Lock, ArrowRight, UserPlus, LogIn } from 'lucide-vue-next';
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

// 表单状态
const activeTab = ref<'login' | 'register'>('login');
const username = ref('');
const password = ref('');
const confirmPassword = ref('');
const loading = ref(false);
const errorMsg = ref<string | null>(null);

// 当前已登录但非管理员的用户（如果有）
const currentUser = computed(() => AuthClientService.getCurrentUser());

// 提交登录
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

    // 若当前为管理控制台模式，校验必须具备 admin 角色
    if (props.mode === 'admin' && user.role !== 'admin') {
      AuthClientService.logout();
      errorMsg.value = `账号「${user.username}」为普通成员，无管理控制台访问权限。请输入管理员账号。`;
      loading.value = false;
      return;
    }

    message.success(props.mode === 'admin' ? `欢迎管理员 ${user.username} 进入控制台` : `欢迎回来，${user.username}`);
    emit('success', user);
    emit('update:show', false);
    resetForm();
  } catch (err: any) {
    errorMsg.value = err.message || '登录失败，请检查账号密码';
  } finally {
    loading.value = false;
  }
}

// 提交注册 (普通成员)
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
  username.value = '';
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
    style="width: 92vw; max-width: 460px; border-radius: 16px;"
    @update:show="emit('update:show', $event)"
  >
    <!-- 管理员模式专属展示 -->
    <div v-if="mode === 'admin'" class="auth-admin-header">
      <div class="auth-icon-wrap admin">
        <ShieldAlert class="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
      </div>
      <h3 class="auth-title">控制台管理员准入鉴权</h3>
      <p class="auth-subtitle">
        访问问卷发布与管理控制台需要系统管理员权限，请输入管理员账号。
      </p>

      <div v-if="currentUser && currentUser.role !== 'admin'" class="auth-conflict-alert">
        <NAlert type="warning" :bordered="false" class="mb-3">
          当前已登录普通成员「{{ currentUser.username }}」，无管理权限。请以管理员身份登录。
        </NAlert>
      </div>
    </div>

    <!-- 普通受访者登录注册展示 -->
    <div v-else class="auth-user-header">
      <div class="auth-icon-wrap user">
        <User class="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h3 class="auth-title">登录以开始作答</h3>
      <p class="auth-subtitle">
        填写此问卷需要登录账号，以便准确记录与追踪您的问卷反馈。
      </p>
    </div>

    <!-- 错误警告条 -->
    <NAlert v-if="errorMsg" type="error" :bordered="false" class="auth-error-alert" closable @close="errorMsg = null">
      {{ errorMsg }}
    </NAlert>

    <!-- 管理员表单 (仅单向登录) -->
    <div v-if="mode === 'admin'" class="auth-form-container">
      <NForm @submit.prevent="handleLogin">
        <NFormItem label="管理员账号">
          <NInput
            v-model:value="username"
            placeholder="请输入管理员用户名 (如 admin)"
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
            placeholder="请输入管理员密码"
            size="large"
            :disabled="loading"
            autocomplete="current-password"
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
            <LogIn class="w-4 h-4" />
          </template>
          验证并进入控制台
        </NButton>
      </NForm>
    </div>

    <!-- 普通受访者表单 (支持登录 / 注册 Tabs) -->
    <div v-else class="auth-form-container">
      <NTabs v-model:value="activeTab" justify-content="space-evenly" type="segment" class="mb-4">
        <NTabPane name="login" tab="账号登录" />
        <NTabPane name="register" tab="注册新成员" />
      </NTabs>

      <!-- 登录标签页 -->
      <NForm v-if="activeTab === 'login'" @submit.prevent="handleLogin">
        <NFormItem label="账号名称">
          <NInput
            v-model:value="username"
            placeholder="请输入您的用户名"
            size="large"
            :disabled="loading"
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
            <LogIn class="w-4 h-4" />
          </template>
          登录并继续答卷
        </NButton>
      </NForm>

      <!-- 注册标签页 -->
      <NForm v-else @submit.prevent="handleRegister">
        <NFormItem label="设置账号">
          <NInput
            v-model:value="username"
            placeholder="字母/数字/下划线 (2~32字符)"
            size="large"
            :disabled="loading"
          >
            <template #prefix>
              <User class="w-4 h-4 text-slate-400 mr-1" />
            </template>
          </NInput>
        </NFormItem>

        <NFormItem label="设置密码">
          <NInput
            v-model:value="password"
            type="password"
            show-password-on="click"
            placeholder="至少 4 位密码"
            size="large"
            :disabled="loading"
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
          注册并开始答题
        </NButton>
      </NForm>
    </div>
  </NModal>
</template>

<style scoped>
.auth-admin-header,
.auth-user-header {
  text-align: center;
  margin-bottom: 20px;
}

.auth-icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.auth-icon-wrap.admin {
  background: rgba(79, 70, 229, 0.1);
  border: 1px solid rgba(79, 70, 229, 0.2);
}

.auth-icon-wrap.user {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.auth-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 6px 0;
  letter-spacing: -0.01em;
}

:root.dark .auth-title {
  color: #f8fafc;
}

.auth-subtitle {
  font-size: 0.875rem;
  color: #64748b;
  margin: 0;
  line-height: 1.45;
}

:root.dark .auth-subtitle {
  color: #94a3b8;
}

.auth-error-alert {
  margin-bottom: 16px;
  border-radius: 8px;
}

.auth-submit-btn {
  margin-top: 8px;
  font-weight: 600;
}

</style>
