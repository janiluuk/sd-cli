<template>
  <svg
    class="ui-icon"
    :class="`ui-icon--${name}`"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <template v-if="name === 'play'">
      <path d="M8 6.5V17.5L17 12L8 6.5Z" fill="currentColor" />
    </template>
    <template v-else-if="name === 'pause'">
      <rect x="7" y="6" width="3.5" height="12" rx="1" fill="currentColor" />
      <rect x="13.5" y="6" width="3.5" height="12" rx="1" fill="currentColor" />
    </template>
    <template v-else-if="name === 'stop'">
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" />
    </template>
    <template v-else-if="name === 'record'">
      <circle cx="12" cy="12" r="5" fill="currentColor" />
    </template>
    <template v-else-if="name === 'image'">
      <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.8" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" />
      <path d="M6 16L10 12L13 14.8L16 11L18 13.5V17H6V16Z" fill="currentColor" opacity="0.9" />
    </template>
    <template v-else-if="name === 'broadcast'">
      <path d="M5 12C8.5 12 12 15.5 12 19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M5 7C11.2 7 17 12.8 17 19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M5 2C14 2 22 10 22 19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="5" cy="19" r="2" fill="currentColor" />
    </template>
    <template v-else-if="name === 'sliders'">
      <path d="M6 5V19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M12 5V19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M18 5V19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="6" cy="9" r="2.2" fill="currentColor" />
      <circle cx="12" cy="15" r="2.2" fill="currentColor" />
      <circle cx="18" cy="11" r="2.2" fill="currentColor" />
    </template>
    <template v-else-if="name === 'film'">
      <rect x="5" y="4.5" width="14" height="15" rx="2" stroke="currentColor" stroke-width="1.8" />
      <path d="M9 4.5V19.5" stroke="currentColor" stroke-width="1.5" />
      <path d="M15 4.5V19.5" stroke="currentColor" stroke-width="1.5" />
      <path d="M5 8H19" stroke="currentColor" stroke-width="1.5" />
      <path d="M5 16H19" stroke="currentColor" stroke-width="1.5" />
    </template>
    <template v-else-if="name === 'lightning'">
      <path d="M13 2.5L6.5 13.5H11.5L10.5 21.5L17 10.5H12L13 2.5Z" fill="currentColor" stroke="currentColor" stroke-width="0.5" stroke-linejoin="round" />
    </template>
    <template v-else-if="name === 'sparkles'">
      <path d="M12 3.5L13.7 8.3L18.5 10L13.7 11.7L12 16.5L10.3 11.7L5.5 10L10.3 8.3L12 3.5Z" fill="currentColor" />
      <path d="M18.5 3L19.2 5L21.2 5.7L19.2 6.4L18.5 8.4L17.8 6.4L15.8 5.7L17.8 5L18.5 3Z" fill="currentColor" opacity="0.75" />
      <path d="M5.2 14.6L5.8 16.2L7.4 16.8L5.8 17.4L5.2 19L4.6 17.4L3 16.8L4.6 16.2L5.2 14.6Z" fill="currentColor" opacity="0.75" />
    </template>
    <template v-else-if="name === 'wave'">
      <path d="M2.5 12C4.4 12 4.4 7 6.3 7C8.2 7 8.2 17 10.1 17C12 17 12 7 13.9 7C15.8 7 15.8 17 17.7 17C19.6 17 19.6 12 21.5 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </template>
    <template v-else-if="name === 'folder'">
      <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.2l1.6 1.8H18A2.5 2.5 0 0 1 20.5 9.3v7.2A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5v-9Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
      <path d="M3.8 9h16.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </template>
    <template v-else-if="name === 'gear'">
      <path d="M12 8.2A3.8 3.8 0 1 0 12 15.8A3.8 3.8 0 1 0 12 8.2Z" stroke="currentColor" stroke-width="1.8" />
      <path d="M12 3.8V5.4M12 18.6V20.2M5.5 6.5L6.7 7.7M17.3 18.3L18.5 19.5M3.8 12H5.4M18.6 12H20.2M5.5 17.5L6.7 16.3M17.3 5.7L18.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </template>
    <template v-else-if="name === 'chevron-up'">
      <path d="M6 14L12 8L18 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </template>
    <template v-else-if="name === 'chevron-down'">
      <path d="M6 10L12 16L18 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </template>
    <template v-else-if="name === 'panel-bottom'">
      <rect x="4" y="5" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.8" />
      <path d="M8 14H16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity="0.55" />
      <path d="M12 8.5V12.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M9.5 10.5L12 8L14.5 10.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </template>
    <template v-else-if="name === 'close'">
      <path d="M7 7L17 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M17 7L7 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </template>
    <template v-else-if="name === 'shuffle'">
      <path d="M4 7H6.5C8.5 7 9.8 7.5 11.2 9.4L12.5 11.1C13.9 13 15.2 13.5 17.2 13.5H20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M4 17H6.5C8.2 17 9.4 16.6 10.6 15.1L13.4 11.5C14.6 10 15.8 9.5 17.5 9.5H20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M17 6.5L20 9.5L17 12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M17 10.5L20 13.5L17 16.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </template>
    <template v-else-if="name === 'arrow-left'">
      <path d="M15.5 7.5L10.5 12L15.5 16.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M11 12H19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </template>
    <template v-else-if="name === 'arrow-right'">
      <path d="M8.5 7.5L13.5 12L8.5 16.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M13 12H5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </template>
    <template v-else-if="name === 'rotate-ccw'">
      <path d="M8 7H4V3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M4.5 7.5C6.1 5.1 8.8 3.5 12 3.5C17 3.5 21 7.5 21 12.5C21 17.5 17 21.5 12 21.5C7.8 21.5 4.3 18.6 3.3 14.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </template>
    <template v-else-if="name === 'size-small'">
      <rect x="4.5" y="6.5" width="15" height="11" rx="2" stroke="currentColor" stroke-width="1.8" />
      <path d="M6.5 9.2H12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity="0.85" />
      <path d="M6.5 12H10.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity="0.75" />
    </template>
    <template v-else-if="name === 'size-medium'">
      <rect x="4.5" y="5.5" width="15" height="13" rx="2" stroke="currentColor" stroke-width="1.8" />
      <path d="M6.5 9H17.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity="0.85" />
      <path d="M6.5 12.5H15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity="0.75" />
    </template>
    <template v-else-if="name === 'size-full'">
      <rect x="4.5" y="4.5" width="15" height="15" rx="2" stroke="currentColor" stroke-width="1.8" />
      <path d="M8 8H6.5V6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M16 16H17.5V17.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M16 8H17.5V6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M8 16H6.5V17.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </template>
    <template v-else-if="name === 'help'">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.8" />
      <path d="M9.8 9.3C10 8.2 10.9 7.4 12.1 7.4C13.5 7.4 14.5 8.3 14.5 9.5C14.5 10.5 13.9 11.1 13.1 11.7C12.3 12.3 11.8 12.8 11.8 13.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="12" cy="16.8" r="1" fill="currentColor" />
    </template>
    <template v-else-if="name === 'mic'">
      <rect x="9" y="3.8" width="6" height="10" rx="3" stroke="currentColor" stroke-width="1.8" />
      <path d="M6.8 11.5C6.8 14.2 9 16.4 11.8 16.4H12.2C15 16.4 17.2 14.2 17.2 11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M12 16.4V20.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M9 20.2H15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </template>
    <template v-else-if="name === 'history'">
      <path d="M12 4.2A8 8 0 1 1 4.5 9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M4.2 4.8V9.4H8.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M12 8V12.2L14.8 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </template>
    <template v-else-if="name === 'save'">
      <path d="M6 4.5H15L18.5 8V19.5A1.5 1.5 0 0 1 17 21H7A1.5 1.5 0 0 1 5.5 19.5V6A1.5 1.5 0 0 1 6 4.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
      <path d="M8 4.5V9H14V4.5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
      <rect x="8" y="13" width="8" height="5" rx="1" stroke="currentColor" stroke-width="1.8" />
    </template>
    <template v-else-if="name === 'load'">
      <path d="M12 4.5V13.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M8.5 10L12 13.5L15.5 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M5.5 16.5V18A1.5 1.5 0 0 0 7 19.5H17A1.5 1.5 0 0 0 18.5 18V16.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </template>
    <template v-else-if="name === 'pin'">
      <path d="M12 17.5V21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M8.5 3.5H15.5L14 8.5H10L8.5 3.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
      <path d="M10 8.5H14V12.5C14 14.4 13.1 15.8 12 17.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </template>
    <template v-else-if="name === 'lock'">
      <rect x="7" y="10" width="10" height="8.5" rx="2" stroke="currentColor" stroke-width="1.8" />
      <path d="M9 10V8.2C9 6.4 10.3 5 12 5C13.7 5 15 6.4 15 8.2V10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </template>
    <template v-else-if="name === 'eye'">
      <path d="M2.5 12C4.2 8.2 7.7 5.5 12 5.5C16.3 5.5 19.8 8.2 21.5 12C19.8 15.8 16.3 18.5 12 18.5C7.7 18.5 4.2 15.8 2.5 12Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
      <circle cx="12" cy="12" r="2.8" stroke="currentColor" stroke-width="1.8" />
    </template>
    <template v-else-if="name === 'eye-off'">
      <path d="M4.5 4.5L19.5 19.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M8.2 8.8C7.2 9.8 6.5 10.9 6 12C7.7 15.8 11.2 18.5 15.5 18.5C16.7 18.5 17.8 18.2 18.8 17.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M10.2 6.4C10.8 6.2 11.4 6.1 12 6.1C16.3 6.1 19.8 8.8 21.5 12.5C20.8 13.9 19.8 15.1 18.5 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </template>
  </svg>
</template>

<script>
export default {
  name: 'UiIcon',
  props: {
    name: { type: String, required: true },
  },
}
</script>

<style scoped>
.ui-icon {
  width: 1em;
  height: 1em;
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
