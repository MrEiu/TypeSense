<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  NDrawer,
  NDrawerContent,
  NCard,
  NTag,
  NInput,
  NButton,
  NSpace,
  NList,
  NListItem,
  NThing,
  NSwitch,
  NSpin,
  useMessage,
} from 'naive-ui';
import {
  Share2,
  Copy,
  Check,
  ExternalLink,
  Download,
  QrCode as QrCodeIcon,
} from 'lucide-vue-next';
import QRCode from 'qrcode';
import {
  QuestionnaireRepositoryService,
  type SurveyMetadataItem,
} from '../../services/questionnaire-repository-service';
import type { QuestionnaireModel } from '../../schema/questionnaire-schema-types';

const props = defineProps<{
  show: boolean;
  survey: SurveyMetadataItem | null;
}>();

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void;
  (e: 'status-changed', payload: { id: string; status: 'published' | 'paused' }): void;
}>();

const message = useMessage();
const loading = ref(false);
const surveyDetail = ref<QuestionnaireModel | null>(null);
const generatedShortLink = ref('');
const isShortLinkLoading = ref(false);
const copiedKey = ref<string | null>(null);
const qrCodeDataUrl = ref<string>('');
const isStatusSwitching = ref(false);

watch(
  () => [props.show, props.survey?.id],
  async ([show, id]) => {
    if (show && id && props.survey) {
      await loadDetail();
      await generateShortLinkAndQr();
    } else {
      surveyDetail.value = null;
      generatedShortLink.value = '';
      qrCodeDataUrl.value = '';
    }
  }
);

async function loadDetail() {
  if (!props.survey) return;
  loading.value = true;
  try {
    const targetId = props.survey.slug || props.survey.id;
    surveyDetail.value = await QuestionnaireRepositoryService.getSurvey(targetId);
  } catch (err) {
    console.error('[SurveyDetailDrawer] 加载详情失败:', err);
  } finally {
    loading.value = false;
  }
}

async function generateShortLinkAndQr() {
  if (!props.survey) return;
  isShortLinkLoading.value = true;
  try {
    const targetId = props.survey.slug || props.survey.id;
    const link = await QuestionnaireRepositoryService.generateShortLink(targetId);
    generatedShortLink.value = link;
    // 生成二维码
    qrCodeDataUrl.value = await QRCode.toDataURL(link, {
      width: 220,
      margin: 1.5,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
  } catch (err) {
    console.error('[SurveyDetailDrawer] 生成短链/二维码失败:', err);
    const fallbackUrl = QuestionnaireRepositoryService.generateAccessUrl(
      props.survey.slug || props.survey.id
    );
    generatedShortLink.value = fallbackUrl;
    qrCodeDataUrl.value = await QRCode.toDataURL(fallbackUrl, { width: 220, margin: 1.5 });
  } finally {
    isShortLinkLoading.value = false;
  }
}

async function copyText(text: string, key: string) {
  try {
    await navigator.clipboard.writeText(text);
    copiedKey.value = key;
    message.success('已复制到剪贴板');
    setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = null;
    }, 2000);
  } catch {
    message.error('复制失败，请手动选择复制');
  }
}

