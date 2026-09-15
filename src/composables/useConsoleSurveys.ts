/**
 * src/composables/useConsoleSurveys.ts
 *
 * Centralized state management composable for the admin console.
 * Handles survey list fetching, search, filtering, sorting, pagination, and deletion.
 */

import { ref, computed, watch } from 'vue';
import {
  QuestionnaireRepositoryService,
  type SurveyMetadataItem,
} from '../services/questionnaire-repository-service';

export function useConsoleSurveys() {
  const surveys = ref<SurveyMetadataItem[]>([]);
  const loading = ref(true);

  // Search & Filter State
  const searchQuery = ref('');
  const currentFilterTab = ref('all');
  const sortBy = ref<'newest' | 'responses' | 'questions'>('newest');
  const viewMode = ref<'grid' | 'table'>('grid');

  // Pagination State
  const currentPage = ref(1);
  const pageSize = ref(12);

  // Filtered & sorted surveys
  const filteredSurveys = computed(() => {
    let list = [...surveys.value];

    // 1. Keyword search
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          (s.description && s.description.toLowerCase().includes(q)) ||
          (s.slug && s.slug.toLowerCase().includes(q))
      );
    }

    // 2. Tab filter
    if (currentFilterTab.value === 'collecting') {
      list = list.filter((s) => s.status !== 'paused');
    } else if (currentFilterTab.value === 'paused') {
      list = list.filter((s) => s.status === 'paused');
    } else if (currentFilterTab.value === 'has_responses') {
      list = list.filter((s) => (s.responseCount || 0) > 0);
    } else if (currentFilterTab.value === 'logic') {
      list = list.filter((s) => s.questionsCount >= 3);
    }

    // 3. Sorting
    if (sortBy.value === 'responses') {
      list.sort((a, b) => (b.responseCount || 0) - (a.responseCount || 0));
    } else if (sortBy.value === 'questions') {
      list.sort((a, b) => (b.questionsCount || 0) - (a.questionsCount || 0));
    } else {
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    return list;
  });

  // Paginated surveys
  const paginatedSurveys = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    return filteredSurveys.value.slice(start, start + pageSize.value);
  });

  // Reset page index on filter condition change
  watch([searchQuery, currentFilterTab, sortBy, viewMode], () => {
    currentPage.value = 1;
  });

  // Fetch all surveys from SQLite repository
  async function loadSurveys() {
    loading.value = true;
    try {
      surveys.value = await QuestionnaireRepositoryService.listSurveys();
    } catch (err) {
      console.error('[ConsoleSurveys] Failed to load surveys:', err);
    } finally {
      loading.value = false;
    }
  }

  // Toggle survey collection status
  async function toggleSurveyStatus(survey: SurveyMetadataItem, active: boolean) {
    const newStatus: 'published' | 'paused' = active ? 'published' : 'paused';
    const prevStatus = survey.status;
    survey.status = newStatus;
    try {
      const targetId = survey.slug || survey.id;
      const success = await QuestionnaireRepositoryService.updateSurveyStatus(targetId, newStatus);
      if (!success) {
        survey.status = prevStatus;
        alert('更新问卷收集状态失败');
      }
    } catch (err) {
      survey.status = prevStatus;
      console.error('[ConsoleSurveys] Toggle status failed:', err);
    }
  }

  // Delete survey from repository
  async function deleteSurvey(survey: SurveyMetadataItem) {
    const targetId = survey.slug || survey.id;
    try {
      const success = await QuestionnaireRepositoryService.deleteSurvey(targetId);
      if (success) {
        surveys.value = surveys.value.filter((s) => s.id !== survey.id);
        return true;
      }
    } catch (err) {
      console.error('[ConsoleSurveys] Delete survey failed:', err);
    }
    return false;
  }

  return {
    surveys,
    loading,
    searchQuery,
    currentFilterTab,
    sortBy,
    viewMode,
    currentPage,
    pageSize,
    filteredSurveys,
    paginatedSurveys,
    loadSurveys,
    toggleSurveyStatus,
    deleteSurvey,
  };
}
