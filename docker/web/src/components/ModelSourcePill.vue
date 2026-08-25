<template>
  <span class="model-source-pill" :class="`model-source-pill--${tone}`">
    <span class="model-source-pill__dot" aria-hidden="true" />
    <span class="model-source-pill__label">{{ label }}</span>
  </span>
</template>

<script>
export default {
  name: 'ModelSourcePill',
  props: {
    source: { type: String, default: '' },
  },
  computed: {
    tone() {
      const s = String(this.source || '').toLowerCase();
      if (s === 'sd-forge') return 'forge';
      if (s === 'cache') return 'cache';
      if (s === 'placeholder') return 'placeholder';
      if (s === 'unavailable') return 'placeholder';
      return 'other';
    },
    label() {
      const s = String(this.source || '').toLowerCase();
      if (s === 'sd-forge') return 'Forge';
      if (s === 'cache') return 'Cache';
      if (s === 'placeholder') return 'Placeholder';
      if (s === 'unavailable') return 'Unavailable';
      return this.source || 'Unknown';
    },
  },
};
</script>
