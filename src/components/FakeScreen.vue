<script setup lang="ts">
import { t } from "../i18n";

/**
 * CSS-composed Windows update screen for the backdrop (zero downloads,
 * crisp at any resolution). `mini` renders the backdrop-grid variant
 * (spinner only, no text). The real spinner orbits continuously, so a
 * constant-speed rotation is the faithful motion here.
 */
defineProps<{ mini?: boolean }>();
</script>

<template>
  <div class="fake win-update" :class="{ mini }" aria-hidden="true">
    <div class="win-spin" aria-hidden="true">
      <span v-for="i in 6" :key="i" :style="{ '--i': i }" />
    </div>
    <p v-if="!mini" class="win-title">{{ t("fake.win.title") }}</p>
    <p v-if="!mini" class="win-sub">{{ t("fake.win.sub") }}</p>
  </div>
</template>

<style scoped>
.fake {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  overflow: hidden;
  pointer-events: none;
}

.win-update {
  background: #0078d7;
  color: #fff;
}

.win-spin {
  position: relative;
  width: 48px;
  height: 48px;
  animation: fake-rot 2.2s linear infinite;
}

.win-spin span {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 6px;
  height: 6px;
  margin: -3px;
  border-radius: 50%;
  background: #fff;
  transform: rotate(calc(var(--i) * 60deg)) translateY(-19px);
  opacity: calc(1 - var(--i) * 0.13);
}

.mini .win-spin {
  width: 24px;
  height: 24px;
}

.mini .win-spin span {
  width: 4px;
  height: 4px;
  margin: -2px;
  transform: rotate(calc(var(--i) * 60deg)) translateY(-9px);
}

.win-title {
  margin: 0;
  font-size: clamp(18px, 4vw, 30px);
  font-weight: 300;
}

.win-sub {
  margin: 0;
  font-size: clamp(12px, 2vw, 15px);
  font-weight: 300;
  opacity: 0.9;
}

@keyframes fake-rot {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .win-spin {
    animation: none;
  }
}
</style>
