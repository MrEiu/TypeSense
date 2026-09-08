/**
 * single-choice/index.ts
 *
 * Single Choice Question Plugin
 *
 * Characteristics:
 * - Output answer: 0-indexed integer (number).
 * - Zero presets: All options strictly derived from `model.options`.
 * - Emits `commit` after option selection for automatic stage advance.
 */

import { defineComponent, h, type PropType } from 'vue';
import type { QuestionPlugin, QuestionPreviewContext } from '../types';
import { normalizeOptions, type QuestionItemModel } from '../../schema/questionnaire-schema-types';

const HOTKEY_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

export const singleChoicePlugin: QuestionPlugin<number> = {
  type: 'single_choice',
  label: 'Single Choice',
  description: 'Single selection mapped to 0-indexed integer index',

  component: defineComponent({
    name: 'SingleChoiceQuestion',
    props: {
      model: {
        type: Object as PropType<QuestionItemModel>,
        required: true,
      },
      value: {
        type: [Number, null] as PropType<number | null>,
        default: null,
      },
      disabled: {
        type: Boolean,
        default: false,
      },
    },
    emits: ['update:value', 'commit'],
    setup(props, { emit }) {
      return () => {
        const options = normalizeOptions(props.model.options);

        return h(
          'div',
          {
            class: 'options-stack',
            role: 'radiogroup',
            'aria-label': props.model.title,
          },
          options.map((option, index) => {
            const isSelected = props.value === index;
            const keyLetter = HOTKEY_LETTERS[index] || String(index + 1);

            return h(
              'div',
              {
                key: option.id,
                class: ['option-item-card', isSelected ? 'is-selected' : '', props.disabled ? 'is-disabled' : ''],
                role: 'radio',
                'aria-checked': isSelected ? 'true' : 'false',
                tabindex: props.disabled ? -1 : 0,
                onClick: () => {
                  if (props.disabled) return;
                  emit('update:value', index);
                  emit('commit');
                },
                onKeydown: (e: KeyboardEvent) => {
                  if (props.disabled) return;
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    emit('update:value', index);
                    emit('commit');
                  }
                },
              },
              [
                h(
                  'div',
                  { class: 'key-badge' },
                  isSelected
                    ? h(
                        'svg',
                        {
                          width: '15',
                          height: '15',
                          viewBox: '0 0 24 24',
                          fill: 'none',
                          stroke: 'currentColor',
                          'stroke-width': '3',
                        },
                        [h('polyline', { points: '20 6 9 17 4 12' })]
                      )
                    : keyLetter
                ),
                h('div', { class: 'option-label' }, option.label),
              ]
            );
          })
        );
      };
    },
  }),

  renderPreview({ model }: QuestionPreviewContext): HTMLElement {
    const container = document.createElement('div');
    container.className = 'canvas-preview-options-list';
    const options = normalizeOptions(model.options);

    options.forEach((opt, idx) => {
      const row = document.createElement('div');
      row.className = 'canvas-preview-option-row';
      const keyLetter = HOTKEY_LETTERS[idx] || String(idx + 1);
      row.textContent = `(${keyLetter}) ${opt.label}`;
      container.appendChild(row);
    });

    return container;
  },

  validateAnswer(model, value): boolean {
    if (model.required === false) return true;
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
  },

  formatValue(model, value): string {
    if (value === null || value === undefined) return '';
    const options = normalizeOptions(model.options);
    return options[value]?.label ?? String(value);
  },
};

export default singleChoicePlugin;