function downloadQrCode() {
  if (!qrCodeDataUrl.value || !props.survey) return;
  const a = document.createElement('a');
  a.href = qrCodeDataUrl.value;
  a.download = `${props.survey.title}_访问二维码.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  message.success('二维码已下载');
}

async function handleStatusChange(value: boolean) {
  if (!props.survey) return;
  isStatusSwitching.value = true;
  const newStatus: 'published' | 'paused' = value ? 'published' : 'paused';
  try {
    const targetId = props.survey.slug || props.survey.id;
    const success = await QuestionnaireRepositoryService.updateSurveyStatus(targetId, newStatus);
    if (success) {
      props.survey.status = newStatus;
      emit('status-changed', { id: props.survey.id, status: newStatus });
      message.success(newStatus === 'published' ? '问卷已开启作答收集' : '问卷已暂停作答收集');
    } else {
      message.error('更新问卷状态失败');
    }
  } catch (err) {
    message.error('更新问卷状态异常');
  } finally {
    isStatusSwitching.value = false;
  }
}
</script>

<template>
  <NDrawer
    :show="show"
    :width="640"
    placement="right"
    @update:show="(val) => emit('update:show', val)"
  >
    <NDrawerContent :title="`问卷分发与管控 · ${survey?.title || '详情'}`" closable>
      <div v-if="loading" style="padding: 60px 0; text-align: center;">
        <NSpin size="large" />
      </div>

      <div v-else-if="survey" style="display: flex; flex-direction: column; gap: 20px;">
        <!-- 基础概览与状态控制卡片 -->
        <NCard size="small" :bordered="true" style="border-radius: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <div>
              <h3 style="margin: 0 0 6px 0; font-size: 1.1rem; color: #0f172a; font-weight: 700;">
                {{ survey.title }}
              </h3>
              <p style="margin: 0; color: #64748b; font-size: 0.88rem; line-height: 1.5;">
                {{ survey.description || '暂无描述' }}
              </p>
            </div>
          </div>

          <!-- 问卷收集控制开关 -->
          <div
            style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 10px 14px;
              background: #f8fafc;
              border-radius: 8px;
              margin-bottom: 12px;
            "
          >
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 600; font-size: 0.88rem; color: #1e293b;">
                问卷作答收集状态:
              </span>
              <NTag
                size="small"
                :type="survey.status === 'published' ? 'success' : 'warning'"
                round
                :bordered="false"
              >
                {{ survey.status === 'published' ? '● 收集中' : '● 已暂停' }}
              </NTag>
            </div>

            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 0.82rem; color: #64748b;">
                {{ survey.status === 'published' ? '允许外部作答' : '暂停外部作答' }}
              </span>
              <NSwitch
                :value="survey.status === 'published'"
                :loading="isStatusSwitching"
                @update:value="handleStatusChange"
              />
            </div>
          </div>

          <NSpace :size="8">
            <NTag size="small" :bordered="false" type="info">
              短码: {{ survey.slug || survey.id }}
            </NTag>
            <NTag size="small" :bordered="false">
              共 {{ survey.questionsCount }} 道题
            </NTag>
            <NTag size="small" :bordered="false" type="warning">
              已收录 {{ survey.responseCount }} 份答卷
            </NTag>
          </NSpace>
        </NCard>

        <!-- 网页端分发与二维码扫码卡片 -->
        <NCard title="网页端访问与扫码通道" size="small" :bordered="true" style="border-radius: 10px;">
          <div style="display: flex; gap: 20px; align-items: flex-start; margin-bottom: 16px;">
            <!-- 二维码展示区 -->
            <div
              style="
                padding: 10px;
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                text-align: center;
                flex-shrink: 0;
              "
            >
              <img
                v-if="qrCodeDataUrl"
                :src="qrCodeDataUrl"
                alt="问卷访问二维码"
                style="width: 130px; height: 130px; display: block; border-radius: 6px;"
              />
              <div v-else style="width: 130px; height: 130px; display: flex; align-items: center; justify-content: center;">
                <NSpin size="small" />
              </div>
              <NButton
                size="tiny"
                secondary
                style="margin-top: 8px; width: 100%;"
                :disabled="!qrCodeDataUrl"
                @click="downloadQrCode"
              >
                <template #icon>
                  <Download style="width: 12px; height: 12px;" />
                </template>
                下载二维码
              </NButton>
            </div>

            <!-- 链接文本区 -->
            <div style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
              <!-- 极速短链 -->
              <div>
                <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">
                  🚀 网页端极速短链
                </label>
                <div style="display: flex; gap: 6px;">
                  <NInput
                    :value="generatedShortLink"
                    readonly
                    size="small"
                    style="font-family: 'JetBrains Mono', monospace; font-size: 0.82rem;"
                  />
                  <NButton
                    type="primary"
                    size="small"
                    :disabled="!generatedShortLink"
                    @click="copyText(generatedShortLink, 'short')"
                  >
                    <template #icon>
                      <Check v-if="copiedKey === 'short'" style="width: 13px; height: 13px;" />
                      <Copy v-else style="width: 13px; height: 13px;" />
                    </template>
                    {{ copiedKey === 'short' ? '已复制' : '复制' }}
                  </NButton>
                </div>
              </div>

              <!-- 完整访问链接 -->
              <div>
                <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 4px;">
                  🔗 网页端直连 URL
                </label>
                <div style="display: flex; gap: 6px;">
                  <NInput
                    :value="QuestionnaireRepositoryService.generateAccessUrl(survey.slug || survey.id)"
                    readonly
                    size="small"
                    style="font-family: 'JetBrains Mono', monospace; font-size: 0.82rem;"
                  />
                  <NButton
                    secondary
                    size="small"
                    @click="copyText(QuestionnaireRepositoryService.generateAccessUrl(survey.slug || survey.id), 'full')"
                  >
                    <template #icon>
                      <Check v-if="copiedKey === 'full'" style="width: 13px; height: 13px;" />
                      <Copy v-else style="width: 13px; height: 13px;" />
                    </template>
                    {{ copiedKey === 'full' ? '已复制' : '复制' }}
                  </NButton>
                </div>
              </div>

              <div style="font-size: 0.78rem; color: #94a3b8; line-height: 1.4;">
                受访者手机扫码或在浏览器直接打开链接即可全屏沉浸式作答。
              </div>
            </div>
          </div>
        </NCard>

        <!-- 题目架构列表 -->
        <NCard title="题目结构概览" size="small" :bordered="true" style="border-radius: 10px;">
          <div v-if="surveyDetail?.questions && surveyDetail.questions.length > 0">
            <NList hoverable clickable>
              <NListItem v-for="(q, idx) in surveyDetail.questions" :key="q.id">
                <NThing>
                  <template #header>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-weight: 700; color: #4f46e5; font-size: 0.9rem;">
                        Q{{ idx + 1 }}.
                      </span>
                      <span style="font-weight: 600; font-size: 0.9rem; color: #1e293b;">
                        {{ q.title }}
                      </span>
                    </div>
                  </template>
                  <template #description>
                    <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                      <NTag size="tiny" round :bordered="false" type="info">
                        {{ q.type }}
                      </NTag>
                      <NTag v-if="q.required" size="tiny" round :bordered="false" type="error">
                        必填
                      </NTag>
                      <NTag v-if="q.visible" size="tiny" round :bordered="false" type="warning">
                        条件显示
                      </NTag>
                      <NTag v-if="q.jumpLogic || q.options?.some(o => o.jumpTo)" size="tiny" round :bordered="false" type="primary">
                        跳转分支
                      </NTag>
                    </div>
                  </template>
                </NThing>
              </NListItem>
            </NList>
          </div>
          <div v-else style="color: #94a3b8; font-size: 0.85rem; padding: 12px 0;">
            共 {{ survey.questionsCount }} 道题，可体验直接作答查看流转效果。
          </div>
        </NCard>
      </div>

      <template #footer>
        <div style="display: flex; justify-content: flex-end; align-items: center; gap: 12px; width: 100%;">
          <NButton @click="emit('update:show', false)">关闭</NButton>
          <NButton
            tag="a"
            :href="`/survey.html?id=${encodeURIComponent(survey?.slug || survey?.id || '')}`"
            target="_blank"
            type="primary"
          >
            <template #icon>
              <ExternalLink style="width: 14px; height: 14px;" />
            </template>
            体验直接作答
          </NButton>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
