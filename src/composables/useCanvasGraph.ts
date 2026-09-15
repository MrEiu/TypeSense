/**
 * src/composables/useCanvasGraph.ts
 *
 * Centralized state management composable for the questionnaire canvas and studio editor.
 * Manages survey loading/saving, question CRUD, options, statements, jump rules, and history.
 */

import { ref, computed } from 'vue';
import type { SelectOption } from 'naive-ui';
import { QuestionnaireRepositoryService } from '../services/questionnaire-repository-service';
import type {
  QuestionnaireModel,
  QuestionItemModel,
  QuestionKind,
  JumpRule,
} from '../schema/questionnaire-schema-types';

export function useCanvasGraph() {
  // Loading & persistence state
  const isLoading = ref(true);
  const isSaving = ref(false);
  const isDirty = ref(false);
  const currentSurveyId = ref('');
  const questionnaire = ref<QuestionnaireModel | null>(null);
  const allSurveys = ref<Array<{ id: string; title: string; slug?: string }>>([]);
  const outlineSearchQuery = ref('');

  // View mode: 'editor' | 'flow' | 'split'
  const viewMode = ref<'editor' | 'flow' | 'split'>('editor');

  // Active selected question index
  const activeQuestionIndex = ref(0);

  // Undo/Redo history stack
  const historyStack = ref<string[]>([]);
  const historyIndex = ref(-1);
  const isApplyingHistory = ref(false);
  const MAX_HISTORY = 30;

  function pushHistory() {
    if (isApplyingHistory.value || !questionnaire.value) return;
    const snap = JSON.stringify(questionnaire.value);
    if (historyStack.value[historyIndex.value] === snap) return;

    // Drop forward history on new action
    historyStack.value = historyStack.value.slice(0, historyIndex.value + 1);
    historyStack.value.push(snap);
    if (historyStack.value.length > MAX_HISTORY) {
      historyStack.value.shift();
    } else {
      historyIndex.value++;
    }
  }

  function undo() {
    if (historyIndex.value <= 0) return;
    isApplyingHistory.value = true;
    historyIndex.value--;
    const prevSnap = historyStack.value[historyIndex.value];
    if (prevSnap) {
      questionnaire.value = JSON.parse(prevSnap);
      isDirty.value = true;
    }
    isApplyingHistory.value = false;
  }

  function redo() {
    if (historyIndex.value >= historyStack.value.length - 1) return;
    isApplyingHistory.value = true;
    historyIndex.value++;
    const nextSnap = historyStack.value[historyIndex.value];
    if (nextSnap) {
      questionnaire.value = JSON.parse(nextSnap);
      isDirty.value = true;
    }
    isApplyingHistory.value = false;
  }

  const canUndo = computed(() => historyIndex.value > 0);
  const canRedo = computed(() => historyIndex.value < historyStack.value.length - 1);

  function markDirty() {
    isDirty.value = true;
    pushHistory();
  }

  // Active question reference
  const currentQuestion = computed<QuestionItemModel | undefined>(() => {
    return questionnaire.value?.questions[activeQuestionIndex.value];
  });

  // Shareable respondent link
  const respondentUrl = computed(() => {
    if (!questionnaire.value) return '#';
    const targetId = questionnaire.value.slug || questionnaire.value.id || currentSurveyId.value;
    return `/survey.html?id=${encodeURIComponent(targetId)}`;
  });

  // Survey select options
  const surveySelectOptions = computed<SelectOption[]>(() => {
    return allSurveys.value.map((s) => ({
      label: s.title,
      value: s.id,
    }));
  });

  // Filtered outline questions
  const filteredQuestions = computed(() => {
    if (!questionnaire.value) return [];
    if (!outlineSearchQuery.value.trim()) {
      return questionnaire.value.questions.map((q, idx) => ({ q, idx }));
    }
    const query = outlineSearchQuery.value.toLowerCase().trim();
    return questionnaire.value.questions
      .map((q, idx) => ({ q, idx }))
      .filter(
        ({ q, idx }) =>
          `q${idx + 1}`.includes(query) ||
          q.title.toLowerCase().includes(query) ||
          (q.description && q.description.toLowerCase().includes(query))
      );
  });

  // Jump target select options
  const jumpTargetOptions = computed<SelectOption[]>(() => {
    if (!questionnaire.value) return [];
    const list: SelectOption[] = questionnaire.value.questions.map((q, idx) => ({
      label: `Q${idx + 1}: ${q.title.slice(0, 24)}${q.title.length > 24 ? '...' : ''}`,
      value: q.id,
    }));
    list.push({ label: '🏁 正常结束作答 (End)', value: 'end' });
    list.push({ label: '🚫 甄别淘汰终止 (Exit)', value: 'exit' });
    return list;
  });

  // Load survey by ID
  async function loadSurvey(id: string) {
    if (!id) return;
    isLoading.value = true;
    currentSurveyId.value = id;
    try {
      const fetched = await QuestionnaireRepositoryService.getSurvey(id);
      questionnaire.value = JSON.parse(JSON.stringify(fetched));
      activeQuestionIndex.value = 0;
      isDirty.value = false;

      // Reset history
      historyStack.value = [JSON.stringify(questionnaire.value)];
      historyIndex.value = 0;
    } catch (err) {
      console.error(`[Studio] Failed to load survey ${id}:`, err);
      questionnaire.value = null;
    } finally {
      isLoading.value = false;
    }
  }

  // Save survey changes to backend
  async function saveSurvey(notifyMsg?: any) {
    if (!questionnaire.value || isSaving.value) return;
    isSaving.value = true;
    try {
      const targetId = questionnaire.value.slug || questionnaire.value.id || currentSurveyId.value;
      const success = await QuestionnaireRepositoryService.updateSurvey(
        targetId,
        questionnaire.value
      );
      if (success) {
        isDirty.value = false;
        if (notifyMsg) notifyMsg.success('问卷已成功保存至数据库');
      } else {
        if (notifyMsg) notifyMsg.error('保存问卷失败，请检查后端状态');
      }
    } catch (err) {
      console.error('[Studio] Failed to save survey:', err);
      if (notifyMsg) notifyMsg.error('保存问卷网络异常');
    } finally {
      isSaving.value = false;
    }
  }

  // Question navigation and selection
  function selectQuestion(index: number) {
    if (questionnaire.value && index >= 0 && index < questionnaire.value.questions.length) {
      activeQuestionIndex.value = index;
    }
  }

  function selectQuestionById(nodeId: string) {
    if (!questionnaire.value) return;
    const idx = questionnaire.value.questions.findIndex((q) => q.id === nodeId);
    if (idx >= 0) {
      activeQuestionIndex.value = idx;
      if (viewMode.value === 'flow') {
        viewMode.value = 'split';
      }
    }
  }

  // Question operations
  function addQuestion(type: QuestionKind = 'single_choice') {
    if (!questionnaire.value) return;
    const count = questionnaire.value.questions.length + 1;
    const newId = `q${count}`;

    let defaultOptions: string[] | undefined = undefined;
    let defaultStatements: string[] | undefined = undefined;

    if (type === 'single_choice' || type === 'multiple_choice') {
      defaultOptions = ['选项 1', '选项 2', '选项 3'];
    } else if (type === 'likert_scale') {
      defaultStatements = [
        '功能操作直观，易于上手',
        '界面排版美观，视觉舒适',
        '整体产品体验符合我的预期',
      ];
      defaultOptions = ['非常不满意', '不满意', '一般', '满意', '非常满意'];
    }

    const newQ: QuestionItemModel = {
      id: newId,
      type,
      title: type === 'likert_scale' ? `请对以下各项维度进行评价 ${count}` : `新题目 ${count}`,
      required: true,
      options: defaultOptions,
      statements: defaultStatements,
    };

    questionnaire.value.questions.push(newQ);
    activeQuestionIndex.value = questionnaire.value.questions.length - 1;
    markDirty();
  }

  function deleteQuestion(index: number) {
    if (!questionnaire.value) return;
    if (questionnaire.value.questions.length <= 1) return;
    questionnaire.value.questions.splice(index, 1);
    if (activeQuestionIndex.value >= questionnaire.value.questions.length) {
      activeQuestionIndex.value = questionnaire.value.questions.length - 1;
    }
    markDirty();
  }

  function duplicateQuestion(index: number) {
    if (!questionnaire.value) return;
    const src = questionnaire.value.questions[index];
    const count = questionnaire.value.questions.length + 1;
    const clone: QuestionItemModel = {
      ...JSON.parse(JSON.stringify(src)),
      id: `q${count}`,
      title: `${src.title} (副本)`,
    };
    questionnaire.value.questions.splice(index + 1, 0, clone);
    activeQuestionIndex.value = index + 1;
    markDirty();
  }

  function moveQuestion(index: number, direction: 'up' | 'down') {
    if (!questionnaire.value) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= questionnaire.value.questions.length) return;
    const temp = questionnaire.value.questions[index];
    questionnaire.value.questions[index] = questionnaire.value.questions[target];
    questionnaire.value.questions[target] = temp;
    activeQuestionIndex.value = target;
    markDirty();
  }

  function handleQuestionTypeChange(newType: string | number) {
    if (!currentQuestion.value) return;
    const targetType = String(newType) as QuestionKind;
    currentQuestion.value.type = targetType;

    if (targetType === 'text_input') {
      if (!currentQuestion.value.placeholder) {
        currentQuestion.value.placeholder = '请输入您的回答内容...';
      }
    } else if (targetType === 'likert_scale') {
      if (!currentQuestion.value.statements || currentQuestion.value.statements.length === 0) {
        currentQuestion.value.statements = ['整体表现与综合体验', '服务响应与处理效率', '交付质量与期望符合度'];
      }
      if (!currentQuestion.value.options || currentQuestion.value.options.length < 2) {
        currentQuestion.value.options = ['非常不满意', '不满意', '一般', '满意', '非常满意'];
      }
    } else if (targetType === 'single_choice' || targetType === 'multiple_choice') {
      if (!currentQuestion.value.options || currentQuestion.value.options.length === 0) {
        currentQuestion.value.options = ['选项 1', '选项 2', '选项 3'];
      }
    }
    markDirty();
  }

  // Statements operations (for Likert scale)
  function addStatement() {
    if (!currentQuestion.value) return;
    if (!Array.isArray(currentQuestion.value.statements)) {
      currentQuestion.value.statements = [];
    }
    const nextIdx = currentQuestion.value.statements.length + 1;
    currentQuestion.value.statements.push(`评测条目 ${nextIdx}`);
    markDirty();
  }

  function removeStatement(stmtIndex: number) {
    if (!currentQuestion.value || !Array.isArray(currentQuestion.value.statements)) return;
    if (currentQuestion.value.statements.length <= 1) return;
    currentQuestion.value.statements.splice(stmtIndex, 1);
    markDirty();
  }

  function updateStatementText(stmtIndex: number, text: string) {
    if (!currentQuestion.value || !Array.isArray(currentQuestion.value.statements)) return;
    const target = currentQuestion.value.statements[stmtIndex];
    if (typeof target === 'object' && target !== null) {
      (target as any).label = text;
    } else {
      currentQuestion.value.statements[stmtIndex] = text;
    }
    markDirty();
  }

  // Options operations
  function addOption() {
    if (!currentQuestion.value) return;
    if (!Array.isArray(currentQuestion.value.options)) {
      currentQuestion.value.options = [];
    }
    const nextIdx = currentQuestion.value.options.length + 1;
    currentQuestion.value.options.push(
      currentQuestion.value.type === 'likert_scale' ? `第 ${nextIdx} 级` : `选项 ${nextIdx}`
    );
    markDirty();
  }

  function removeOption(optIndex: number) {
    if (!currentQuestion.value || !Array.isArray(currentQuestion.value.options)) return;
    if (currentQuestion.value.options.length <= 1) return;
    currentQuestion.value.options.splice(optIndex, 1);
    markDirty();
  }

  function updateOptionText(optIndex: number, text: string) {
    if (!currentQuestion.value || !Array.isArray(currentQuestion.value.options)) return;
    const target = currentQuestion.value.options[optIndex];
    if (typeof target === 'object' && target !== null) {
      (target as any).label = text;
    } else {
      currentQuestion.value.options[optIndex] = text;
    }
    markDirty();
  }

  function applyLikertPreset(presetKey: string | number) {
    if (!currentQuestion.value) return;
    switch (presetKey) {
      case 'satisfaction_5':
        currentQuestion.value.options = ['非常不满意', '不满意', '一般', '满意', '非常满意'];
        break;
      case 'agreement_5':
        currentQuestion.value.options = ['完全不同意', '不同意', '一般', '同意', '完全同意'];
        break;
      case 'eval_3':
        currentQuestion.value.options = ['差', '一般', '满意'];
        break;
      case 'match_5':
        currentQuestion.value.options = ['完全不符合', '不太符合', '一般', '比较符合', '完全符合'];
        break;
      case 'nps_10':
        currentQuestion.value.options = ['0分', '1分', '2分', '3分', '4分', '5分', '6分', '7分', '8分', '9分', '10分'];
        break;
    }
    markDirty();
  }

  function applyBatchOptions(lines: string[]) {
    if (!currentQuestion.value) return;
    if (lines.length > 0) {
      currentQuestion.value.options = lines;
      markDirty();
    }
  }

  // Jump logic rules
  function getConditionalJumpRules(): JumpRule[] {
    if (!currentQuestion.value || !currentQuestion.value.jump) return [];
    if (typeof currentQuestion.value.jump === 'string') return [];
    if (Array.isArray(currentQuestion.value.jump)) {
      return currentQuestion.value.jump.filter((r) => r.when && Object.keys(r.when).length > 0);
    }
    return [];
  }

  function addJumpRule() {
    if (!questionnaire.value || !currentQuestion.value) return;
    if (!currentQuestion.value.jump || typeof currentQuestion.value.jump === 'string') {
      currentQuestion.value.jump = [];
    }
    const qId = currentQuestion.value.id;
    const defaultTarget =
      questionnaire.value.questions[activeQuestionIndex.value + 1]?.id || 'end';

    (currentQuestion.value.jump as JumpRule[]).push({
      when: { [qId]: 0 },
      to: defaultTarget,
    });
    markDirty();
  }

  function removeJumpRule(rule: JumpRule) {
    if (!currentQuestion.value || !Array.isArray(currentQuestion.value.jump)) return;
    const idx = currentQuestion.value.jump.indexOf(rule);
    if (idx > -1) {
      currentQuestion.value.jump.splice(idx, 1);
    }
    if (currentQuestion.value.jump.length === 0) {
      delete currentQuestion.value.jump;
    }
    markDirty();
  }

  function updateRuleOptionChoice(rule: JumpRule, optionIndex: number) {
    if (!currentQuestion.value) return;
    const qId = currentQuestion.value.id;
    rule.when = { [qId]: optionIndex };
    markDirty();
  }

  function updateRuleTarget(rule: JumpRule, targetId: string) {
    rule.to = targetId;
    markDirty();
  }

  function updateTitle(newTitle: string) {
    if (questionnaire.value && newTitle.trim()) {
      questionnaire.value.title = newTitle.trim();
      markDirty();
    }
  }

  return {
    // State
    isLoading,
    isSaving,
    isDirty,
    currentSurveyId,
    questionnaire,
    allSurveys,
    outlineSearchQuery,
    viewMode,
    activeQuestionIndex,
    currentQuestion,
    respondentUrl,
    surveySelectOptions,
    filteredQuestions,
    jumpTargetOptions,
    canUndo,
    canRedo,

    // Actions
    markDirty,
    undo,
    redo,
    loadSurvey,
    saveSurvey,
    selectQuestion,
    selectQuestionById,
    addQuestion,
    deleteQuestion,
    duplicateQuestion,
    moveQuestion,
    handleQuestionTypeChange,
    addStatement,
    removeStatement,
    updateStatementText,
    addOption,
    removeOption,
    updateOptionText,
    applyLikertPreset,
    applyBatchOptions,
    getConditionalJumpRules,
    addJumpRule,
    removeJumpRule,
    updateRuleOptionChoice,
    updateRuleTarget,
    updateTitle,
  };
}
