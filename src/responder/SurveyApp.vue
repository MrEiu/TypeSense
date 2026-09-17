<script setup lang="ts">
/**
 * src/responder/SurveyApp.vue
 *
 * Questionnaire Respondent Application root entry.
 * Dispatches dynamically to SurveyDesktopView or SurveyMobileView based on device environment,
 * while managing singleton flow engine state and global modals.
 */

import {
  NConfigProvider,
  NMessageProvider,
  type GlobalThemeOverrides,
} from 'naive-ui';

import { useDevice } from '../composables/useDevice';
import { useSurveyFlow } from '../composables/useSurveyFlow';
import type { QuestionAnswerMap } from '../schema/questionnaire-schema-types';

import SurveyDesktopView from './views/SurveyDesktopView.vue';
import SurveyMobileView from './views/SurveyMobileView.vue';
import AuthModal from '../components/auth/AuthModal.vue';
import AiSurveyChatFillerModal from './components/AiSurveyChatFillerModal.vue';

// Naive UI Zen Paper theme tokens
const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#4f46e5',
    primaryColorHover: '#4338ca',
    primaryColorPressed: '#3730a3',
    primaryColorSuppl: '#4f46e5',
    borderRadius: '10px',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  Button: {
    fontWeight: '600',
    borderRadiusMedium: '10px',
  },
};

// Device detection and flow engine state
const { isMobile } = useDevice();
const flow = useSurveyFlow();
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides">
    <NMessageProvider>
      <!-- Dynamic dual-view dispatch: Mobile / Android vs Desktop -->
      <SurveyMobileView v-if="isMobile" :flow="flow" />
      <SurveyDesktopView v-else :flow="flow" />

      <!-- Respondent Authentication Modal -->
      <AuthModal
        v-model:show="flow.showAuthModal"
        mode="user"
        :closable="true"
        @success="flow.onAuthSuccess"
      />

      <!-- AI Chat Quick-Filler Modal -->
      <AiSurveyChatFillerModal
        v-if="flow.survey"
        v-model:show="flow.showAiChatFiller"
        :survey="flow.survey"
        :initial-answers="(flow.answersMap as QuestionAnswerMap)"
        @sync-answers="flow.handleSyncAiAnswers"
        @finish="flow.handleAiFinish"
      />
    </NMessageProvider>
  </NConfigProvider>
</template>
