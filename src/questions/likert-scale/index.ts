/**
 * likert-scale/index.ts
 *
 * Likert Scale Question Plugin
 *
 * Characteristics:
 * - Output answer: 0-indexed integer (number).
 * - Zero presets: Scale steps and labels strictly derived from `model.options`.
 *   Never hardcodes default rating labels or step counts.
 * - Emits `commit` after rating selection for automatic stage advance.
 */

import { defineComponent, h, type PropType } from 'vue';
import type { QuestionPlugin, QuestionPreviewContext } from '../types';
import { normalizeOptions, type QuestionItemModel } from '../../schema/questionnaire-schema-types';

export const likertScalePlugin: QuestionPlugin<number> = {
  type: 'likert_scale',
  label: 'Likert Scale',
  description: 'Numeric rating scale purely defined by schema options',

  component: defineComponent({
    name: 'LikertScaleQuestion',
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
        // Zero Presets: options are 100% sourced from model.options
        const options = normalizeOptions(props.model.options);

        return h(
          'div',
          {
            class: 'likert-container',
            role: 'radiogroup',
            'aria-label': props.model.title,
          },
          [
            h(
              'div',
              { class: 'scale-row' },
              options.map((option, index) => {
                const isSelected = props.value === index;
                const displayScore = index + 1;

                return h(
                  'button',
                  {
                    key: option.id,
                    type: 'button',
                    class: ['scale-btn', isSelected ? 'is-active' : ''],
                    role: 'radio',
                    'aria-checked': isSelected ? 'true' : 'false',
                    disabled: props.disabled,
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
                    h('span', { class: 'scale-num' }, String(displayScore)),
                    option.label ? h('span', { class: 'scale-text' }, option.label) : null,
                  ]
                );
              })
            ),
          ]
        );
      };
    },
  }),

  renderPreview({ model }: QuestionPreviewContext): HTMLElement {
    const container = document.createElement('div');
    container.className = 'canvas-preview-likert-bar';
    const options = normalizeOptions(model.options);

    options.forEach((opt, idx) => {
      const chip = document.createElement('span');
      chip.className = 'canvas-preview-scale-chip';
      chip.textContent = `${idx + 1}. ${opt.label}`;
      container.appendChild(chip);
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
    return options[value]?.label ?? String(value + 1);
  },
};

export default likertScalePlugin;

