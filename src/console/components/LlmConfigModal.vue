<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  NModal,
  NCard,
  NForm,
  NFormItem,
  NInput,
  NButton,
  NSpace,
  NSpin,
  NAlert,
  NSelect,
  useMessage,
} from 'naive-ui';
import { Cpu, RefreshCw, Globe, KeyRound, Box } from 'lucide-vue-next';
import {
  SystemConfigService,
  type AiSystemConfig,
} from '../../services/system-config-service';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void;
  (e: 'saved', config: AiSystemConfig): void;
}>();

const message = useMessage();

const baseURL = ref('');
const apiKey = ref('');
const model = ref('');
const loading = ref(false);
const saving = ref(false);
const fetchingModels = ref(false);
const availableModels = ref<string[]>([]);
const errorMsg = ref<string | null>(null);

watch(
  () => props.show,
  async (isOpen) => {
    if (isOpen) {
      errorMsg.value = null;
      loading.value = true;
      try {
        const config = await SystemConfigService.getConfig();
        baseURL.value = config.baseURL || '';
        apiKey.value = config.apiKeyMasked || '';
        model.value = config.model || '';
      } catch (err: any) {
        errorMsg.value = err.message || '加载配置失败';
      } finally {
        loading.value = false;
      }
    }
  },
  { immediate: true }
);

// 动态拉取模型列表
async function handleFetchModels() {
  fetchingModels.value = true;
  errorMsg.value = null;
  try {
    const list = await SystemConfigService.fetchAvailableModels({
      baseURL: baseURL.value.trim() || undefined,
      apiKey: apiKey.value.trim() || undefined,
    });
    availableModels.value = list;
    message.success(`成功连接服务商，已拉取 ${list.length} 个可用模型`);
    if (list.length > 0 && !model.value) {
      model.value = list[0];
    }
  } catch (err: any) {
    errorMsg.value = err.message || '拉取模型列表失败，请检查 Base URL 与 API Key';
  } finally {
    fetchingModels.value = false;
  }
}

// 保存配置
async function handleSave() {
  saving.value = true;
  errorMsg.value = null;
  try {
    const saved = await SystemConfigService.saveConfig({
      baseURL: baseURL.value.trim(),
      apiKey: apiKey.value.trim(),
      model: model.value.trim(),
    });
    message.success('大模型配置保存成功');
    emit('saved', saved);
    emit('update:show', false);
  } catch (err: any) {
    errorMsg.value = err.message || '保存配置失败';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <NModal
    :show="show"
    @update:show="(val) => emit('update:show', val)"
    preset="card"
    title="大模型服务接入配置"
    style="width: 560px; max-width: 95vw; border-radius: 14px;"
    :segmented="{ content: true, footer: true }"
  >
    <template #header-extra>
      <Cpu style="width: 20px; height: 20px; color: #4f46e5;" />
    </template>

    <div v-if="loading" style="padding: 40px 0; text-align: center;">
      <NSpin size="medium" />
    </div>

    <div v-else>
      <NAlert v-if="errorMsg" type="error" closable class="mb-4" style="margin-bottom: 16px;">
        {{ errorMsg }}
      </NAlert>

      <NForm label-placement="top" :show-feedback="false">
        <!-- 1. Base URL -->
        <NFormItem label="API 地址 (Base URL)" style="margin-bottom: 16px;">
          <NInput
            v-model:value="baseURL"
            placeholder="例如 https://api.deepseek.com (留空使用官方默认)"
            size="medium"
          >
            <template #prefix>
              <Globe style="width: 15px; height: 15px; color: #94a3b8; margin-right: 4px;" />
            </template>
          </NInput>
        </NFormItem>

        <!-- 2. API Key -->
        <NFormItem label="API 密钥 (API Key)" style="margin-bottom: 16px;">
          <NInput
            v-model:value="apiKey"
            type="password"
            show-password-on="click"
            placeholder="请输入 API Key (若保留已有掩码则不变更)"
            size="medium"
          >
            <template #prefix>
              <KeyRound style="width: 15px; height: 15px; color: #94a3b8; margin-right: 4px;" />
            </template>
          </NInput>
        </NFormItem>

        <!-- 3. 模型名称 -->
        <NFormItem label="模型名称 (Model)" style="margin-bottom: 16px;">
          <div style="display: flex; gap: 8px; width: 100%;">
            <NInput
              v-model:value="model"
              placeholder="例如 deepseek-v4-flash、gpt-4o"
              size="medium"
              style="flex: 1;"
            >
              <template #prefix>
                <Box style="width: 15px; height: 15px; color: #94a3b8; margin-right: 4px;" />
              </template>
            </NInput>
            <NButton
              secondary
              size="medium"
              :loading="fetchingModels"
              @click="handleFetchModels"
              title="连接服务商动态拉取可用模型列表"
            >
              <template #icon>
                <RefreshCw style="width: 14px; height: 14px;" />
              </template>
              测试与拉取
            </NButton>
          </div>
        </NFormItem>

        <!-- 若拉取到可用模型列表，提供快速选择下拉 -->
        <div v-if="availableModels.length > 0" style="margin-bottom: 16px;">
          <div style="font-size: 0.78rem; color: #64748b; margin-bottom: 6px;">
            可用模型快速选择 (共 {{ availableModels.length }} 个)：
          </div>
          <NSelect
            :options="availableModels.map((m) => ({ label: m, value: m }))"
            :value="model"
            @update:value="(val) => (model = val)"
            placeholder="从拉取列表中选择模型"
            size="small"
            filterable
          />
        </div>
      </NForm>
    </div>

    <template #footer>
      <NSpace justify="end">
        <NButton @click="emit('update:show', false)">取消</NButton>
        <NButton type="primary" :loading="saving" @click="handleSave">
          保存配置
        </NButton>
      </NSpace>
    </template>
  </NModal>
</template>
