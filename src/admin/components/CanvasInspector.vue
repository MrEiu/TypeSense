<script setup lang="ts">
import {
  NTag,
  NSelect,
  NSwitch,
  NInput,
  NButton,
  NDropdown,
  type SelectOption,
  type DropdownOption,
} from 'naive-ui';
import {
  Plus,
  Trash2,
  GitBranch,
  Sliders,
  FileText,
} from 'lucide-vue-next';
import type {
  QuestionnaireModel,
  QuestionItemModel,
  JumpRule,
} from '../../schema/questionnaire-schema-types';

const props = defineProps<{
  currentQuestion: QuestionItemModel;
  activeQuestionIndex: number;
  questionnaire: QuestionnaireModel;
  jumpTargetOptions: SelectOption[];
  conditionalJumpRules: JumpRule[];
}>();

const emit = defineEmits<{
  (e: 'type-change', newType: string | number): void;
  (e: 'mark-dirty'): void;
  (e: 'add-statement'): void;
  (e: 'remove-statement', index: number): void;
  (e: 'update-statement', index: number, text: string): void;
  (e: 'add-option'): void;
  (e: 'remove-option', index: number): void;
  (e: 'update-option', index: number, text: string): void;
  (e: 'apply-preset', presetKey: string | number): void;
  (e: 'open-batch-modal'): void;
  (e: 'add-jump-rule'): void;
  (e: 'remove-jump-rule', rule: JumpRule): void;
  (e: 'update-rule-choice', rule: JumpRule, choice: number): void;
  (e: 'update-rule-target', rule: JumpRule, targetId: string): void;
}>();

const questionTypeOptions: SelectOption[] = [
  { label: '单选题 (Single Choice)', value: 'single_choice' },
  { label: '多选题 (Multiple Choice)', value: 'multiple_choice' },
  { label: '李克特量表 (Likert Scale)', value: 'likert_scale' },
  { label: '开放问答 (Text Input)', value: 'text_input' },
];

const likertPresetOptions: DropdownOption[] = [
  { label: '5 级满意度 (非常不满意 ~ 非常满意)', key: 'satisfaction_5' },
  { label: '5 级赞同度 (完全不同意 ~ 完全同意)', key: 'agreement_5' },
  { label: '3 级评价 (不满意 / 一般 / 满意)', key: 'eval_3' },
  { label: '5 级符合度 (完全不符合 ~ 完全符合)', key: 'match_5' },
  { label: '10 阶评分 (0 ~ 10 分)', key: 'nps_10' },
];

function getOptionLabel(opt: any): string {
  if (typeof opt === 'string') return opt;
  return opt?.label || '';
}

function getStatementLabel(stmt: any): string {
  if (typeof stmt === 'string') return stmt;
  return stmt?.label || '';
}
</script>

