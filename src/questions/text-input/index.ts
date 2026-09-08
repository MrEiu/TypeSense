/**
 * text-input/index.ts
 *
 * Text Input Question Plugin
 *
 * Characteristics:
 * - Output answer: string.
 * - Zero presets: Placeholder strictly derived from `model.placeholder` without hardcoded fallback text.
 * - Supports Ctrl/Cmd + Enter to emit `commit`.
 */

import { defineComponent, h, type PropType } from 'vue';
import { NInput } from 'naive-ui';
import type { QuestionPlugin, QuestionPreviewContext } from '../types';
import type { QuestionItemModel } from '../../schema/questionnaire-schema-types';

export const textInputPlugin: QuestionPlugin<string> = {
  type: 'text_input',
  label: 'Text Input',
  description: 'Open-ended text or numerical input field',

  component: defineComponent({
    name: 'TextInputQuestion',
    props: {
      model: {
        type: Object as PropType<QuestionItemModel>,
        required: true,
      },
      value: {
        type: String as PropType<string | null>,
        default: '',
      },
      disabled: {
        type: Boolean,
        default: false,
      },
    },
    emits: ['update:value', 'commit'],
    setup(props, { emit }) {
      return () => {
        return h(
          'div',
          { class: 'text-input-wrap' },
          [
            h(NInput, {
              type: 'textarea',
              rows: 4,
              placeholder: props.model.placeholder || '',
              value: props.value || '',
              disabled: props.disabled,
              class: 'zen-textarea',
              'onUpdate:value': (val: string) => emit('update:value', val),
              onKeydown: (e: KeyboardEvent) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  emit('commit');
                }
              },
            }),
          ]
        );
      };
    },
  }),

  renderPreview({ model }: QuestionPreviewContext): HTMLElement {
    const container = document.createElement('div');
    container.className = 'canvas-preview-text-box';
    container.textContent = model.placeholder ? `[${model.placeholder}]` : '[Text Input Field]';
    return container;
  },

  validateAnswer(model, value): boolean {
    if (model.required === false) return true;
    return typeof value === 'string' && value.trim().length > 0;
  },

  formatValue(_model, value): string {
    return value ? String(value) : '';
  },
};

export default textInputPlugin;

