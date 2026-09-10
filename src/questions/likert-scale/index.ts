/**
 * likert-scale/index.ts
 *
 * Likert Scale Matrix Question Plugin
 *
 * Characteristics:
 * - Matrix Statements: Supports bundled evaluation rows (`model.statements`).
 * - Rating Scale: Sourced strictly from `model.options` (e.g. 5-point, 7-point, Satisfaction, Agreement).
 * - Output answer: Record<string, number> (e.g. { "0": 4, "1": 3 }) mapping statement index to 0-indexed scale index.
 * - Backwards compatible with legacy single-row numeric rating.
 * - Emits `commit` after all statements are fully rated.
 */

import { defineComponent, h, type PropType } from 'vue';
import type { QuestionPlugin, QuestionPreviewContext } from '../types';
import {
  normalizeOptions,
  normalizeStatements,
  type QuestionItemModel,
  type QuestionAnswerValue,
} from '../../schema/questionnaire-schema-types';

export const likertScalePlugin: QuestionPlugin<Record<string, number> | number> = {
  type: 'likert_scale',
  label: 'Likert Scale (李克特量表)',
  description: '多维度捆绑评分矩阵，支持自由配置评价条目与量表阶数',

  component: defineComponent({
    name: 'LikertScaleQuestion',
    props: {
      model: {
        type: Object as PropType<QuestionItemModel>,
        required: true,
      },
      value: {
        type: [Object, Number, null] as PropType<QuestionAnswerValue>,
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
        const statements = normalizeStatements(props.model.statements);

        // 如果没有定义 statements，向下兼容单行打分模式
        if (statements.length === 0) {
          const singleValue = typeof props.value === 'number' ? props.value : null;

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
                  const isSelected = singleValue === index;
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
        }

        // 标准矩阵模式：提取已作答映射
        const currentMap: Record<string, number> =
          props.value && typeof props.value === 'object' && !Array.isArray(props.value)
            ? (props.value as Record<string, number>)
            : {};

        const handleSelectScore = (stmtId: string, optionIndex: number) => {
          if (props.disabled) return;
          const nextMap = { ...currentMap, [stmtId]: optionIndex };
          emit('update:value', nextMap);

          // 当所有条目均已完成打分时，触发提交推进
          const isAllCompleted = statements.every(
            (stmt) => typeof nextMap[stmt.id] === 'number'
          );
          if (isAllCompleted) {
            emit('commit');
          }
        };

        return h(
          'div',
          {
            class: 'likert-matrix-wrap',
            role: 'group',
            'aria-label': props.model.title,
          },
          [
            // 桌面端顶栏列标签（刻度文字）
            h(
              'div',
              { class: 'likert-matrix-header-desktop' },
              [
                h('div', { class: 'header-statement-col' }, '评价维度 / 条目'),
                h(
                  'div',
                  { class: 'header-scale-cols' },
                  options.map((opt, idx) =>
                    h(
                      'div',
                      { key: opt.id, class: 'header-scale-item' },
                      [
                        h('span', { class: 'header-scale-num' }, String(idx + 1)),
                        h('span', { class: 'header-scale-label' }, opt.label),
                      ]
                    )
                  )
                ),
              ]
            ),

            // 逐行渲染各 statement 条目
            h(
              'div',
              { class: 'likert-matrix-rows' },
              statements.map((stmt, stmtIndex) => {
                const selectedScore = currentMap[stmt.id];
                const isRated = typeof selectedScore === 'number';

                return h(
                  'div',
                  {
                    key: stmt.id,
                    class: ['likert-matrix-row', isRated ? 'is-answered' : ''],
                  },
                  [
                    // 左侧条目陈述
                    h('div', { class: 'matrix-row-statement' }, [
                      h('span', { class: 'stmt-index-tag' }, `${stmtIndex + 1}`),
                      h('span', { class: 'stmt-title-text' }, stmt.label),
                    ]),

                    // 右侧评分胶囊组
                    h(
                      'div',
                      { class: 'matrix-row-scales', role: 'radiogroup' },
                      options.map((option, optIdx) => {
                        const isSelected = selectedScore === optIdx;

                        return h(
                          'button',
                          {
                            key: option.id,
                            type: 'button',
                            class: ['matrix-scale-btn', isSelected ? 'is-selected' : ''],
                            role: 'radio',
                            'aria-checked': isSelected ? 'true' : 'false',
                            'aria-label': `${stmt.label} - ${option.label || optIdx + 1}`,
                            disabled: props.disabled,
                            onClick: () => handleSelectScore(stmt.id, optIdx),
                          },
                          [
                            h('span', { class: 'scale-num' }, String(optIdx + 1)),
                            h('span', { class: 'scale-label' }, option.label),
                          ]
                        );
                      })
                    ),
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
    const statements = normalizeStatements(model.statements);
    const options = normalizeOptions(model.options);

    if (statements.length > 0) {
      const summaryTag = document.createElement('div');
      summaryTag.className = 'canvas-preview-likert-summary';
      summaryTag.textContent = `📋 ${statements.length} 个评测条目 · ${options.length} 阶量表`;
      container.appendChild(summaryTag);

      statements.slice(0, 3).forEach((st) => {
        const item = document.createElement('div');
        item.className = 'canvas-preview-likert-item';
        item.textContent = `• ${st.label}`;
        container.appendChild(item);
      });

      if (statements.length > 3) {
        const more = document.createElement('div');
        more.className = 'canvas-preview-likert-more';
        more.textContent = `+ 另有 ${statements.length - 3} 项...`;
        container.appendChild(more);
      }
    } else {
      options.forEach((opt, idx) => {
        const chip = document.createElement('span');
        chip.className = 'canvas-preview-scale-chip';
        chip.textContent = `${idx + 1}. ${opt.label}`;
        container.appendChild(chip);
      });
    }

    return container;
  },

  validateAnswer(model, value): boolean {
    if (model.required === false) return true;
    const statements = normalizeStatements(model.statements);

    if (statements.length > 0) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const map = value as Record<string, number>;
      return statements.every(
        (s) => typeof map[s.id] === 'number' && map[s.id] >= 0
      );
    }

    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
  },

  formatValue(model, value): string {
    if (value === null || value === undefined) return '';
    const options = normalizeOptions(model.options);
    const statements = normalizeStatements(model.statements);

    if (statements.length > 0 && typeof value === 'object' && !Array.isArray(value)) {
      const map = value as Record<string, number>;
      return statements
        .map((st) => {
          const scoreIdx = map[st.id];
          const label = typeof scoreIdx === 'number' ? (options[scoreIdx]?.label ?? scoreIdx + 1) : '未评';
          return `${st.label}: ${label}`;
        })
        .join(' | ');
    }

    if (typeof value === 'number') {
      return options[value]?.label ?? String(value + 1);
    }
    return '';
  },
};

export default likertScalePlugin;

