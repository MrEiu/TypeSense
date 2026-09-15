<script setup lang="ts">
import { ref, watch } from 'vue';
import { NModal, NInput, NButton } from 'naive-ui';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void;
  (e: 'apply', lines: string[]): void;
}>();

const batchOptionText = ref('');

watch(
  () => props.show,
  (val) => {
    if (val) {
      batchOptionText.value = '';
    }
  }
);

function handleCancel() {
  emit('update:show', false);
}

function handleApply() {
  const lines = batchOptionText.value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  emit('apply', lines);
  emit('update:show', false);
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    title="批量导入选项"
    style="width: 500px;"
    @update:show="(val) => emit('update:show', val)"
  >
    <p style="font-size: 13px; color: #64748b; margin: 0 0 10px 0;">
      每行输入一个选项内容，提交后将直接覆盖当前题目的选项列表：
    </p>
    <NInput
      v-model:value="batchOptionText"
      type="textarea"
      :rows="8"
      placeholder="例如：&#10;选项一&#10;选项二&#10;选项三"
    />
    <template #footer>
      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <NButton size="small" @click="handleCancel">取消</NButton>
        <NButton size="small" type="primary" @click="handleApply">
          应用覆盖
        </NButton>
      </div>
    </template>
  </NModal>
</template>