<template>
  <section class="inspector-workbench">
    <div class="inspector-scroll-content">
      <!-- 题目主属性顶栏卡片 -->
      <div class="inspector-meta-card">
        <div class="meta-left">
          <span class="q-seq-badge">第 {{ activeQuestionIndex + 1 }} 题</span>
          <NTag size="small" type="default" :bordered="false">{{ currentQuestion.id }}</NTag>
        </div>

        <div class="meta-right">
          <div class="meta-control-item">
            <span class="control-label">题型：</span>
            <NSelect
              :value="currentQuestion.type"
              :options="questionTypeOptions"
              size="small"
              style="width: 200px;"
              @update:value="(val) => emit('type-change', val)"
            />
          </div>
          <div class="meta-control-item">
            <NSwitch
              v-model:value="currentQuestion.required"
              size="small"
              @update:value="emit('mark-dirty')"
            />
            <span class="control-label">必填</span>
          </div>
        </div>
      </div>

      <!-- 基础题干与说明配置 -->
      <div class="inspector-section-card">
        <div class="section-card-header">
          <h4 class="section-card-title">题目标题与描述</h4>
        </div>
        <div class="form-vertical-group">
          <div class="form-field">
            <label class="field-label">题干内容</label>
            <NInput
              v-model:value="currentQuestion.title"
              size="medium"
              placeholder="请输入题目内容..."
              clearable
              @update:value="emit('mark-dirty')"
            />
          </div>
          <div class="form-field">
            <label class="field-label">补充说明 (选填)</label>
            <NInput
              v-model:value="currentQuestion.description"
              type="textarea"
              :rows="2"
              placeholder="为受访者补充说明作答背景、规则或引导语..."
              clearable
              @update:value="emit('mark-dirty')"
            />
          </div>
        </div>
      </div>

      <!-- 专属设置 1：李克特量表 (Statements + Options) -->
      <div v-if="currentQuestion.type === 'likert_scale'" class="inspector-section-card">
        <!-- 评测条目设置 (Statements) -->
        <div class="section-card-header">
          <div class="header-title-flex">
            <h4 class="section-card-title">纵向评测条目 (Statements)</h4>
            <NTag size="tiny" type="success" :bordered="false">
              共 {{ (currentQuestion.statements || []).length }} 项
            </NTag>
          </div>
          <NButton size="tiny" type="primary" secondary @click="emit('add-statement')">
            <template #icon><Plus :size="12" /></template>
            <span>添加条目</span>
          </NButton>
        </div>

        <div class="options-vertical-list">
          <div
            v-for="(stmt, stmtIdx) in currentQuestion.statements || []"
            :key="stmtIdx"
            class="option-item-row"
          >
            <span class="option-drag-index">{{ stmtIdx + 1 }}</span>
            <NInput
              :value="getStatementLabel(stmt)"
              size="small"
              placeholder="输入评测条目内容..."
              @update:value="(val) => emit('update-statement', stmtIdx, val)"
            />
            <NButton
              quaternary
              circle
              size="tiny"
              type="error"
              :disabled="(currentQuestion.statements || []).length <= 1"
              @click="emit('remove-statement', stmtIdx)"
            >
              <template #icon><Trash2 :size="13" /></template>
            </NButton>
          </div>
        </div>

        <div class="card-inner-divider"></div>

        <!-- 评分刻度设置 (Options) -->
        <div class="section-card-header">
          <div class="header-title-flex">
            <h4 class="section-card-title">横向评分刻度 (Options)</h4>
            <NTag size="tiny" type="primary" :bordered="false">
              共 {{ (currentQuestion.options || []).length }} 档
            </NTag>
          </div>
          <div style="display: flex; gap: 8px;">
            <NDropdown
              trigger="click"
              :options="likertPresetOptions"
              @select="(key) => emit('apply-preset', key)"
            >
              <NButton size="tiny" quaternary>
                <template #icon><Sliders :size="12" /></template>
                <span>预设模板</span>
              </NButton>
            </NDropdown>
            <NButton size="tiny" type="primary" secondary @click="emit('add-option')">
              <template #icon><Plus :size="12" /></template>
              <span>添加刻度</span>
            </NButton>
          </div>
        </div>

        <div class="options-vertical-list">
          <div
            v-for="(opt, optIdx) in currentQuestion.options || []"
            :key="optIdx"
            class="option-item-row"
          >
            <span class="option-drag-index">{{ optIdx }}</span>
            <NInput
              :value="getOptionLabel(opt)"
              size="small"
              placeholder="输入刻度名称..."
              @update:value="(val) => emit('update-option', optIdx, val)"
            />
            <NButton
              quaternary
              circle
              size="tiny"
              type="error"
              :disabled="(currentQuestion.options || []).length <= 1"
              @click="emit('remove-option', optIdx)"
            >
              <template #icon><Trash2 :size="13" /></template>
            </NButton>
          </div>
        </div>
      </div>

      <!-- 专属设置 2：单选题与多选题 (Options) -->
      <div
        v-else-if="currentQuestion.type === 'single_choice' || currentQuestion.type === 'multiple_choice'"
        class="inspector-section-card"
      >
        <div class="section-card-header">
          <div class="header-title-flex">
            <h4 class="section-card-title">选项设置</h4>
            <NTag size="tiny" type="primary" :bordered="false">
              共 {{ (currentQuestion.options || []).length }} 项
            </NTag>
          </div>
          <div style="display: flex; gap: 8px;">
            <NButton size="tiny" quaternary @click="emit('open-batch-modal')">
              <template #icon><FileText :size="12" /></template>
              <span>批量导入</span>
            </NButton>
            <NButton size="tiny" type="primary" secondary @click="emit('add-option')">
              <template #icon><Plus :size="12" /></template>
              <span>添加选项</span>
            </NButton>
          </div>
        </div>

        <div class="options-vertical-list">
          <div
            v-for="(opt, optIdx) in currentQuestion.options || []"
            :key="optIdx"
            class="option-item-row"
          >
            <span class="option-drag-index">{{ optIdx + 1 }}</span>
            <NInput
              :value="getOptionLabel(opt)"
              size="small"
              placeholder="输入选项内容..."
              @update:value="(val) => emit('update-option', optIdx, val)"
            />
            <NButton
              quaternary
              circle
              size="tiny"
              type="error"
              :disabled="(currentQuestion.options || []).length <= 1"
              @click="emit('remove-option', optIdx)"
            >
              <template #icon><Trash2 :size="13" /></template>
            </NButton>
          </div>
        </div>
      </div>

      <!-- 专属设置 3：问答填空题 -->
      <div v-else-if="currentQuestion.type === 'text_input'" class="inspector-section-card">
        <div class="section-card-header">
          <h4 class="section-card-title">问答专属设置</h4>
        </div>
        <div class="form-vertical-group">
          <div class="form-field">
            <label class="field-label">输入框提示占位符 (Placeholder)</label>
            <NInput
              v-model:value="currentQuestion.placeholder"
              size="medium"
              placeholder="例如：请具体描述您遇到的痛点或建议..."
              clearable
              @update:value="emit('mark-dirty')"
            />
          </div>
        </div>
      </div>

      <!-- 逻辑流转分支设置 (Jump Rules) -->
      <div
        v-if="currentQuestion.type === 'single_choice' || currentQuestion.type === 'likert_scale'"
        class="inspector-section-card"
      >
        <div class="section-card-header">
          <div class="header-title-flex">
            <h4 class="section-card-title">分支跳转流控规则</h4>
            <NTag size="tiny" type="warning" :bordered="false">
              {{ conditionalJumpRules.length }} 条条件
            </NTag>
          </div>
          <NButton size="tiny" type="warning" secondary @click="emit('add-jump-rule')">
            <template #icon><Plus :size="12" /></template>
            <span>添加流转分支</span>
          </NButton>
        </div>

        <p class="section-card-tip">
          受访者勾选特定选项时，系统自动跳转至指定目标题目或直接终止（支持甄别淘汰与完成）。
        </p>

        <!-- 规则列表 -->
        <div v-if="conditionalJumpRules.length > 0" class="jump-rules-container">
          <div
            v-for="(rule, rIdx) in conditionalJumpRules"
            :key="rIdx"
            class="jump-rule-card"
          >
            <div class="rule-clause-row">
              <span class="rule-clause-prefix">若选择</span>
              <NSelect
                :value="rule.when ? rule.when[currentQuestion.id] : 0"
                :options="(currentQuestion.options || []).map((o, idx) => ({ label: `[${idx}] ${getOptionLabel(o)}`, value: idx }))"
                size="small"
                style="width: 180px;"
                @update:value="(val) => emit('update-rule-choice', rule, Number(val))"
              />
              <span class="rule-clause-arrow">➔ 则跳转到</span>
              <NSelect
                :value="rule.to"
                :options="jumpTargetOptions"
                size="small"
                style="width: 220px;"
                @update:value="(val) => emit('update-rule-target', rule, String(val))"
              />
              <NButton
                quaternary
                circle
                size="tiny"
                type="error"
                @click="emit('remove-jump-rule', rule)"
              >
                <template #icon><Trash2 :size="13" /></template>
              </NButton>
            </div>
          </div>
        </div>

        <div v-else class="jump-rules-empty">
          <GitBranch :size="24" style="color: #cbd5e1;" />
          <span>当前题目按问卷自然顺序顺延，未配置跳转分支</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.inspector-workbench {
  flex: 1;
  background: #f8fafc;
  overflow-y: auto;
  position: relative;
}

