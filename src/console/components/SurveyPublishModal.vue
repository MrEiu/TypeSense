<script setup lang="ts">
import { ref } from 'vue';
import {
  NModal,
  NSelect,
  NInput,
  NButton,
  useMessage,
} from 'naive-ui';
import { QuestionnaireRepositoryService } from '../../services/questionnaire-repository-service';
import type { QuestionnaireModel } from '../../schema/questionnaire-schema-types';

defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void;
  (e: 'created'): void;
}>();

const message = useMessage();
const selectedTemplateKey = ref<string>('fe_engineer');
const publishJsonText = ref('');
const isPublishing = ref(false);

const PRESET_TEMPLATES: Record<string, { label: string; schema: any }> = {
  fe_engineer: {
    label: '2026 前沿工程师体验调研 (含条件流转)',
    schema: {
      id: `survey_fe_${Date.now()}`,
      title: '2026 全球前沿工程师体验调研',
      description: '探讨现代化工具链、全栈工程化体验与团队工程文化。',
      status: 'published',
      questions: [
        {
          id: 'q1_role',
          title: '您当前在团队中主要负责的核心角色是？',
          type: 'single_choice',
          required: true,
          options: [
            { id: 'fe', label: '前端 / 体验架构师' },
            { id: 'be', label: '后端 / 平台系统研发' },
            { id: 'fullstack', label: '全栈独立开发者' },
            { id: 'lead', label: '技术负责人 / 团队管理者' },
          ],
        },
        {
          id: 'q2_fe_stack',
          title: '前端选型中，您最看重的维度是？',
          type: 'single_choice',
          required: true,
          visible: {
            target: 'q1_role',
            operator: 'in',
            value: [0, 2],
          },
          options: [
            { id: 'dx', label: '极速 DX 与无感 HMR' },
            { id: 'perf', label: '零运行时与高执行性能' },
            { id: 'ecosystem', label: '成熟完整的生态组件库' },
          ],
        },
        {
          id: 'q3_feedback',
          title: '您对目前工具链最大的痛点或期待是什么？',
          type: 'text_input',
          required: false,
          placeholder: '例如：构建配置繁琐、类型推断慢...',
        },
      ],
    },
  },
  nps_satisfaction: {
    label: 'NPS 客户净推荐值与满意度追踪',
    schema: {
      id: `survey_nps_${Date.now()}`,
      title: '产品 NPS 推荐意愿与服务满意度评估',
      description: '帮助我们持续优化产品体验与客户服务质量。',
      status: 'published',
      questions: [
        {
          id: 'q1_nps',
          title: '0 到 10 分，您有多大意愿向同行或朋友推荐我们的系统？',
          type: 'single_choice',
          required: true,
          options: [
            { id: '0_6', label: '0-6 分 (不推荐 / 批评者)' },
            { id: '7_8', label: '7-8 分 (中立态度)' },
            { id: '9_10', label: '9-10 分 (极力推荐 / 忠实粉丝)' },
          ],
        },
        {
          id: 'q2_promoter_reason',
          title: '感谢您的认可！请问最打动您的核心亮点是什么？',
          type: 'text_input',
          required: false,
          visible: {
            target: 'q1_nps',
            operator: 'eq',
            value: 2,
          },
          placeholder: '例如：流畅的响应速度、清爽的界面设计...',
        },
        {
          id: 'q3_detractor_reason',
          title: '非常抱歉未达您的预期，您觉得我们最亟待改进的地方是？',
          type: 'text_input',
          required: true,
          visible: {
            target: 'q1_nps',
            operator: 'eq',
            value: 0,
          },
          placeholder: '请告诉我们您的痛点...',
        },
      ],
    },
  },
  ai_product_eval: {
    label: 'AI 协同研发工具满意度问卷',
    schema: {
      id: `survey_ai_eval_${Date.now()}`,
      title: 'AI 协同研发与代码助手使用效能调研',
      description: '收集团队在日常开发中使用 AI 生成与辅助工具的真实体验。',
      status: 'published',
      questions: [
        {
          id: 'q1_ai_freq',
          title: '您在日常编码工作中调用 AI 助手的频次是？',
          type: 'single_choice',
          required: true,
          options: [
            { id: 'daily', label: '每日深度使用 (超过 10 次)' },
            { id: 'weekly', label: '每周几次辅助解决疑难' },
            { id: 'rare', label: '偶尔尝试' },
            { id: 'never', label: '从不使用' },
          ],
        },
        {
          id: 'q2_ai_scenarios',
          title: '您认为 AI 带来最大提效的场景是？',
          type: 'single_choice',
          required: true,
          options: [
            { id: 'code_gen', label: '样板代码与常规函数自动生成' },
            { id: 'unit_test', label: '单元测试编写' },
            { id: 'bug_fix', label: '报错诊断与排障' },
            { id: 'docs', label: '代码注释与文档生成' },
          ],
        },
      ],
    },
  },
};

function applyTemplate(key: string) {
  selectedTemplateKey.value = key;
  const tpl = PRESET_TEMPLATES[key];
  if (tpl) {
    const schema = JSON.parse(JSON.stringify(tpl.schema));
    schema.id = `survey_${key}_${Date.now()}`;
    publishJsonText.value = JSON.stringify(schema, null, 2);
  }
}

// 初始化默认模板
applyTemplate('fe_engineer');

async function handlePublishSubmit() {
  try {
    isPublishing.value = true;
    const parsed = JSON.parse(publishJsonText.value) as QuestionnaireModel;
    await QuestionnaireRepositoryService.publishSurvey(parsed);
    emit('update:show', false);
    emit('created');
    message.success('问卷发布成功，已持久化写入 SQLite');
  } catch (err) {
    message.error(`发布失败: ${(err as Error).message}`);
  } finally {
    isPublishing.value = false;
  }
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    title="发布新问卷到 SQLite 数据库"
    style="max-width: 720px; width: 92%; border-radius: 14px;"
    @update:show="(val) => emit('update:show', val)"
  >
    <!-- 模板快速选择器 -->
    <div style="margin-bottom: 14px;">
      <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 6px;">
        选择行业精品模板载入：
      </label>
      <NSelect
        :value="selectedTemplateKey"
        :options="[
          { label: '2026 前沿工程师体验调研 (含条件流转)', value: 'fe_engineer' },
          { label: 'NPS 客户净推荐值与满意度追踪', value: 'nps_satisfaction' },
          { label: 'AI 协同研发工具满意度问卷', value: 'ai_product_eval' },
        ]"
        @update:value="applyTemplate"
      />
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
      <span style="font-size: 0.85rem; font-weight: 600; color: #334155;">
        问卷 Schema JSON 配置：
      </span>
      <span style="font-size: 0.78rem; color: #94a3b8;">
        系统将自动完成拓扑校验并写入 SQLite
      </span>
    </div>

    <NInput
      v-model:value="publishJsonText"
      type="textarea"
      :rows="13"
      placeholder="粘贴问卷 JSON 结构..."
      style="font-family: 'JetBrains Mono', monospace; font-size: 0.82rem;"
    />

    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 12px;">
        <NButton @click="emit('update:show', false)">取消</NButton>
        <NButton type="primary" :loading="isPublishing" @click="handlePublishSubmit">
          即刻发布入库
        </NButton>
      </div>
    </template>
  </NModal>
</template>
