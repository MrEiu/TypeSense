/**
 * src/composables/useDevice.ts
 *
 * Responsive device detection composable leveraging @vueuse/core.
 * Distinguishes between desktop and mobile/touch environments.
 */

import { computed } from 'vue';
import { useMediaQuery } from '@vueuse/core';

const MOBILE_UA_REGEX =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

export function useDevice() {
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const isMobileUa =
    typeof navigator !== 'undefined' &&
    MOBILE_UA_REGEX.test(navigator.userAgent);

  const isMobile = computed(() => isSmallScreen.value || isMobileUa);
  const isTouch = computed(
    () =>
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0)
  );

  return {
    isMobile,
    isTouch,
  };
}