.inspector-scroll-content {
  max-width: 860px;
  margin: 0 auto;
  padding: 24px 20px 80px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.inspector-meta-card {
  background: #ffffff;
  border-radius: 10px;
  padding: 14px 18px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
}

.meta-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.q-seq-badge {
  font-size: 15px;
  font-weight: 800;
  color: #1e293b;
}

.meta-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.meta-control-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-label {
  font-size: 13px;
  font-weight: 500;
  color: #64748b;
}

.inspector-section-card {
  background: #ffffff;
  border-radius: 10px;
  padding: 18px 20px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-title-flex {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-card-title {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}

.section-card-tip {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 4px 0;
}

.form-vertical-group {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.card-inner-divider {
  height: 1px;
  background: rgba(15, 23, 42, 0.06);
  margin: 8px 0;
}

.options-vertical-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-item-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.option-drag-index {
  font-size: 12px;
  font-weight: 700;
  color: #94a3b8;
  min-width: 20px;
  text-align: center;
}

.jump-rules-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.jump-rule-card {
  background: #f8fafc;
  border-radius: 8px;
  padding: 10px 12px;
  border: 1px dashed rgba(15, 23, 42, 0.12);
}

.rule-clause-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.rule-clause-prefix,
.rule-clause-arrow {
  font-size: 13px;
  color: #475569;
  font-weight: 500;
}

.jump-rules-empty {
  padding: 24px 16px;
  border-radius: 8px;
  border: 1px dashed rgba(15, 23, 42, 0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #94a3b8;
  font-size: 13px;
}
</style>
