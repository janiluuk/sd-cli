<template>
  <div id="app">
    <div v-if="restoreSessionPromptOpen" class="restore-session-modal" @click="onRestoreSessionBackdropClick">
      <div class="restore-session-modal__dialog framesync-panel">
        <div class="framesync-header">
          <div class="framesync-title">Restore <span class="framesync-accent">last UI state</span>?</div>
        </div>
        <div class="framesync-subtitle" style="margin-top:8px;">
          Found a saved session state that doesn’t match the current UI defaults.
        </div>
        <div class="framesync-footer" style="margin-top:12px; gap:10px; justify-content:flex-end;">
          <button type="button" class="framesync-button" @click="dismissSessionRestore(false)">Discard</button>
          <button type="button" class="framesync-button framesync-button--live" @click="dismissSessionRestore(true)">Restore</button>
        </div>
      </div>
    </div>
    <div v-if="extendProjectPromptOpen" class="restore-session-modal" @click="dismissExtendProjectPrompt(false)">
      <div class="restore-session-modal__dialog framesync-panel" @click.stop>
        <div class="framesync-header">
          <div class="framesync-title">Extend <span class="framesync-accent">project length</span>?</div>
        </div>
        <div class="framesync-subtitle" style="margin-top:8px;">
          <strong>{{ extendProjectPrompt.videoLabel }}</strong> is
          {{ extendProjectPrompt.videoDurationSec }}s, but the motion sequence / project is
          {{ extendProjectPrompt.projectDurationSec }}s.
        </div>
        <div class="framesync-subtitle" style="margin-top:6px;">
          Extend the timeline and frame count to fit the full video, or keep the current project length.
        </div>
        <div class="framesync-footer" style="margin-top:12px; gap:10px; justify-content:flex-end;">
          <button type="button" class="framesync-button" @click="dismissExtendProjectPrompt(false)">Keep current length</button>
          <button type="button" class="framesync-button framesync-button--live" @click="dismissExtendProjectPrompt(true)">Extend project</button>
        </div>
      </div>
    </div>
    <div class="app-chrome">
      <nav class="top-nav" aria-label="Main navigation" data-testid="top-nav" role="tablist">
        <div class="top-nav__inner">
          <button
            class="tab"
            v-for="(tab, tabIndex) in tabs"
            :key="tab.id"
            role="tab"
            type="button"
            :class="[ `tab--${tab.id.toLowerCase()}`, { active: currentTab === tab.id } ]"
            :aria-selected="currentTab === tab.id ? 'true' : 'false'"
            :tabindex="currentTab === tab.id ? 0 : -1"
            :title="`${tab.label} (${tabIndex + 1}) · ← → switch tabs`"
            :data-testid="'top-nav-tab-' + tab.id.toLowerCase()"
            @click="switchTab(tab.id)"
          >
            <span class="tab__icon-wrap" aria-hidden="true">
              <UiIcon class="tab__icon" :name="tab.icon" />
            </span>
            <span class="tab__copy">
              <span class="tab__label">{{ tab.label }}</span>
            </span>
          </button>
        </div>
        <div class="top-nav__actions">
          <button
            type="button"
            class="top-nav__icon-btn"
            :class="{ 'top-nav__icon-btn--active': libraryWorkspaceOpen }"
            :aria-expanded="libraryWorkspaceOpen ? 'true' : 'false'"
            title="Library — browse videos and open the editor"
            data-testid="top-nav-library"
            @click="toggleLibraryWorkspace()"
          >
            <UiIcon name="folder" />
            <span class="top-nav__action-label">Library</span>
          </button>
        </div>
      </nav>

      <header class="app-header">
        <StatusStrip
          :playing="deforumPlaying"
          :recording="isRecording"
          :preview-generating="previewGenerating"
          :preview-progress-pct="previewProgressPct"
          :frame-processing-active="showFrameProcessingInChrome"
          :frame-processing-label="frameProcessingLabel"
          :frame-processing-hint="frameProcessingHint"
          :preview-disabled="deforumPlaying"
          :hls-watch-enabled="hlsWatchEnabled"
          :hls-preview-valid="hlsPreviewStreamValid"
          :api-health="apiHealth"
          :gpu-active-count="gpuActiveCount"
          :gpu-total-count="gpuTotalCount"
          :midi-supported="midi.supported"
          :midi-selected="midi.selected"
          :ws-status="wsStatus"
          :session="session"
          :sessions="sessionCatalog"
          :morph-on="prompts.morphOn"
          @toggle-play="toggleDeforumPlay"
          @stop-play="stopDeforumPlay"
          @toggle-record="toggleStreamRecord"
          @start-hls-watch="enableHlsWatch"
          @stop-hls-watch="disableHlsWatch"
          @generate-preview="generatePreviewFrame"
          @open-gpus="openGpuSettings"
          @toggle-ws="toggleCollaboration"
          @open-midi="openMidiSettings"
          @select-session="selectSession"
          @new-session="createNewSession"
          @purge-session="purgeSession"
          @restore-session="restoreSession"
          @reset-layout="resetUiLayoutDefaults"
        />
      </header>
    </div>

    <LibraryWorkspaceOverlay :app="appViewModel" />

    <div
      v-if="libraryWorkspaceOpen && !(libraryEditorOpen && currentTab === 'LIBRARY')"
      class="live-drawer-shell live-drawer-shell--dock-top"
      :class="{ 'live-drawer-shell--open': rightPanelOpen }"
      data-testid="right-panel-drawer"
    >
      <button
        type="button"
        class="live-overlay-btn live-overlay-btn--top"
        :class="{ 'live-overlay-btn--open': rightPanelOpen }"
        :title="rightPanelToggleTitle"
        :aria-expanded="rightPanelOpen ? 'true' : 'false'"
        data-testid="right-panel-toggle"
        @click="toggleRightPanel"
      >
        <span class="live-overlay-btn__arrow-wrap">
          <UiIcon class="live-overlay-btn__state" :name="rightPanelToggleIcon" />
        </span>
        <span class="live-overlay-btn__top-label">{{ rightPanelOpen ? 'Hide panel' : 'Show panel' }}</span>
      </button>
      <div v-show="rightPanelOpen" class="live-right-column" :class="{ 'stage-rack-overlay': currentTab === 'MOTION' }">
        <LiveView v-if="currentTab === 'LIVE'" :app="appViewModel" />
        <PromptsView v-else-if="currentTab === 'PROMPTS'" :app="appViewModel" />
        <MotionView v-else-if="currentTab === 'MOTION'" :app="appViewModel" />
        <ModulationView v-else-if="currentTab === 'MODULATION'" :app="appViewModel" />
        <SettingsView v-else-if="currentTab === 'SETTINGS'" :app="appViewModel" />
      </div>
    </div>

    <div class="layout layout--sidebar" :class="{
      'layout--live': currentTab === 'LIVE',
      'layout--stage': currentTab === 'MOTION' || currentTab === 'GENERATE',
      'layout--studio': currentTab === 'MODULATION' || currentTab === 'AUDIO',
      'layout--library-workspace': libraryWorkspaceOpen,
      'layout--stage-full': videoStageSize === 'full',
      'layout--edge-layers-open': layersSidebarOpen,
      'layout--edge-engine-open': showEngineDrawerShell && liveEngineDrawerOpen,
      'layout--edge-context-open': !libraryWorkspaceOpen && rightPanelOpen,
      'layout--edge-context-left': !libraryWorkspaceOpen && rightPanelOpen,
      'layout--edge-overlay': edgeDockOverlayMode,
    }">
      <!-- Left: video + mini timeline -->
      <div class="preview" :class="{
        'preview--stage-full': videoStageSize === 'full',
        'preview--motion-dock': currentTab === 'MOTION',
      }">
        <div
          class="preview-stage-row"
          data-testid="preview-stage-row"
        >
          <div class="preview-stage-main">
        <div
          v-if="!(libraryEditorOpen && currentTab === 'LIBRARY')"
          class="top-drawer-shell"
          :class="{ 'top-drawer-shell--open': liveBottomDrawerOpen }"
          data-testid="bottom-drawer"
        >
        <button
          type="button"
          class="top-drawer-fab top-drawer-fab--stage"
          :class="{ 'top-drawer-fab--active': liveBottomDrawerOpen }"
          :aria-expanded="liveBottomDrawerOpen ? 'true' : 'false'"
          aria-label="Toggle bottom drawer"
          title="Toggle bottom drawer"
          data-testid="bottom-drawer-toggle"
          @click="toggleLiveBottomDrawer()"
        >
          <span class="top-drawer-fab__icon-wrap" aria-hidden="true">
            <UiIcon class="top-drawer-fab__icon" name="panel-bottom" />
          </span>
        </button>
        <div class="live-top-drawer__tabs">
          <button
            type="button"
            class="sub-pill"
            :class="{ active: liveBottomDrawerTab === 'MODULATION' }"
            @click="setLiveBottomDrawerTab('MODULATION')"
          >
            MODULATION
          </button>
          <button
            type="button"
            class="sub-pill"
            :class="{ active: liveBottomDrawerTab === 'CROSSFADER' }"
            @click="setLiveBottomDrawerTab('CROSSFADER')"
          >
            CROSSFADER
          </button>
          <button
            type="button"
            class="sub-pill"
            :class="{ active: liveBottomDrawerTab === 'SYSTEM' }"
            @click="setLiveBottomDrawerTab('SYSTEM')"
          >
            SYSTEM
          </button>
        </div>
          <div
            class="top-drawer-panel"
            :class="{
              'top-drawer-panel--open': liveBottomDrawerOpen,
              'top-drawer-panel--system': liveBottomDrawerOpen && liveBottomDrawerTab === 'SYSTEM',
              'top-drawer-panel--crossfader': liveBottomDrawerOpen && liveBottomDrawerTab === 'CROSSFADER',
            }"
          >
        <div v-if="liveBottomDrawerTab === 'MODULATION'" class="live-mod-grid">
            <div v-for="(slot, idx) in liveModulationSlots" :key="'live-mod-slot-' + idx" class="live-mod-slot">
              <div class="live-mod-slot__head">
                <span class="framesync-subtitle" style="margin:0;">{{ slot.label }}</span>
                <span v-if="slot.mappingLabel" class="live-mod-slot__map">
                  <UiIcon name="arrow-left" />
                  <span>{{ slot.mappingLabel }}</span>
                </span>
                <div class="live-mod-slot__actions">
                  <button
                    v-if="slot.paramKey"
                    type="button"
                    class="framesync-button framesync-button--compact"
                    title="Remove mapping"
                    @click="clearParamMapping(slot.paramKey)"
                  >
                    <UiIcon name="close" />
                  </button>
                  <button
                    v-if="slot.paramKey"
                    type="button"
                    class="framesync-button framesync-button--compact"
                    title="Add mapping"
                    @click="openModulationMapping(slot.paramKey)"
                  >
                    <UiIcon name="sliders" />
                  </button>
                </div>
              </div>

              <div v-if="slot.kind === 'slider'" class="live-mod-slot__body">
                <div class="live-mod-slider" :style="{ '--shade': `${slot.shade}` }">
                  <input
                    type="range"
                    class="framesync-input live-mod-slider__input"
                    :min="slot.min"
                    :max="slot.max"
                    :step="slot.step"
                    :value="slot.value"
                    @input="slot.paramKey && setLiveModValue(slot.paramKey, $event.target.value)"
                  />
                  <div class="live-mod-slider__readout">{{ slot.valueLabel }}</div>
                </div>
              </div>

              <div v-else-if="slot.kind === 'xypad'" class="live-mod-slot__body">
                <div
                  class="live-mod-pad"
                  @mousedown="livePadDown($event, slot)"
                  @mousemove="livePadMove($event, slot)"
                  @mouseup="livePadUp"
                  @mouseleave="livePadUp"
                  @touchstart.prevent="livePadDown($event, slot)"
                  @touchmove.prevent="livePadMove($event, slot)"
                  @touchend.prevent="livePadUp"
                >
                  <div class="live-mod-pad__crosshair live-mod-pad__crosshair--x"></div>
                  <div class="live-mod-pad__crosshair live-mod-pad__crosshair--y"></div>
                  <div class="live-mod-pad__puck" :style="slot.puckStyle"></div>
                </div>
                <div class="live-mod-pad__axes">
                  <span class="framesync-subtitle" style="margin:0;">X {{ slot.xLabel }}</span>
                  <span class="framesync-subtitle" style="margin:0;">Y {{ slot.yLabel }}</span>
                </div>
              </div>

              <div v-else class="live-mod-slot__body">
                <div class="live-mod-knob">
                  <input
                    type="range"
                    class="framesync-input live-mod-knob__input"
                    :min="slot.min"
                    :max="slot.max"
                    :step="slot.step"
                    :value="slot.value"
                    @input="slot.paramKey && setLiveModValue(slot.paramKey, $event.target.value)"
                  />
                  <div class="live-mod-knob__readout">{{ slot.valueLabel }}</div>
                </div>
              </div>
            </div>
        </div>

        <CrossfaderPanel v-else-if="liveBottomDrawerTab === 'CROSSFADER'" :app="appViewModel" />

        <div
          v-else-if="liveBottomDrawerTab === 'SYSTEM'"
          class="top-drawer-system system-runs-tab"
          data-testid="bottom-drawer-system"
        >
          <RunsBrowserPanel :app="appViewModel" />
        </div>
          </div>
        </div>

        <div class="preview-stage-video-stack">
        <div
          class="video-wrap video-wrap--anchored"
          :class="{
            'video-wrap--frame-processing': showFrameProcessingOnStage,
            'video-wrap--hls-and-preview': showMainStageHls && showStandbyPreviewVideo,
          }"
        >
          <div
            ref="videoStageRef"
            class="video-wrap__stage"
            :class="{
              'video-wrap__stage--preview': videoStageSize === 'small',
              'video-wrap__stage--canvas': videoStageSize === 'medium',
              'video-wrap__stage--full': videoStageSize === 'full',
            }"
          >
            <ThreeBackground
              ref="threeBackgroundRef"
              data-testid="preview-standby-animation"
              :class="['video-wrap__default-animation', { 'video-wrap__default-animation--visible': showDefaultAnimation }]"
              :style="webglLayerStyle"
              :lfos="lfos"
              :audio-metrics="backgroundAudioMetrics"
              :active-tab="currentTab"
              :morph="performance.crossfader"
              :settings="defaultAnimation"
            />
            <video
              v-if="standbyPreviewVideoUrl"
              ref="standbyPreviewEl"
              class="video-feed video-feed--standby-preview"
              :class="{ 'video-feed--visible': showStandbyPreviewVideo }"
              data-testid="standby-preview-video"
              :src="standbyPreviewVideoUrl"
              muted
              loop
              autoplay
              playsinline
              preload="auto"
            ></video>
            <img
              v-if="showPreviewStill"
              :src="displayedPreviewStillPath"
              alt="Generated preview"
              class="video-still-preview"
              :class="{ 'video-still-preview--over-webgl': showForgeOverWebgl }"
              :style="forgeOverlayStyle"
              data-testid="preview-still-frame"
            />
            <video
              :class="['video-feed', 'video-feed--hls', { 'video-feed--visible': showDeforumVideo, 'video-feed--blended': isBlendLayerActive && showDeforumVideo, 'video-feed--forge-reveal': deforumLayerAutoFadeIn }]"
              :style="showDeforumVideo && showForgeOverWebgl ? forgeOverlayStyle : null"
              id="player"
              ref="videoEl"
              muted
              playsinline
            ></video>
            <video
              ref="inputVideoEl"
              :class="['video-feed', 'video-layer-input-video', { 'video-feed--visible': showLayerInputVideo }]"
              :style="inputLayerStyle"
              muted
              playsinline
              controls
            ></video>
            <div
              v-if="isInputLayerActive && !activeLayerPlaybackUrl"
              class="video-layer-empty"
              data-testid="video-layer-input-empty"
            >
              <span class="video-layer-empty__title">Input layer</span>
              <span class="framesync-subtitle">Pick a video from the library or link a cloud source.</span>
              <button type="button" class="framesync-button" @click="openLibraryWorkspace('browser', { asSource: true })">+ Add source</button>
            </div>
            <div
              v-if="activeVideoLayer && activeVideoLayer.kind === 'cloud'"
              class="video-layer-empty video-layer-empty--cloud"
            >
              <span class="video-layer-empty__title">{{ activeVideoLayer.label }}</span>
              <span class="framesync-subtitle">Cloud links open externally until direct streaming is wired in.</span>
              <button type="button" class="framesync-button" @click="openCloudLayer(activeVideoLayer)">Open link</button>
            </div>
          <div
            v-if="showFrameProcessingOnStage"
            class="preview-loading-overlay"
            data-testid="frame-processing-overlay"
            aria-live="polite"
            aria-busy="true"
          >
            <div class="preview-loading-overlay__card">
              <span class="lazy-loading-indicator lazy-loading-indicator--overlay">
                <span class="lazy-loading-indicator__spinner" aria-hidden="true"></span>
                <span>{{ frameProcessingLabel }}</span>
                <span class="lazy-loading-indicator__dots" aria-hidden="true"><span></span><span></span><span></span></span>
              </span>
              <span class="preview-loading-overlay__hint">{{ frameProcessingHint }}</span>
            </div>
          </div>
          <div class="overlay">
            <div>
              <div class="timecode">{{ timecode }}</div>
              <div style="font-size:11px; color:var(--text-secondary);">Seed {{ seedRandomEnabled ? 'Random' : hud.seed }}</div>
              <div style="font-size:11px; color:var(--text-secondary);">
                {{ currentProjectLabel }} · {{ currentBatchLabel }}
              </div>
              <div
                v-if="isForgeAnimationLayerActive && deforumStreamFrameLabel"
                class="video-feed-frames"
                data-testid="deforum-stream-frame-count"
              >
                {{ deforumStreamFrameLabel }}
              </div>
            </div>
            <div style="display:flex; align-items:flex-start; gap:8px; text-align:right;">
              <div>
                <div>{{ masterFps }} fps</div>
                <div style="font-size:11px; color:var(--text-secondary);">lat {{ stats.lat }}ms</div>
                <div class="video-feed-status" :class="{ 'video-feed-status--ready': videoReady && isForgeAnimationLayerActive, 'video-feed-status--selected': isForgeAnimationLayerActive }">
                  {{ videoLayerStatusLabel }}
                </div>
              </div>
            </div>
          </div>
          <div v-if="currentTab === 'LIVE' && pinnedParamItems.length" class="live-hud-strip live-hud-strip--pinned">
            <GlassPanel size="sm" class="live-hud-pinned">
              <template #header>Pinned</template>
              <LiveParamRow
                v-for="p in pinnedParamItems.slice(0, 4)"
                :key="'hud-pin-' + p.key"
                :label="p.label"
                :param-key="p.key"
                :value="p.val"
                :min="p.min"
                :max="p.max"
                :source="paramSources[p.key] || 'Manual'"
                :modulated="!!paramSources[p.key] && paramSources[p.key] !== 'Manual'"
              />
            </GlassPanel>
          </div>

          <div v-if="currentTab === 'LIVE'" class="live-hud-dock" data-testid="live-hud-dock">
            <div
              v-if="modulatingNowItems.length"
              class="live-hud-dock__cell live-hud-dock__cell--modulating"
              data-testid="live-modulating-hud"
            >
              <GlassPanel size="sm" variant="overlay" class="live-hud-modulating">
                <template #header>modulating now</template>
                <div v-for="item in modulatingNowItems.slice(0, 3)" :key="'hud-mod-' + item.key" class="live-hud-mod-row">
                  <div class="live-hud-mod-row__info">
                    <span class="live-hud-mod-row__label">{{ item.label }}</span>
                    <span class="live-hud-mod-row__source">← {{ item.source }}</span>
                    <span class="live-hud-mod-row__val">{{ Number(item.val).toFixed(2) }}</span>
                  </div>
                  <div class="live-hud-mod-row__bar">
                    <div class="live-hud-mod-row__fill" :style="{ width: item.pct + '%' }"></div>
                  </div>
                </div>
              </GlassPanel>
            </div>

            <div class="live-hud-dock__cell live-hud-dock__cell--morph">
              <GlassPanel size="sm" variant="overlay" class="live-hud-morph" data-testid="live-morph-hud">
                <template #header>morph</template>
                <div class="live-hud-morph__labels">
                  <span class="live-hud-morph__a">A · {{ Math.round((1 - performance.crossfader) * 100) }}%</span>
                  <span class="live-hud-morph__b">B · {{ Math.round(performance.crossfader * 100) }}%</span>
                </div>
                <div class="live-hud-morph__slider-wrap">
                  <input
                    type="range" min="0" max="1" step="0.01"
                    :value="performance.crossfader"
                    class="live-hud-morph__slider"
                    @input="onCrossfaderSlider($event.target.value)"
                  />
                </div>
                <div class="live-hud-morph__actions">
                  <button class="framesync-button framesync-button--compact" @click="onCrossfaderSlider(0)">snap A</button>
                  <button class="framesync-button framesync-button--compact" @click="onCrossfaderSlider(1)">snap B</button>
                  <button class="framesync-button framesync-button--compact framesync-button--live" @click="onCrossfaderSlider(Math.random())">rand</button>
                </div>
              </GlassPanel>
            </div>
          </div>
          </div>
        </div>
        </div>

          <div
            v-if="currentTab === 'LIVE' && recentRunsRail.length"
            class="recent-runs-rail"
            data-testid="recent-runs-rail"
          >
            <div class="recent-runs-rail__header">
              <span class="recent-runs-rail__title">Recent runs</span>
              <button type="button" class="recent-runs-rail__link" @click="switchTab('RUNS')">Open runs</button>
            </div>
            <div class="recent-runs-rail__list">
              <button
                v-for="run in recentRunsRail"
                :key="'recent-run-' + run.run_id"
                type="button"
                class="recent-runs-rail__item"
                @click="openRecentRunFromRail(run)"
              >
                <img
                  v-if="runListingThumbUrl(run)"
                  :src="runListingThumbUrl(run)"
                  class="recent-runs-rail__thumb"
                  :alt="run.run_id"
                >
                <div v-else class="recent-runs-rail__thumb recent-runs-rail__thumb--empty">—</div>
                <div class="recent-runs-rail__meta">
                  <span class="recent-runs-rail__id">{{ run.run_id }}</span>
                  <span class="recent-runs-rail__date">{{ formatDate(run.started_at) }}</span>
                </div>
              </button>
            </div>
          </div>

        <!-- Local blob URL only; used to align reference audio with HLS video timeline -->
        <audio ref="avSyncAudio" data-testid="av-sync-audio" :src="audio.objectUrl || undefined" preload="auto" style="display:none;"></audio>

        <div
          v-if="currentTab === 'MOTION' || currentTab === 'GENERATE'"
          class="preview-bottom-dock"
          data-testid="preview-bottom-dock"
        >
          <div class="preview-bottom-dock__pane preview-bottom-dock__pane--sequencer">
            <div
              class="stage-sequencer-shell"
              :class="{ 'stage-sequencer-shell--side-open': motionSequencerSideOpen }"
              data-testid="motion-sequencer-dock"
            >
              <aside
                v-show="motionSequencerSideOpen"
                class="stage-sequencer-side"
                data-testid="motion-sequencer-side-drawer"
              >
                <div class="stage-sequencer-side__head">
                  <span class="stage-sequencer-side__title">Sequencer <span class="framesync-accent">Editor</span></span>
                  <button
                    type="button"
                    class="framesync-button framesync-button--compact"
                    title="Close sequencer editor"
                    @click="motionSequencerSideOpen = false; saveSessionState()"
                  >
                    <UiIcon name="arrow-left" />
                  </button>
                </div>
                <div class="stage-sequencer-side__body">
                  <SequencerControlsPanel :app="appViewModel" side-drawer />
                </div>
              </aside>
              <button
                type="button"
                class="stage-sequencer-side-toggle"
                :class="{ 'stage-sequencer-side-toggle--open': motionSequencerSideOpen }"
                :aria-expanded="motionSequencerSideOpen ? 'true' : 'false'"
                :title="motionSequencerSideOpen ? 'Hide sequencer editor' : 'Show sequencer editor'"
                data-testid="motion-sequencer-side-toggle"
                @click="motionSequencerSideOpen = !motionSequencerSideOpen; saveSessionState()"
              >
                <UiIcon :name="motionSequencerSideOpen ? 'arrow-left' : 'arrow-right'" />
              </button>
              <div class="stage-sequencer-main">
                <SequencerControlsPanel :app="appViewModel" stage show-timeline />
                <GenerateView
                  v-if="generator.result || generator.status || performance.status || sequencerStatus"
                  :app="appViewModel"
                  story-only
                />
              </div>
            </div>
          </div>
        </div>

        <!-- transport moved to top bar in LIVE -->

          </div>
        </div>

      </div>

      <div v-if="!libraryWorkspaceOpen" class="edge-dock-host" data-testid="edge-dock-host">
        <aside
          class="layers-sidebar"
          :class="{ 'layers-sidebar--open': layersSidebarOpen }"
          data-testid="video-layer-tabs"
        >
          <button
            type="button"
            class="layers-sidebar__toggle edge-dock-tab edge-dock-tab--layers"
            :class="{ 'edge-dock-tab--panel-open': layersSidebarOpen }"
            :aria-expanded="layersSidebarOpen ? 'true' : 'false'"
            :aria-label="layersSidebarToggleLabel"
            :title="layersSidebarToggleLabel"
            data-testid="layers-sidebar-toggle"
            @click="layersSidebarToggle"
          >
            <UiIcon class="edge-dock-tab__icon" :name="layersSidebarChevronIcon" />
            <span class="edge-dock-tab__label">Layers</span>
          </button>
          <div class="layers-sidebar__rail-head">
            <span class="layers-sidebar__rail-title">Active preview</span>
          </div>
          <div class="layers-sidebar__active-badge">
            <span
              class="layers-sidebar__active-dot video-layer-tab__dot"
              :class="'video-layer-tab__dot--' + layerStatus(activeVideoLayer)"
              aria-hidden="true"
            ></span>
            <span class="layers-sidebar__active-name">{{ activeVideoLayer?.label || 'None' }}</span>
          </div>
          <div class="layers-sidebar__list">
            <button
              v-for="layer in runningPreviewVideoLayers"
              :key="'sidebar-layer-' + layer.id"
              type="button"
              class="layers-sidebar__item"
              :class="{
                'layers-sidebar__item--active': activeVideoLayerId === layer.id,
                'layers-sidebar__item--builtin': layer.builtin,
              }"
              :title="layer.label"
              @click="selectVideoLayer(layer.id)"
            >
              <span
                class="video-layer-tab__dot"
                :class="'video-layer-tab__dot--' + layerStatus(layer)"
                aria-hidden="true"
              ></span>
              <span class="layers-sidebar__item-label">{{ layer.label }}</span>
            </button>
            <button
              type="button"
              class="layers-sidebar__add"
              data-testid="video-layer-add-toggle"
              title="Add video source (opens Library)"
              @click="openLibraryWorkspace('browser', { asSource: true })"
            >
              <span class="layers-sidebar__add-icon">+</span>
              <span class="layers-sidebar__item-label">Add source</span>
            </button>
          </div>
          <div class="layers-sidebar__scenes">
            <div class="layers-sidebar__scenes-header">
              <span class="layers-sidebar__scenes-label">Scenes</span>
              <button
                type="button"
                class="layers-sidebar__scenes-save framesync-button framesync-button--compact"
                title="Save current engine state as a scene"
                @click="saveScene('scene-' + Date.now().toString(36), defaultSceneName === 'default')"
              >Save</button>
            </div>
            <button
              v-for="scene in savedScenes"
              :key="scene.name"
              type="button"
              class="layers-sidebar__scene-item"
              :class="{ 'layers-sidebar__scene-item--default': scene.name === defaultSceneName }"
              @click="loadScene(scene.name)"
              @dblclick="defaultSceneName = scene.name; saveScene(scene.name, true)"
              :title="scene.name + (scene.name === defaultSceneName ? ' (default · double-click to set default)' : ' · double-click to set as default')"
            >
              <span class="layers-sidebar__scene-name">{{ scene.name }}</span>
              <button
                type="button"
                class="layers-sidebar__scene-delete"
                title="Delete scene"
                @click.stop="deleteScene(scene.name)"
              >×</button>
            </button>
            <div v-if="!savedScenes.length" class="layers-sidebar__scenes-empty">
              No scenes saved yet.
            </div>
          </div>
        </aside>

        <aside
          v-if="showEngineDrawerShell"
          class="engine-drawer-shell"
          :class="{ 'engine-drawer-shell--open': liveEngineDrawerOpen }"
          :aria-hidden="liveEngineDrawerOpen ? 'false' : 'true'"
          data-testid="engine-drawer"
        >
          <button
            type="button"
            class="edge-dock-tab edge-dock-tab--engine"
            :class="{ 'edge-dock-tab--inside': liveEngineDrawerOpen, 'edge-dock-tab--panel-open': liveEngineDrawerOpen }"
            :aria-expanded="liveEngineDrawerOpen ? 'true' : 'false'"
            :aria-label="engineDrawerToggleLabel"
            :title="engineDrawerToggleLabel"
            data-testid="engine-drawer-toggle"
            @click="toggleEngineDrawer"
          >
            <UiIcon class="edge-dock-tab__icon" :name="engineDrawerChevronIcon" />
            <span class="edge-dock-tab__label">Engine</span>
          </button>
          <div v-show="liveEngineDrawerOpen" class="engine-drawer-panel">
            <AnimationEnginePanel :app="appViewModel" />
          </div>
        </aside>

        <div
          class="live-drawer-shell live-drawer-shell--side live-drawer-shell--left"
          :class="{ 'live-drawer-shell--open': rightPanelOpen }"
          data-testid="right-panel-drawer"
        >
          <button
            type="button"
            class="edge-dock-tab edge-dock-tab--context"
            :class="{ 'edge-dock-tab--panel-open': rightPanelOpen }"
            :aria-expanded="rightPanelOpen ? 'true' : 'false'"
            :aria-label="contextPanelToggleLabel"
            :title="contextPanelToggleLabel"
            data-testid="right-panel-toggle"
            @click="toggleRightPanel"
          >
            <UiIcon class="edge-dock-tab__icon" :name="contextPanelChevronIcon" />
            <span class="edge-dock-tab__label edge-dock-tab__label--context">Controls</span>
          </button>
          <div
            v-show="rightPanelOpen"
            class="live-right-column"
            :class="{ 'live-right-column--overlay': edgeDockOverlayMode }"
          >
            <LiveView v-if="currentTab === 'LIVE'" :app="appViewModel" />
            <PromptsView v-else-if="currentTab === 'PROMPTS'" :app="appViewModel" />
            <MotionView v-else-if="currentTab === 'MOTION'" :app="appViewModel" />
            <ModulationView v-else-if="currentTab === 'MODULATION' || currentTab === 'AUDIO'" :app="appViewModel" />
            <SettingsView v-else-if="currentTab === 'SETTINGS'" :app="appViewModel" />
            <RunsBrowserPanel v-else-if="currentTab === 'RUNS'" :app="appViewModel" />
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script>
import './style.css'
import {
  CROSSFADE_SLOT_TYPES,
  morphSlotValue,
  smoothstep,
} from './utils/morph-utils.mjs'
import {
  DEFORUM_DEFAULT_SETTINGS,
  DEFORUM_FIELD_GROUPS,
  DEFORUM_LAYER_FIELD_GROUPS,
  DEFORUM_GLOBAL_ENGINE_GROUP,
  DEFORUM_FIELD_KEYS,
  DEFORUM_NON_TOGGLEABLE_KEYS,
  FALLBACK_FORGE_SAMPLERS,
  FALLBACK_FORGE_SCHEDULERS,
  createDeforumFieldEnabledMap,
  DEFORUM_3D_ONLY_FIELD_KEYS,
  DEFORUM_MOTION_3D_GROUP_ID,
  getNestedValue,
  setNestedValue,
  removeNestedValue,
  patchFromKeyPath,
  mergeDeforumSettings,
  readScheduleValueAtFrame,
  buildLinearScheduleRamp,
  normalizeDeforumMode2d3d,
  isDeforum3dOnlyFieldKey,
} from './utils/deforum-settings-schema.mjs'
import { verifyDeforumSettings } from './utils/deforum-settings-verify.mjs'
import { apiFetch, modelSourceLabel } from './utils/api-utils.js'
import {
  buildRunDetailCurrentContext,
  buildRunDetailJsonRows,
  runDetailJsonPretty,
} from './shared/run-detail-json.mjs'
import { applyPromptStyleToPrompts, mergePromptParts, buildPromptStyleJobSnapshot, promptStyleJobSummary } from './shared/prompt-styles.mjs'
import {
  DEFAULT_FORGE_MODEL,
  DEFAULT_LCM_ENGINE,
  DEFAULT_LCM_LORA_TAG,
  mergeLoraIntoPrompt,
} from './shared/engine-config.mjs'
import {
  DEFAULT_WAN_ENGINE,
  mergeWanEngineIntoDeforumSettings,
  normalizeWanEngine,
  parseWanResolution,
  pickWanResolutionForSize,
  visibleWanControlFields,
  WAN_ANIMATION_MODE,
  WAN_SPEED_PRESET_NAMES,
  WAN_MOTION_PRESET_NAMES,
  WAN_MOTION_LORAS,
  WAN_DOWNLOAD_PACKAGES,
  WAN_I2V_MODEL_OPTIONS,
  getWanSpeedPreset,
  getWanMotionPreset,
  wanEngineForDownloadPackage,
} from './shared/wan-engine-config.mjs'
import {
  DEFAULT_ANIMATELCM_ENGINE,
  ANIMATELCM_CONTROL_FIELDS,
  ANIMATELCM_MOTION_TYPES,
  ANIMATELCM_MOTION_LORAS,
  ANIMATELCM_ANIMATION_MODE,
  normalizeAnimateLcmEngine,
  mergeAnimateLcmIntoDeforumSettings,
} from './animation-plugins/animatelcm-engine-config.mjs'
import {
  DEFAULT_SVD_ENGINE,
  SVD_ENGINE_CONTROL_FIELDS,
  SVD_PRESET_NAMES,
  buildSvdGeneratePayload,
  getSvdPreset,
  normalizeSvdEngine,
  parseSvdResolution,
  pickSvdResolutionForSize,
  svdEngineSummary,
  visibleSvdControlFields,
} from './shared/svd-engine-config.mjs'
import {
  COMMON_VISUAL_PARAMS,
  bindingFor,
  isCommonVisualEnabled,
  parseCommonVisualModKey,
} from './animation-plugins/common-visual.mjs'
import {
  appendDeforaImportParam,
  deforaMediaFileUrl,
  freecutEditorUrl,
  freecutProjectsUrl,
} from './shared/freecut-bridge.mjs'
import {
  buildDeforumContinuationPatch,
  canUndoContinuation,
  continuationCheckpointFromThumb,
  deforumContinuationStartFrame,
  normalizeContinuationCheckpoint,
  lastGeneratedThumb,
  parseFrameNumberFromThumb,
  popContinuationForUndo,
  pushContinuationCheckpoint,
  trimThumbsToContinuationFrame,
} from './shared/deforum-continuation.mjs'
import {
  buildStoryOllamaApiBody,
  normalizeStoryClientRequest,
  stableJsonStringify,
  storyLlmRequestLogEntry,
} from './shared/story-llm-request.mjs'
import { normalizeProtoplanetSettings } from './shared/protoplanet-gpgpu.mjs'
import { normalizePeriodicTableSettings } from './shared/periodic-table-settings.mjs'
import {
  buildMotionSequencerVideoClip,
  extendProjectDuration as extendLibraryProjectDuration,
  normalizeLibraryVideoEntry,
  projectDurationSec as libraryProjectDurationSec,
  shouldOfferProjectExtension,
} from './shared/library-video-source.mjs'
import {
  ENGINE_SETTINGS_SLOT_COUNT,
  buildEngineSettingsSnapshot,
  normalizeEngineSettingsSlot,
  normalizeEngineSettingsSlots,
} from './shared/engine-settings-snapshot.mjs'
import {
  CN_MODULE_PRESETS,
  CN_PLUGIN_FIELD_META,
  DEFORUM_CN_SLOT_COUNT,
  applyModulePresetToSettings,
  cnPrefix,
  cnUnitFromSlotId,
  filterModelsForModule,
  inferModulePresetId,
  modulePresetById,
  scalarFromSchedule,
  scheduleFromScalar,
  syncCnSlotFromDeforumUnit,
  syncDeforumUnitFromCnSlot,
} from './shared/deforum-controlnet-config.mjs'

function pluginByLayerKind(kind) {
  const plugins = [
    { id: 'webgl', layerKind: 'webgl' },
    { id: 'deforum', layerKind: 'deforum' },
    { id: 'wan', layerKind: 'wan' },
    { id: 'animatelcm', layerKind: 'animatelcm' },
    { id: 'svd', layerKind: 'svd' },
  ];
  return plugins.find((p) => p.layerKind === kind) || null;
}


const TIMELINE_TRACK_COLORS = [
  'rgb(45, 226, 255)',
  'rgb(255, 83, 217)',
  'rgb(90, 242, 169)',
  'rgb(255, 138, 26)',
  'rgb(167, 139, 250)',
  'rgb(244, 114, 182)',
  'rgb(52, 211, 153)',
  'rgb(251, 191, 36)',
]
const TIMELINE_GRID_EMPTY = 'rgb(26, 58, 82)'
const TIMELINE_GRID_LABEL = 'rgb(58, 90, 120)'
const TIMELINE_GRID_BORDER = 'rgb(12, 48, 72)'
const TIMELINE_GRID_TEXT = 'rgb(90, 143, 184)'
const DEFORUM_DERIVED_TOGGLE_KEYS = {
  distilled_cfg_scale_schedule: 'cfg_scale_schedule',
}

import StatusStrip from './components/StatusStrip.vue'
import GlassPanel from './components/GlassPanel.vue'
import LiveParamRow from './components/LiveParamRow.vue'
import UiIcon from './components/UiIcon.vue'
import SequencerControlsPanel from './components/SequencerControlsPanel.vue'
import ThreeBackground from './components/ThreeBackground.vue'
import LiveView from './components/views/LiveView.vue'
import AnimationEnginePanel from './components/AnimationEnginePanel.vue'
import CrossfaderPanel from './components/CrossfaderPanel.vue'
import LibraryWorkspaceOverlay from './components/LibraryWorkspaceOverlay.vue'
import EditorView from './components/views/EditorView.vue'
import PromptsView from './components/views/PromptsView.vue'
import MotionView from './components/views/MotionView.vue'
import GenerateView from './components/views/GenerateView.vue'
import ModulationView from './components/views/ModulationView.vue'
import SettingsView from './components/views/SettingsView.vue'
import RunsBrowserPanel from './components/RunsBrowserPanel.vue'
import { paintSpectrumBars } from './utils/audio-spectrum.js'

export default {
  name: 'App',
  components: { StatusStrip, GlassPanel, LiveParamRow, UiIcon, SequencerControlsPanel, GenerateView, ThreeBackground, LiveView, AnimationEnginePanel, CrossfaderPanel, LibraryWorkspaceOverlay, EditorView, PromptsView, MotionView, ModulationView, SettingsView, RunsBrowserPanel },
  data() {
    return {
       showFrames: false,
       isPlaying: false,
       isRecording: false,
       deforumPlaying: false,
       deforumSessionStartedAt: null,
       previewGenerating: false,
       forgeLivePreviewImage: "",
       previewProgressPct: null,
       previewProgressPollTimer: null,
       heldPreviewFramePath: "",
       previewDebounceTimer: null,
       previewRequestQueue: [],
       previewQueueProcessing: false,
       previewQueueMaxSize: 4,
      videoReady: false,
       framesRefreshBackoffMs: 1000,
       frameRefreshTimer: null,
       apiHealthBackoffMs: 15000,
      runsLoading: false,
      presetsLoading: false,
      sharedPresetsLoading: false,
      pluginsLoading: false,
      lorasLoading: false,
      cnLoading: false,
      deforumSettingsLoading: false,
      deforumSettingsSaving: false,
      paramPanelOpen: false,
      deforumPanelOpen: false,
      rightPanelOpen: true,
      sidePanelDock: 'auto', // auto | edge | video
      sidePanelDockBounds: { top: 0, left: 0, height: 0 },
      _sidePanelDockOnResize: null,
      _sidePanelDockResizeObserver: null,
      videoStageSize: 'full', // small | medium | full
      liveAnimationBoxOpen: false,
      enginePanelDetailsOpen: false,
      enginePanelDetailsTab: 'ENGINE',
      deforumPreloadStatus: '',
      _preloadDeforumStarted: false,
      libraryFullscreen: false,
      libraryWorkspaceOpen: false,
      libraryWorkspacePane: 'browser',
      librarySourceMode: false,
      extendProjectPromptOpen: false,
      extendProjectPrompt: { videoLabel: '', videoDurationSec: 0, projectDurationSec: 0 },
      _extendProjectPromptResolver: null,
      liveBottomDrawerOpen: false,
      liveBottomDrawerTab: 'MODULATION', // MODULATION | CROSSFADER | SYSTEM
       deforumSettings: { ...DEFORUM_DEFAULT_SETTINGS },
      seedFixedBackup: DEFORUM_DEFAULT_SETTINGS.seed >= 0
        ? DEFORUM_DEFAULT_SETTINGS.seed
        : Math.floor(Math.random() * 2147483647),
      deforumFieldGroups: [...DEFORUM_FIELD_GROUPS],
      deforumFieldEnabled: createDeforumFieldEnabledMap(),
       deforumActiveTab: 'canvas',
      deforumControlTab: 'settings',
       deforumSectionOpen: {},
       deforumAdvancedOpen: false,
       sessionDeforumSettingsLoaded: false,
       deforumSettingsJson: '',
       deforumSettingsJsonError: '',
       deforumSettingsStatus: '',
      deforumContinuationCheckpoints: [],
       deforumVerifyResults: null,
       deforumSaveTimer: null,
       deforumPreviewTimer: null,
       crossfadeSlotTypes: CROSSFADE_SLOT_TYPES,
       performance: {
         genericPrompt: '',
         crossfader: 0.5,
         newSlotType: 'prompt',
         slots: [],
         status: '',
         lastPreviewPath: null,
       },
       forge: {
         host: typeof process !== 'undefined' && process.env && process.env.SD_FORGE_HOST ? process.env.SD_FORGE_HOST : '192.168.2.101',
         port: typeof process !== 'undefined' && process.env && process.env.SD_FORGE_PORT ? process.env.SD_FORGE_PORT : '7860',
         available: false,
         loading: false,
         switching: false,
         models: [],
         modelsSource: '',
         currentModel: '',
         selectedModel: '',
         lastModel: '',
         modelInfo: null,
         samplers: [],
         schedulers: [],
         vaeList: [],
         options: {},
       },
       streamUrl: "",
      streaming: {
        status: '',
        activeStatus: 'unknown',
        activeDestinationId: null,
        destinations: [],
      },
       lfoOn: true,
      beatMacroOn: true,
      apiHealth: { sdForge: null },
      serviceHealth: {
        loading: false,
        lastChecked: null,
        web: { ok: true },
        hls: { updated: null, ageMs: null },
        stream: { status: 'unknown' },
      },
      forgeHost: process.env.SD_FORGE_HOST || '192.168.2.101',
      availablePresets: [],
      currentPreset: null,
      newPresetName: '',
      presetStatus: '',
      engineSettingsSlots: normalizeEngineSettingsSlots(null),
      engineSettingsSlotStatus: '',
      deforumActiveCnUnit: 1,
      cnModules: [],
      cnModulesSource: '',
      sharedPresets: [],
      sharedPresetName: '',
      sharedPresetBy: '',
      sharedPresetsStatus: '',
      collab: {
        userId: null,
        userName: typeof localStorage !== 'undefined' ? (localStorage.getItem('defora_user_name') || 'Performer') : 'Performer',
        users: [],
        locks: {},
        recording: false,
        recordings: [],
        status: '',
      },
      collabEnabled: true,
      gpuPool: {
        enabled: false,
        strategy: 'least_busy',
        defaultForgeModel: '',
        healthyNodes: 0,
        nodes: [],
        loading: false,
        status: '',
        draft: { url: '', name: '', backend: 'sd-forge', priority: 1, model: '' },
        editId: null,
        editDraft: { name: '', url: '', backend: 'sd-forge', priority: 1, model: '' },
        forgeModal: {
          open: false,
          nodeId: '',
          nodeName: '',
          url: '',
          priority: 1,
          model: '',
          currentModel: '',
          available: false,
          loading: false,
          saving: false,
          applying: false,
          status: '',
          samplers: [],
          schedulers: [],
          vaeList: [],
          modelInfo: null,
          options: {},
          mediator: {
            host: '',
            deforumPort: 8765,
            deforumationPort: 8766,
            deforumStatus: '',
            deforumationStatus: '',
            probing: false,
          },
        },
        expandedLog: null,
        modelOptions: {},
        defaultForgeModelStatus: '',
      },
      infrastructure: {
        loading: false,
        mediator: null,
        transcoders: [],
        updatedAt: null,
      },
      generator: {
        theme: '',
        stylePreset: 'Masterpiece, Realistic',
        customStyle: '',
        fps: 24,
        resolution: '1024x576',
        totalFrames: 96,
        numScenes: 4,
        isGenerating: false,
        status: '',
        lastPath: null,
        result: null,
        llmRequestLog: null,
      },
      session: "clown_set_01",
      _syncingGlobalFps: false,
      tabs: [
        { id: "LIVE", label: "LIVE", hint: "Monitor", icon: "broadcast" },
        { id: "PROMPTS", label: "PROMPTS", hint: "Words", icon: "sparkles" },
        { id: "MOTION", label: "MOTION", hint: "Move", icon: "shuffle" },
        { id: "MODULATION", label: "MODULATION", hint: "React", icon: "wave" },
        { id: "AUDIO", label: "AUDIO", hint: "Reactive", icon: "mic" },
        { id: "SETTINGS", label: "SETTINGS", hint: "Engine", icon: "gear" },
      ],
      currentTab: "LIVE",
      currentSubTab: { LIVE: 'MONITOR', PROMPTS: 'PROMPTS', MODULATION: 'LFO', SETTINGS: 'ENGINE', MOTION: 'PERFORMANCE' },
      editorFreecutRoute: 'projects',
      editorPendingImportPath: '',
      editorPendingImportRootId: '',
      editorPendingImportUrl: '',
      editorStatus: '',
      editorStatusLive: false,
      liveSourcePanel: 'library',
      liveSources: [],
      liveSourceStatus: '',
      videoLayers: [
        { id: 'webgl', kind: 'webgl', label: 'WebGL', builtin: true },
        { id: 'deforum', kind: 'deforum', label: 'Deforum', builtin: true },
        { id: 'wan', kind: 'wan', label: 'WAN Video', builtin: true },
        { id: 'animatelcm', kind: 'animatelcm', label: 'AnimateLCM', builtin: true },
        { id: 'svd', kind: 'svd', label: 'SVD', builtin: true },
        { id: 'input', kind: 'input', label: 'Input', builtin: true, playbackUrl: null },
      ],
      wanEngine: { ...DEFAULT_WAN_ENGINE },
      wanDownloadStatus: '',
      wanDownloadBusy: false,
      animateLcmEngine: { ...DEFAULT_ANIMATELCM_ENGINE },
      svdEngine: { ...DEFAULT_SVD_ENGINE },
      svdStatus: '',
      _userPickedPreviewLayer: false,
      activeVideoLayerId: 'webgl',
      videoLayerAddOpen: false,
      layersSidebarOpen: false,
      savedScenes: [],
      defaultSceneName: 'default',
      inputLayerPlaybackUrl: null,
      inputLayerLabel: 'Input',
      inputLayerSourceMeta: null,
      inputVideoReady: false,
      cloudDriveDraft: { url: '', provider: 'google_drive' },
      systemFiles: {
        roots: [],
        rootId: 'uploads',
        currentPath: '',
        parent: '',
        folders: [],
        videos: [],
        videoCount: null,
        folderCount: null,
        loading: false,
        status: '',
        recursive: false,
        viewMode: 'browse',
        showFilenames: true,
        sortKey: 'name-asc',
        zoomLevel: 2,
        selectedPaths: [],
        fullscreenIndex: -1,
        cloudSources: [],
        cloudSource: null,
        cloudConnectOpen: false,
        cloudVideoDraft: { name: '', url: '' },
        newFolderOpen: false,
        newFolderName: '',
        _rootsLoaded: false,
      },
      videoSwarmVisibleStart: 0,
      videoSwarmVisibleEnd: 48,
      librarySubTab: 'BROWSER',
      librarySelectedProject: null,
      librarySelectedVideo: null,
      librarySelectedAudio: null,
      liveEngineDrawerOpen: false,
      restoreSessionPromptOpen: false,
      viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1400,
      pendingSessionStateRaw: '',
      promptHistoryOpen: false,
      promptHistory: [],
      speechPromptSupported: false,
      speechPromptListening: false,
      speechPromptError: '',
      stats: { lat: 120 },
      hud: { seed: 42490527 },
      timecode: "00:00.00",
      liveVibe: [
        { key: "cfg", label: "Vibe (CFG)", val: 0.63, min: 0, max: 1.5, step: 0.01 },
        { key: "strength", label: "Strength", val: 0.78, min: 0, max: 1.5, step: 0.01 },
        { key: "noise", label: "Noise/Glitch", val: 0.2, min: 0, max: 1, step: 0.01 },
        { key: "cfgscale", label: "CFG scale", val: 5.0, min: 0, max: 15, step: 0.1 },
      ],
      liveCam: [
        { key: "zoom", label: "Zoom", val: 0.8, min: -5, max: 5, step: 0.05, sourceable: true },
        { key: "panx", label: "Pan X", val: 0.1, min: -1, max: 1, step: 0.01, sourceable: false },
        { key: "pany", label: "Pan Y", val: 0.0, min: -1, max: 1, step: 0.01, sourceable: false },
        { key: "tilt", label: "Tilt / Rotate", val: 0.0, min: -180, max: 180, step: 0.5, sourceable: false },
      ],
      paramSources: {
        cfg: "Manual",
        strength: "Manual",
        noise: "Beat",
        cfgscale: "Manual",
        zoom: "Beat",
      },
      /** HUD slider keys → modulation / liveParam keys used by LFO and backend */
      liveParamAliases: {
        panx: "translation_x",
        pany: "translation_y",
        zoom: "zoom_2d",
        tilt: "rotation_z",
        noise: "noise_multiplier",
      },
      modulationRouteFocusKey: null,
      pinnedParams: (() => {
        try {
          const raw = typeof localStorage !== 'undefined' && localStorage.getItem('defora_pinned_params');
          return raw ? JSON.parse(raw) : [];
        } catch (_) { return []; }
      })(),
      promptStyles: [],
      promptStylesLoading: false,
      promptStylesImporting: false,
      promptStylesStatus: "",
      activePromptStyleId: null,
      promptStyleEditorId: null,
      promptStyleDraft: null,
      promptStyleSearch: "",
      promptStyleAutoExample: true,
      lcmEngine: { ...DEFAULT_LCM_ENGINE },
      prompts: {
        pos: "",
        neg: "",
        morphOn: true,
        loraCrossfaderOn: false,
        crossfaderValue: 0.5,
        loraCrossfaderLfoLink: null,
        loraCrossfaderLfoBase: 0.5,
        morphBlend: 0.5,
        morphBlendLfoLink: null,
        morphBlendLfoBase: 0.5,
      },
      img2img: {
        show: true,
        dataUrl: null,
        maskDataUrl: null,
        maskBlur: 4,
        inpaintingFill: 1,
        inpaintFullRes: true,
        denoisingStrength: 0.55,
        width: 1024,
        height: 1024,
        loading: false,
        status: "",
        lastPath: null,
      },
      pluginsRegistry: [],
      morphSlots: [
        { id: 1, on: true, name: "clean → mad", a: "clean evil", b: "mad clown", range: "0.40–1.00", weight: 1 },
        { id: 2, on: true, name: "box → tunnel", a: "small box", b: "neon tunnel", range: "0.00–0.60", weight: 1 },
        { id: 3, on: false, name: "style fade", a: "photographic", b: "anime render", range: "0.20–0.80", weight: 1 },
      ],
      loras: {
        available: [],
        common: [],
        groupA: [],
        groupB: [],
        source: "unknown",
        familyCollapsed: {
          sd15: true,
          sdxl: true,
          flux: true,
          svd: true,
        },
      },
      motionPresets: {
        Static:      { translation_z: 0,   translation_x: 0,    translation_y: 0,   rotation_z: 0,  rotation_y: 0 },
        Orbit:       { translation_z: 2,   rotation_y: 15,      translation_x: 0,   translation_y: 0, rotation_z: 0 },
        Tunnel:      { translation_z: 5,   translation_x: 0,    translation_y: 0,   rotation_z: 0,  rotation_y: 0 },
        Handheld:    { translation_z: 0.5, translation_x: 0.2,  translation_y: 0.1, rotation_z: 2,  rotation_y: 0 },
        Chaos:       { translation_z: 1.5, translation_x: 0.5,  translation_y: 0.3, rotation_z: 5,  rotation_y: 10 },
        // rotation_3d_z gallery presets (wiki examples: ±1, ±2, ±4, ±8)
        'Spin +1':   { translation_z: 0, translation_x: 0, translation_y: 0, rotation_z: 1,  rotation_y: 0 },
        'Spin +2':   { translation_z: 0, translation_x: 0, translation_y: 0, rotation_z: 2,  rotation_y: 0 },
        'Spin +4':   { translation_z: 0, translation_x: 0, translation_y: 0, rotation_z: 4,  rotation_y: 0 },
        'Spin +8':   { translation_z: 0, translation_x: 0, translation_y: 0, rotation_z: 8,  rotation_y: 0 },
        'Spin -1':   { translation_z: 0, translation_x: 0, translation_y: 0, rotation_z: -1, rotation_y: 0 },
        'Spin -2':   { translation_z: 0, translation_x: 0, translation_y: 0, rotation_z: -2, rotation_y: 0 },
        'Spin -4':   { translation_z: 0, translation_x: 0, translation_y: 0, rotation_z: -4, rotation_y: 0 },
        // rotation_3d_y gallery presets (±0.5, ±1, ±2, ±3)
        'Yaw +0.5':  { translation_z: 0, translation_x: 0, translation_y: 0, rotation_z: 0, rotation_y: 0.5 },
        'Yaw +1':    { translation_z: 0, translation_x: 0, translation_y: 0, rotation_z: 0, rotation_y: 1 },
        'Yaw +2':    { translation_z: 0, translation_x: 0, translation_y: 0, rotation_z: 0, rotation_y: 2 },
        'Yaw +3':    { translation_z: 0, translation_x: 0, translation_y: 0, rotation_z: 0, rotation_y: 3 },
        'Yaw -1':    { translation_z: 0, translation_x: 0, translation_y: 0, rotation_z: 0, rotation_y: -1 },
        'Yaw -2':    { translation_z: 0, translation_x: 0, translation_y: 0, rotation_z: 0, rotation_y: -2 },
        // rotation_3d_x gallery presets (±0.5, ±1, ±2)
        'Pitch +0.5':{ translation_z: 0, translation_x: 0, translation_y: 0, rotation_z: 0, rotation_y: 0, rotation_x: 0.5 },
        'Pitch +1':  { translation_z: 0, translation_x: 0, translation_y: 0, rotation_z: 0, rotation_y: 0, rotation_x: 1 },
        'Pitch +2':  { translation_z: 0, translation_x: 0, translation_y: 0, rotation_z: 0, rotation_y: 0, rotation_x: 2 },
        'Pitch -1':  { translation_z: 0, translation_x: 0, translation_y: 0, rotation_z: 0, rotation_y: 0, rotation_x: -1 },
        // 2D translation gallery presets
        'Pan R':     { translation_z: 0, translation_x: 5,  translation_y: 0,  rotation_z: 0, rotation_y: 0 },
        'Pan L':     { translation_z: 0, translation_x: -5, translation_y: 0,  rotation_z: 0, rotation_y: 0 },
        'Pan Up':    { translation_z: 0, translation_x: 0,  translation_y: -5, rotation_z: 0, rotation_y: 0 },
        'Pan Down':  { translation_z: 0, translation_x: 0,  translation_y: 5,  rotation_z: 0, rotation_y: 0 },
        // 2D zoom gallery presets
        'Zoom Out':  { translation_z: -2, translation_x: 0, translation_y: 0, rotation_z: 0, rotation_y: 0 },
      },
      motionStyles: ["Calm", "Travel", "Spin", "Handheld", "Chaos"],
      motionStylesSaved: {},
      motionSelectedPreset: "Static",
      motionPadValues: { translation_x: 0, translation_y: 0, translation_z: 0, zoom: 1, rotation_z: 0, look_x: 0, look_y: 0 },
      motionSmoothness: {
        enabled: false,
        frames: 1,
      },
      motionPadSpringBack: true,
      xyPad: { dragging: false, activePad: null, padSize: 420, dragStartValues: null },
      motionXYPadSlots: [
        { id: 'primary', xAxis: 'translation_x', yAxis: 'translation_y' },
        { id: 'look', xAxis: 'angle', yAxis: 'zoom' },
      ],
      audio: { track: "", bpm: 114.8, uploadedFile: null, objectUrl: null },
      audioSpectrogramDataUrl: null,
      audioSpectrogramStatus: "",
      _spectrogramGen: 0,
      avSyncEnabled: false,
      avSyncLeadSec: 4,
      liveModSlotParamKeys: ['', '', '', '', '', '', '', ''],
      modulationMapPicker: null,
      mappingsActiveOnly: false,
      mappingsGroupTab: '',
      audioBeatMacrosCollapsed: true,
      audioStatus: "Idle",
      audioMappings: [
        { param: "strength", band: "low", freq_min: 20, freq_max: 250, out_min: 0, out_max: 1.5 },
        { param: "cfg", band: "mid", freq_min: 250, freq_max: 2000, out_min: 0, out_max: 30 },
        { param: "translation_z", band: "high", freq_min: 2000, freq_max: 8000, out_min: -5, out_max: 5 },
      ],
      audioMappingLevels: [0, 0, 0],
      audioSelectedMappingIndex: 0,
      audioBandPreviewIndex: -1,
      audioActiveBandTab: "low",
      audioSpectrumBins: [],
      _audioSpectrumPaintTs: 0,
      audioBandPresets: {
        sub: { label: "Sub", freq_min: 20, freq_max: 60 },
        bass: { label: "Bass", freq_min: 60, freq_max: 250 },
        lowmid: { label: "Lo-mid", freq_min: 250, freq_max: 500 },
        mid: { label: "Mid", freq_min: 500, freq_max: 2000 },
        high: { label: "High", freq_min: 2000, freq_max: 8000 },
        air: { label: "Air", freq_min: 8000, freq_max: 16000 },
      },
      lfoBpm: 120,
      modulationSelectedLfoId: 1,
      lfoTargets: [
        { key: "cfg", label: "Vibe (CFG)", min: 0, max: 30, default: 6, group: "Style" },
        { key: "strength", label: "Strength", min: 0, max: 1.5, default: 0.7, group: "Style" },
        { key: "noise_multiplier", label: "Noise/Glitch", min: 0, max: 3, default: 1.0, group: "Style" },
        { key: "translation_z", label: "Zoom", min: -10, max: 10, default: 0, group: "Camera" },
        { key: "translation_x", label: "Pan X", min: -10, max: 10, default: 0, group: "Camera" },
        { key: "translation_y", label: "Pan Y", min: -10, max: 10, default: 0, group: "Camera" },
        { key: "rotation_y", label: "Rotate Y", min: -180, max: 180, default: 0, group: "Camera" },
        { key: "rotation_z", label: "Tilt", min: -180, max: 180, default: 0, group: "Camera" },
        { key: "fov", label: "FOV", min: 1, max: 180, default: 70, group: "Camera" },
        // Deforum-native 3D schedule params (maps to rotation_3d_* in Deforum settings)
        { key: "rotation_3d_x", label: "Rotate X (3D)", min: -180, max: 180, default: 0, group: "Camera 3D", deforumKey: "rotation_3d_x" },
        { key: "rotation_3d_y", label: "Rotate Y (3D)", min: -180, max: 180, default: 0, group: "Camera 3D", deforumKey: "rotation_3d_y" },
        { key: "rotation_3d_z", label: "Rotate Z (3D)", min: -180, max: 180, default: 0, group: "Camera 3D", deforumKey: "rotation_3d_z" },
        { key: "zoom_2d", label: "Zoom (2D)", min: 0.5, max: 2.0, default: 1.0, group: "Camera 2D", deforumKey: "zoom" },
        { key: "angle_2d", label: "Angle (2D)", min: -90, max: 90, default: 0, group: "Camera 2D", deforumKey: "angle" },
        { key: "near_clip", label: "Near Clip", min: 1, max: 1000, default: 200, group: "Camera 3D", deforumKey: "near_schedule" },
        { key: "far_clip", label: "Far Clip", min: 100, max: 100000, default: 10000, group: "Camera 3D", deforumKey: "far_schedule" },
        { key: "cn_CN1_weight", label: "CN1 Weight", min: 0, max: 2, default: 0.4, group: "ControlNet" },
        { key: "cn_CN2_weight", label: "CN2 Weight", min: 0, max: 2, default: 0.4, group: "ControlNet" },
        { key: "cn_CN3_weight", label: "CN3 Weight", min: 0, max: 2, default: 0.4, group: "ControlNet" },
        { key: "cn_CN1_start", label: "CN1 Start", min: 0, max: 1, default: 0, group: "ControlNet" },
        { key: "cn_CN2_start", label: "CN2 Start", min: 0, max: 1, default: 0, group: "ControlNet" },
        { key: "cn_CN1_end", label: "CN1 End", min: 0, max: 1, default: 0.9, group: "ControlNet" },
        { key: "cn_CN2_end", label: "CN2 End", min: 0, max: 1, default: 0.9, group: "ControlNet" },
      ],
      animationTargets: [
        { key: "anim_instCount", field: "instCount", label: "Instance count", min: 1000, max: 50000, default: 12000, group: "Standby — Instancing" },
        { key: "anim_spread", field: "spread", label: "Spread", min: 0.2, max: 2.5, default: 0.68, group: "Standby — Instancing" },
        { key: "anim_speed", field: "speed", label: "Speed", min: 0.1, max: 2.5, default: 0.75, group: "Standby — Instancing" },
        { key: "anim_hue", field: "hue", label: "Hue", min: 0, max: 1, default: 0.6, group: "Standby — Instancing" },
        { key: "anim_glow", field: "glow", label: "Glow", min: 0.1, max: 1.4, default: 0.78, group: "Standby — Instancing" },
        { key: "anim_orbit", field: "orbit", label: "Orbit", min: 0, max: 1, default: 0.52, group: "Standby — Instancing" },
        { key: "anim_beamCount", field: "beamCount", label: "Beam count", min: 3, max: 12, default: 7, group: "Standby — Volume" },
        { key: "anim_pulse", field: "pulse", label: "Pulse", min: 0, max: 1, default: 0.36, group: "Standby — Volume" },
        { key: "anim_drift", field: "drift", label: "Drift", min: 0, max: 1, default: 0.44, group: "Standby — Volume" },
        { key: "anim_mist", field: "mist", label: "Mist", min: 0, max: 1, default: 0.58, group: "Standby — Nebula" },
        { key: "anim_lineWidth", field: "lineWidth", label: "Line width", min: 1, max: 10, default: 2.4, group: "Standby — Raycast" },
        { key: "anim_lineThreshold", field: "lineThreshold", label: "Line threshold", min: 0, max: 10, default: 0.8, group: "Standby — Raycast" },
        { key: "anim_lineTranslation", field: "lineTranslation", label: "Line translation", min: 0, max: 10, default: 0, group: "Standby — Raycast" },
        { key: "anim_mcNumBlobs", field: "mcNumBlobs", label: "Blob count", min: 1, max: 50, default: 10, group: "Standby — Marching" },
        { key: "anim_mcResolution", field: "mcResolution", label: "MC resolution", min: 14, max: 100, default: 28, group: "Standby — Marching" },
        { key: "anim_mcIsolation", field: "mcIsolation", label: "MC isolation", min: 10, max: 300, default: 80, group: "Standby — Marching" },
        { key: "anim_ocElevation", field: "ocElevation", label: "Sun elevation", min: 0, max: 90, default: 2, group: "Standby — Ocean" },
        { key: "anim_ocDistortion", field: "ocDistortion", label: "Distortion", min: 0, max: 8, default: 3.7, group: "Standby — Ocean" },
        { key: "anim_ocCloudCoverage", field: "ocCloudCoverage", label: "Cloud coverage", min: 0, max: 1, default: 0.4, group: "Standby — Ocean" },
      ],
      lfoShapes: ["Sine", "Triangle", "Saw", "Square"],
      lfos: Array.from({ length: 6 }).map((_, idx) => ({
        id: idx + 1,
        on: idx === 0,
        targets: idx === 0 ? ["cfg"] : [],
        shape: "Sine",
        bpm: 120,
        speed: 1.0,
        depth: 0.1,
        base: null,
        phase: 0,
        renderPhase: 0,
      })),
      macrosRack: [
        { id: "macro-0", on: true, target: "cfg", shape: "Sine", bpm: 120, depth: 0.7, offset: 0.1, show: true },
        { id: "macro-1", on: true, target: "translation_z", shape: "Saw", bpm: 90, depth: 0.6, offset: 0.2, show: false },
        { id: "macro-2", on: false, target: "noise_multiplier", shape: "Noise", bpm: 140, depth: 0.3, offset: 0.0, show: false },
        ],
      framesync: {
        presets: ["Basic Strength Schedule", "Basic Noise Schedule", "Basic Init"],
        factoryPresets: ["Basic Strength Schedule", "Basic Noise Schedule", "Basic Init"],
        selectedPreset: "Basic Strength Schedule",
        primaryWave: "Cosine",
        waveShapes: ["Cosine", "Sine", "Saw", "Triangle", "Square", "Noise"],
        amplitude: 1,
        shift: 0,
        bend: 1,
        noise: 0,
        fps: 24,
        frameCount: 120,
        bpm: 120,
        shiftFrames: 0,
        syncRates: ["1", "1/2", "1/4", "1/8", "1/16", "1/32", "2", "4", "8"],
        syncRate: "1/4",
        decimals: 2,
        metrics: [
          { label: "Max", value: "1.00", sub: "32bars" },
          { label: "Min", value: "-1.00", sub: "16bars" },
          { label: "Avg", value: "0.00", sub: "4bars" },
          { label: "Abs Avg", value: "0.63", sub: "1bar" },
          { label: "Duration", value: "5.00s", sub: "1/2" },
        ],
        timingTable: [
          { label: "32bar", time: "58.0s", frames: "1392.0" },
          { label: "16bar", time: "28.0s", frames: "768.0" },
          { label: "8bar", time: "16.0s", frames: "384.0" },
          { label: "4bar", time: "8.0s", frames: "192.0" },
          { label: "2bar", time: "4.0s", frames: "96.0" },
          { label: "1bar", time: "2.0s", frames: "48.0" },
          { label: "1/2", time: "1.0s", frames: "24.0" },
        ],
        featureCoverage: [
          "Wave presets",
          "LFO modulation",
          "Audio-driven sync",
          "Tempo & shift",
          "Metrics + timing table",
          "Preset import/export"
        ],
      },
      cn: {
        slots: [
          { id: "CN1", label: "CN1", model: "Canny", weight: 0.4, start: 0, end: 0.9, enabled: false, imageSource: "file" },
          { id: "CN2", label: "CN2 •", model: "Depth", weight: 0.4, start: 0, end: 0.9, enabled: false, imageSource: "file" },
          { id: "CN3", label: "CN3", model: "Pose", weight: 0.4, start: 0, end: 0.9, enabled: false, imageSource: "file" },
          { id: "CN4", label: "CN4", model: "Tile", weight: 0.4, start: 0, end: 0.9, enabled: false, imageSource: "file" },
          { id: "CN5", label: "CN5", model: "Control", weight: 0.4, start: 0, end: 0.9, enabled: false, imageSource: "file" },
        ],
        active: "CN2",
        availableModels: [],
        source: "unknown",
        webcamActive: false,
        webcamStream: null,
        webcamVideo: null,
        webcamCanvas: null,
        webcamCaptureInterval: null,
      },
      webcamCaptureRate: 500,
      midi: {
        supported: typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess,
        devices: [],
        selected: null,
        mappings: [
          { control: "LaunchControl CC21", cc: 21, key: "cfg" },
          { control: "LaunchControl CC22", cc: 22, key: "strength" },
          { control: "LaunchControl CC23", cc: 23, key: "cfgscale" },
        ],
      },
      keyBindings: {
        "translation_z": "w",
        "translation_x": "a",
        "translation_y": "s",
        "rotation_y": "d",
        "rotation_z": "q",
        "fov": "f",
        "cfg": "z",
        "strength": "x",
        "noise_multiplier": "c",
      },
      bindingLearnMode: false,
      bindingTargetKey: null,
      bindingLearnTimeout: null,
      midiStatus: "Ready",
      ws: null,
      wsStatus: "disconnected",
      wsReconnectTimer: null,
      streamSrc: "/hls/live/deforum.m3u8",
      hlsWatchEnabled: false,
      hlsPreviewStreamValid: false,
      standbyPreviewVideoUrl: "",
      defaultAnimation: {
        preferDeforumVideo: false,
        showStandbyClip: false,
        autoTransitionToDeforum: true,
        mode: 'customlights',
        instCount: 12000,
        beamCount: 7,
        speed: 0.75,
        spread: 0.68,
        glow: 0.78,
        hue: 0.6,
        pulse: 0.36,
        drift: 0.44,
        mist: 0.58,
        orbit: 0.52,
        lineType: 'segments',
        lineWidth: 2.4,
        lineThreshold: 0.8,
        lineTranslation: 0,
        lineWorldUnits: true,
        lineVisualizeThreshold: false,
        lineAlphaToCoverage: true,
        lineAnimate: true,
        mcMaterial: 'shiny',
        mcNumBlobs: 10,
        mcResolution: 28,
        mcIsolation: 80,
        mcFloor: true,
        mcWallX: false,
        mcWallZ: false,
        ocElevation: 2,
        ocAzimuth: 180,
        ocExposure: 0.1,
        ocDistortion: 3.7,
        ocSize: 1,
        ocCloudCoverage: 0.4,
        ocCloudDensity: 0.5,
        ocCloudElevation: 0.5,
        forgeLayerOpacity: 0,
        rememberCompositorLayerOnStartup: false,
        previewCompositorCrossfadeMs: 800,
        forgeLayerOpacityLfoLink: null,
        forgeLayerOpacityLfoBase: 0,
        deforumBackdropEnabled: true,
        deforumBackdropMix: 0.35,
      },
      frameRailRunId: null,
      thumbs: [],
      frameThumbLoadingKeys: {},
      framesTimer: null,
      playerEl: null,
      timeHandler: null,
      hls: null,
      videoReadyHandler: null,
      videoWaitingHandler: null,
      videoPlayHandler: null,
      videoPauseHandler: null,
      liveParamTimers: {},
      liveParamPending: {},
      lastParamSent: {},
      controlDelayMs: 75,
      errorHandler: null,
      playbackTimer: null,
      lfoTimer: null,
      lastLfoTick: null,
      beatTimer: null,
      lastBeatTime: null,
      beatCount: 0,
      beatPhase: 0,
      lastMacroTrigger: {},
      sequencer: { version: 1, durationSec: 8, fps: 24, loop: true, tracks: [], markers: [], clips: [], sourceVideo: null, bpmSync: false, bpm: 120, bars: 4, beatsPerBar: 4 },
      sequencerPlayhead: 0,
      jobPlaybackTimeSec: 0,
      sequencerPlaying: false,
      sequencerTimer: null,
      sequencerSaveName: "default_clip",
      sequencerLoadPick: "",
      sequencerList: [],
      sequencerStatus: "",
      sequencerNewParam: "translation_x",
      sequencerKeyframeVal: 0,
      sequencerMarkerName: "Scene",
      sequencerClipDurationSec: 2,
      sequencerSelectedTrackId: null,
      sequencerSelectedClipId: null,
      generateDockExpanded: false,
      motionSequencerSideOpen: false,
      selectedFrameIndex: -1,
      timelineHoverTime: null,
      timelineHoverPercent: 0,
      timelineCanvasCtx: null,
      lfoTargetPick: {},
      avSyncCollapsed: true,
      morphCollapsed: true,
      loraPickerOpen: false,
      loraCrossfaderPickerGroup: null,
      loraCrossfaderCollapsed: false,
      engineModelPickerOpen: false,
      engineModelPickerTab: 'sd15',
      forgeAdvancedCollapsed: true,
      storyResultCollapsed: false,
       lfoCanvasRefs: {},
       _lfoAnimFrame: null,
       runsAll: [],
       runsFiltered: [],
       runsFilter: { search: "", status: "", tag: "", model: "" },
       runsSort: { field: "started_at", order: "desc" },
       deforumBatches: [],
       deforumBatchesStatus: "",
       deforumBatchNodes: [],
       runsSelected: [],
       runsCompareFields: [
         'status', 'model', 'frame_count', 'seed', 'steps', 'strength', 'cfg', 'tag',
         'prompt_positive', 'prompt_negative', 'notes',
       ],
       runsDetailView: null,
       runsDetailTab: 'summary',
       runsDetailJsonShowDiffOnly: false,
       runsBrowserTab: 'active',
       runsStatus: "",
       runsAutoRefresh: true,
       runsPollIntervalSec: 5,
       _runsPollTimer: null,
       runsLaunching: false,
       runsJobLog: [],
       _runsJobLogSeq: 0,
       _runsActivityKey: '',
       runsLastRefreshedAt: null,
       genData: {
         defaultThemes: ['A journey through light', 'Neon cathedral', 'Ocean depths'],
         sceneDescriptors: { opening: ['ethereal', 'quiet'], buildup: ['rising', 'vivid'], climax: ['intense', 'surreal'], closing: ['soft', 'fading'] },
         environments: [['forest', 'meadow'], ['city', 'alley'], ['space', 'nebula']],
         lighting: ['golden hour', 'neon rim light', 'moonlit'],
         quality: ['masterpiece', 'best quality'],
         techSpecs: ['8k', 'sharp focus'],
         artists: { default: ['artgerm', 'greg rutkowski'], 'Masterpiece, Realistic': ['photorealistic'] },
         negatives: ['blurry', 'low quality'],
         cameraBehaviors: ['STATIC', 'ORBIT', 'TUNNEL'],
       },
     };
  },
  computed: {
    appViewModel() {
      return this;
    },
    gpuActiveCount() {
      return Math.max(0, Number(this.gpuPool && this.gpuPool.healthyNodes) || 0);
    },
    gpuTotalCount() {
      return Array.isArray(this.gpuPool && this.gpuPool.nodes) ? this.gpuPool.nodes.length : 0;
    },
    recentRunsRail() {
      const all = Array.isArray(this.runsAll) ? this.runsAll : [];
      return all
        .slice()
        .sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0))
        .slice(0, 4);
    },
    runsActiveGpuJobs() {
      const batches = Array.isArray(this.deforumBatches) ? this.deforumBatches : [];
      return batches
        .map((batch) => {
          const batchId = batch.batch_id || batch.id || batch.batchId || "";
          const rawStatus = String(batch.status || batch.state || "queued").toLowerCase();
          let status = rawStatus;
          if (rawStatus.includes("run") || rawStatus.includes("progress") || rawStatus.includes("generat")) status = "running";
          else if (rawStatus.includes("queue") || rawStatus.includes("pending") || rawStatus.includes("wait")) status = "queued";
          else if (rawStatus.includes("cancel")) status = "cancelled";
          else if (rawStatus.includes("fail") || rawStatus.includes("error")) status = "failed";
          else if (rawStatus.includes("complete") || rawStatus.includes("done") || rawStatus.includes("success")) status = "completed";
          return {
            batchId,
            runId: batchId ? `batch:${batchId}` : "",
            status,
            model: batch.model || batch.sd_model_name || batch.sd_model_checkpoint || "",
            frames: batch.frame_count ?? batch.frames ?? batch.max_frames ?? null,
            progress: batch.progress ?? batch.phase_progress ?? null,
            node: batch._node || null,
            nodeName: (batch._node && batch._node.name) || (batch._node && batch._node.url) || "forge",
            startedAt: batch.started_at || batch.created_at || batch.createdAt || null,
            _batch: batch,
          };
        })
        .filter((job) => job.batchId && (job.status === "queued" || job.status === "running"));
    },
    runsGpuNodeSummaries() {
      const forgeNodes = (this.gpuPool.nodes || []).filter((node) => node && node.enabled && node.backend === "sd-forge");
      const activeByNode = {};
      this.runsActiveGpuJobs.forEach((job) => {
        const key = (job.node && job.node.id) || job.nodeName || "unknown";
        if (!activeByNode[key]) activeByNode[key] = [];
        activeByNode[key].push(job);
      });
      if (forgeNodes.length) {
        return forgeNodes.map((node) => ({
          id: node.id,
          name: node.name || node.url,
          url: node.url,
          status: node.status,
          activeJobs: node.activeJobs,
          queueRunning: node.queueRunning,
          queuePending: node.queuePending,
          progress: node.progress,
          jobs: activeByNode[node.id] || [],
        }));
      }
      return (this.deforumBatchNodes || []).map((node) => ({
        id: node.id || node.url,
        name: node.name || node.url,
        url: node.url,
        status: null,
        activeJobs: (activeByNode[node.id || node.url] || []).length,
        queueRunning: null,
        queuePending: null,
        progress: null,
        jobs: activeByNode[node.id || node.url] || activeByNode[node.name || node.url] || [],
      }));
    },
    runsMonitorActive() {
      if (this.currentTab === 'RUNS') return true; // legacy redirect still uses this momentarily
      if (this.currentTab === 'SETTINGS' && (this.currentSubTab.SETTINGS === 'RUNS' || this.currentSubTab.SETTINGS === 'SYSTEM')) return true;
      return false;
    },
    runsLastRefreshedLabel() {
      if (!this.runsLastRefreshedAt) return '';
      try {
        return `Updated ${new Date(this.runsLastRefreshedAt).toLocaleTimeString()}`;
      } catch (_e) {
        return '';
      }
    },
    runsActiveList() {
      return (this.runsAll || []).filter((r) => r.status === 'running' || r.status === 'queued');
    },
    runsActiveRunningCount() {
      return this.runsActiveList.filter((r) => r.status === 'running').length;
    },
    runsActiveQueuedCount() {
      return this.runsActiveList.filter((r) => r.status === 'queued').length;
    },
    runsActiveWorkerCount() {
      const names = this.runsActiveList
        .map((r) => this.runWorkerName(r))
        .filter((n) => n && n !== '—');
      return new Set(names).size;
    },
    runsActiveSummaryLabel() {
      const running = this.runsActiveRunningCount;
      const queued = this.runsActiveQueuedCount;
      const workers = this.runsActiveWorkerCount;
      const workerPart = workers ? ` · ${workers} worker${workers === 1 ? '' : 's'}` : '';
      return `${running} running · ${queued} queued${workerPart}`;
    },
    runsPastCount() {
      return (this.runsAll || []).filter((r) => r.status !== 'running' && r.status !== 'queued').length;
    },
    rtmpStreamHref() {
      const nodes = this.infrastructure && Array.isArray(this.infrastructure.transcoders)
        ? this.infrastructure.transcoders
        : [];
      const primary = nodes.find((n) => n && n.rtmpTarget) || nodes[0];
      if (primary && primary.rtmpTarget) return primary.rtmpTarget;
      return 'rtmp://vimage3:1935/live/deforum';
    },
    hlsStreamHref() {
      return '/hls/live/deforum.m3u8';
    },
    frameStripThumbs() {
      const runId = this.frameRailRunId;
      const detail = this.runsDetailView;
      if (
        runId
        && detail
        && detail.run_id === runId
        && Array.isArray(detail.frames)
        && detail.frames.length
      ) {
        return detail.frames.map((name, idx) => {
          const frameName = String(name);
          const src = `/api/runs/${encodeURIComponent(detail.run_id)}/frames/${encodeURIComponent(frameName)}`;
          return { name: frameName, src, url: src, path: src, frame: idx + 1 };
        });
      }
      return (this.thumbs || []).filter((thumb) => !!(thumb && (thumb.src || thumb.url || thumb.path)));
    },
    frameRailSourceLabel() {
      const runId = this.frameRailRunId;
      if (!runId) return '';
      return `Run ${runId}`;
    },
    framesEmptyStatus() {
      const forgeUp = !!(this.forge && this.forge.available) || !!(this.apiHealth && this.apiHealth.sdForge && this.apiHealth.sdForge.available);
      if (!forgeUp) {
        return {
          label: 'Waiting for frames…',
          detail: 'Unknown (offline)',
          kind: 'unknown',
        };
      }
      const nextPollMs = Math.max(0, Number(this.framesRefreshBackoffMs) || 0);
      const etaSec = nextPollMs ? Math.max(1, Math.round(nextPollMs / 1000)) : 0;
      if (this.previewGenerating) {
        const pctLabel = this.previewProgressPct != null ? `${this.previewProgressPct}%` : null;
        return {
          label: pctLabel ? `Rendering · ${pctLabel}` : 'Rendering…',
          detail: this.forgeLivePreviewImage ? 'Live Forge preview' : (etaSec ? `Next check ~${etaSec}s` : 'Checking soon'),
          kind: 'loading',
        };
      }
      if (this.deforumPlaying) {
        return {
          label: 'Animating…',
          detail: etaSec ? `Next check ~${etaSec}s` : 'Checking soon',
          kind: 'loading',
        };
      }
      return {
        label: 'Waiting for frames…',
        detail: etaSec ? `Next check ~${etaSec}s` : 'Checking soon',
        kind: 'loading',
      };
    },
    selectedFrameThumb() {
      if (!this.frameStripThumbs.length) return null;
      if (!Number.isFinite(Number(this.selectedFrameIndex))) return this.frameStripThumbs[this.frameStripThumbs.length - 1] || null;
      const index = Math.min(this.frameStripThumbs.length - 1, Math.max(0, Number(this.selectedFrameIndex)));
      return this.frameStripThumbs[index] || null;
    },
    selectedFrameLabel() {
      return this.selectedFrameThumb ? `Frame ${this.frameLabel(this.selectedFrameThumb)}` : 'No frames';
    },
    currentProjectLabel() {
      return String(this.session || '').trim() || 'Project';
    },
    currentBatchLabel() {
      return String((this.deforumSettings && this.deforumSettings.batch_name) || '').trim() || '—';
    },
    deforumGeneratedFrameCount() {
      return this.frameStripThumbs.length;
    },
    deforumStreamFrameLabel() {
      const count = this.deforumGeneratedFrameCount;
      if (!count) return '';
      const latest = this.frameStripThumbs[count - 1];
      const latestNum = latest ? this.frameLabel(latest) : count;
      if (count === 1) return `1 frame generated (#${latestNum})`;
      return `${count} frames generated · latest #${latestNum}`;
    },
    deforumContinuationCanUndo() {
      return canUndoContinuation(this.deforumContinuationCheckpoints) && !this.deforumPlaying;
    },
    deforumContinuationUndoTitle() {
      const stack = this.deforumContinuationCheckpoints || [];
      if (stack.length < 2) {
        return 'Undo last animation segment (available after pausing with new frames)';
      }
      const prev = stack[stack.length - 2];
      return `Undo to frame ${prev.frame}, then change settings and Play to redo`;
    },
    latestGeneratedFramePath() {
      const thumbs = this.frameStripThumbs;
      if (!thumbs.length) return '';
      const latest = thumbs[thumbs.length - 1];
      return (latest && (latest.src || latest.url || latest.path)) || '';
    },
    activePreviewStillPath() {
      if (this.deforumPlaying) {
        return this.latestGeneratedFramePath
          || this.performance.lastPreviewPath
          || this.generator.lastPath
          || (this.selectedFrameThumb && (this.selectedFrameThumb.src || this.selectedFrameThumb.url || this.selectedFrameThumb.path))
          || '';
      }
      if (this.currentTab === 'LIVE') {
        return this.performance.lastPreviewPath
          || this.generator.lastPath
          || (this.selectedFrameThumb && (this.selectedFrameThumb.src || this.selectedFrameThumb.url || this.selectedFrameThumb.path))
          || '';
      }
      if (!this.showMotionSequencerDock && this.selectedFrameThumb) {
        return this.selectedFrameThumb.src
          || this.selectedFrameThumb.url
          || this.selectedFrameThumb.path
          || this.performance.lastPreviewPath
          || this.generator.lastPath
          || '';
      }
      return this.performance.lastPreviewPath || this.generator.lastPath || '';
    },
    displayedPreviewStillPath() {
      if (this.previewGenerating && this.forgeLivePreviewImage) return this.forgeLivePreviewImage;
      if (this.heldPreviewFramePath) return this.heldPreviewFramePath;
      return this.activePreviewStillPath;
    },
    showFrameProcessing() {
      if (this.previewGenerating) return true;
      if (this.isWebglSoloPreview) return false;
      if (this.deforumPlaying && !this.showDeforumVideo && !!this.displayedPreviewStillPath) return true;
      return false;
    },
    /** Full-screen overlay only on still frames — never on WebGL / standby video. */
    showFrameProcessingOnStage() {
      if (!this.showFrameProcessing) return false;
      if (this.isWebglSoloPreview) return false;
      if (this.previewGenerating && this.forgeLivePreviewImage) return false;
      if (this.showPreviewStill) return true;
      if (this.deforumPlaying && !this.showDeforumVideo && !!this.displayedPreviewStillPath) return true;
      return false;
    },
    /** Status in header + Live controls while the stage keeps animating underneath. */
    showFrameProcessingInChrome() {
      // Preview-generating progress is shown on the Frame button itself; suppress the top-bar chip
      return this.showFrameProcessing && !this.showFrameProcessingOnStage && !this.previewGenerating;
    },
    frameProcessingLabel() {
      if (this.previewGenerating) {
        if (this.previewProgressPct != null) {
          return `Rendering preview frame · ${this.previewProgressPct}%`;
        }
        return 'Rendering preview frame';
      }
      if (this.deforumPlaying) return 'Generating frames';
      return 'Processing';
    },
    frameProcessingHint() {
      if (this.previewGenerating) {
        if (this.forgeLivePreviewImage) {
          return 'Showing live Forge preview while the frame finishes.';
        }
        return 'Keeping the current frame visible until the new preview is ready.';
      }
      if (this.deforumPlaying) {
        return 'Keeping the last frame on screen until the live feed is ready.';
      }
      return 'Processing…';
    },
    showMotionSequencerDock() {
      return this.currentTab === 'MOTION' || this.currentTab === 'GENERATE';
    },
    showRightPanel() {
      return this.rightPanelOpen;
    },
    showEngineDrawerShell() {
      return !this.libraryWorkspaceOpen;
    },
    libraryEditorOpen: {
      get() {
        return this.libraryWorkspaceOpen && this.libraryWorkspacePane === 'editor';
      },
      set(value) {
        if (value) {
          this.libraryWorkspaceOpen = true;
          this.libraryWorkspacePane = 'editor';
        } else if (this.libraryWorkspacePane === 'editor') {
          this.libraryWorkspaceOpen = false;
        }
      },
    },
    edgeDockOverlayMode() {
      if (this.libraryWorkspaceOpen) return false;
      if (this.videoStageSize === 'full') return true;
      return this.viewportWidth < 1360;
    },
    edgeDockSingleRightPanel() {
      return this.viewportWidth < 920;
    },
    rightPanelEdgeLabel() {
      const labels = {
        LIVE: 'Live',
        PROMPTS: 'Prompts',
        MOTION: 'Motion',
        GENERATE: 'Generate',
        MODULATION: 'Mod',
        AUDIO: 'Audio',
        SETTINGS: 'Settings',
        RUNS: 'Runs',
      };
      return labels[this.currentTab] || 'Panel';
    },
    sidePanelUsesEdgeDock() {
      return true;
    },
    rightPanelToggleIcon() {
      return this.rightPanelOpen ? 'chevron-up' : 'chevron-down';
    },
    rightPanelToggleTitle() {
      if (this.sidePanelUsesEdgeDock) {
        return this.rightPanelOpen ? 'Collapse panel' : 'Expand panel';
      }
      return this.rightPanelOpen ? 'Collapse controls' : 'Show controls';
    },
    contextPanelChevronIcon() {
      return this.rightPanelOpen ? 'chevron-left' : 'chevron-right';
    },
    contextPanelToggleLabel() {
      return this.rightPanelOpen ? 'Hide controls panel' : 'Show controls panel';
    },
    engineDrawerToggleLabel() {
      return this.liveEngineDrawerOpen ? 'Hide engine panel' : 'Show engine panel';
    },
    engineDrawerChevronIcon() {
      return this.liveEngineDrawerOpen ? 'chevron-right' : 'chevron-left';
    },
    layersSidebarToggleLabel() {
      return this.layersSidebarOpen ? 'Hide layers panel' : 'Show layers panel';
    },
    layersSidebarChevronIcon() {
      return this.layersSidebarOpen ? 'chevron-right' : 'chevron-left';
    },
    shouldAutoRevealDeforumVideo() {
      if (!this.showMainStageHls) return false;
      if (!this.isDeforumLayerActive && !this.isBlendLayerActive) return false;
      return this.deforumGeneratedFrameCount > 0 || (this.deforumPlaying && this.videoReady);
    },
    deforumLayerAutoFadeIn() {
      if (!this.showDeforumVideo || !this.shouldAutoRevealDeforumVideo) return false;
      const layer = this.findVideoLayer('deforum');
      return layer ? this.readVideoLayerOpacity(layer) <= 0.001 : false;
    },
    sidePanelDockStyle() {
      if (this.sidePanelUsesEdgeDock) return null;
      const b = this.sidePanelDockBounds || {};
      const top = Number(b.top);
      const left = Number(b.left);
      const height = Number(b.height);
      if (!Number.isFinite(height) || height < 8) return null;
      return {
        top: `${Number.isFinite(top) ? top : 0}px`,
        left: `${Number.isFinite(left) ? left : 0}px`,
        height: `${height}px`,
      };
    },
    canStartHlsWatch() {
      return this.hlsPreviewStreamValid && !this.hlsWatchEnabled;
    },
    showMainStageHls() {
      return this.hlsWatchEnabled;
    },
    showDeforumVideo() {
      if (!this.showMainStageHls) return false;
      if (this.isBlendLayerActive) {
        if (!this.layerKindVisible('blend') && !this.shouldAutoRevealDeforumVideo) return false;
      } else if (this.isForgeAnimationLayerActive) {
        const kind = this.activeVideoLayer?.kind;
        if (!this.layerKindVisible(kind) && !(kind === 'deforum' && this.shouldAutoRevealDeforumVideo)) return false;
      } else {
        return false;
      }
      if (this.isWebglLayerActive && !this.isBlendLayerActive) return false;
      if (!this.isForgeAnimationLayerActive && !this.isBlendLayerActive) return false;
      if (!this.videoReady) return false;
      return this.deforumPlaying || this.deforumGeneratedFrameCount > 0;
    },
    showStandbyPreviewVideo() {
      if (!this.standbyPreviewVideoUrl) return false;
      const showClip = !!(this.defaultAnimation && this.defaultAnimation.showStandbyClip);
      if (!showClip && !this.showMainStageHls) return false;
      if (this.libraryWorkspaceOpen) return false;
      if (this.showLayerInputVideo) return false;
      if (this.showPreviewStill) return false;
      return true;
    },
    showDefaultAnimation() {
      if (this.showStandbyPreviewVideo) return false;
      if (this.showPreviewStill) return false;
      if (this.isBlendLayerActive) return this.layerKindVisible('webgl');
      if (this.isWebglLayerActive) return this.layerKindVisible('webgl');
      if (this.isForgeAnimationLayerActive) return !this.showDeforumVideo && this.layerKindVisible('webgl');
      if (!this.activeLayerPlaybackUrl && !this.showLayerInputVideo) return this.layerKindVisible('webgl');
      return false;
    },
    activeVideoLayer() {
      const layers = Array.isArray(this.videoLayers) ? this.videoLayers : [];
      return layers.find((layer) => layer.id === this.activeVideoLayerId) || layers[0] || null;
    },
    activePromptStyle() {
      if (!this.activePromptStyleId) return null;
      return (this.promptStyles || []).find((style) => style.id === this.activePromptStyleId) || null;
    },
    jobStyleSummary() {
      return promptStyleJobSummary(this.buildPromptStyleJobSnapshot());
    },
    seedRandomEnabled() {
      return Number(this.deforumSettings?.seed) === -1;
    },
    filteredPromptStyles() {
      const q = String(this.promptStyleSearch || "").trim().toLowerCase();
      const list = Array.isArray(this.promptStyles) ? this.promptStyles : [];
      if (!q) return list;
      return list.filter(
        (style) =>
          String(style.name || "").toLowerCase().includes(q)
          || String(style.positive || "").toLowerCase().includes(q)
          || String(style.negative || "").toLowerCase().includes(q),
      );
    },
    builtinEngineLayers() {
      return (Array.isArray(this.videoLayers) ? this.videoLayers : []).filter((layer) => layer && layer.builtin);
    },
    runningPreviewVideoLayers() {
      const layers = Array.isArray(this.videoLayers) ? this.videoLayers : [];
      return layers.filter(
        (layer) => layer && layer.builtin && this.isVideoLayerPreviewVisible(layer) && this.isVideoLayerRunning(layer),
      );
    },
    isWebglLayerActive() {
      return this.activeVideoLayer?.kind === 'webgl';
    },
    /** WebGL selected alone — no Deforum/WAN still or dim overlay on the stage. */
    isWebglSoloPreview() {
      return this.isWebglLayerActive && !this.isBlendLayerActive;
    },
    showForgeOverWebgl() {
      if (this.isWebglSoloPreview) return false;
      return this.isBlendLayerActive || this.isForgeAnimationLayerActive;
    },
    effectiveForgeLayerOpacity() {
      if (this.isWebglSoloPreview) return 0;
      const layer = this.activeVideoLayer;
      if (layer && (layer.kind === 'deforum' || layer.kind === 'wan' || layer.kind === 'svd' || layer.kind === 'blend')) {
        const stored = this.readVideoLayerOpacity(layer);
        if (this.isVideoLayerPreviewVisible(layer) && stored <= 0.001) {
          if (layer.kind === 'deforum' && this.shouldAutoRevealDeforumVideo) return 1;
          if (!this.isVideoLayerPreviewVisible(layer) || !this.layerKindVisible(layer.kind)) return 0;
        } else if (!this.layerKindVisible(layer.kind)) {
          return 0;
        }
        return stored;
      }
      const raw = Number(this.defaultAnimation?.forgeLayerOpacity);
      return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
    },
    webglLayerStyle() {
      return this.videoLayerRenderStyle('webgl');
    },
    inputLayerStyle() {
      return this.videoLayerRenderStyle('input');
    },
    forgeOverlayStyle() {
      const opacity = this.effectiveForgeLayerOpacity;
      const ms = Math.max(
        0,
        Math.min(5000, Math.round(Number(this.defaultAnimation?.previewCompositorCrossfadeMs) || 800)),
      );
      if (opacity <= 0) {
        return {
          opacity: '0',
          visibility: 'hidden',
          pointerEvents: 'none',
          transition: `opacity ${ms}ms ease, visibility 0s linear ${ms}ms`,
        };
      }
      return {
        opacity: String(opacity),
        visibility: 'visible',
        pointerEvents: 'none',
        transition: `opacity ${ms}ms ease`,
      };
    },
    previewStageStyle() {
      const ms = Math.max(
        0,
        Math.min(5000, Math.round(Number(this.defaultAnimation?.previewCompositorCrossfadeMs) || 800)),
      );
      const forgeOpacity = this.effectiveForgeLayerOpacity;
      return {
        '--preview-compositor-crossfade-ms': `${ms}ms`,
        '--preview-forge-layer-opacity': String(forgeOpacity),
      };
    },
    isDeforumLayerActive() {
      return this.activeVideoLayer?.kind === 'deforum';
    },
    isWanLayerActive() {
      return this.activeVideoLayer?.kind === 'wan';
    },
    isAnimateLcmLayerActive() {
      return this.activeVideoLayer?.kind === 'animatelcm';
    },
    isSvdLayerActive() {
      return this.activeVideoLayer?.kind === 'svd';
    },
    animateLcmMotionTypes() {
      return ANIMATELCM_MOTION_TYPES;
    },
    animateLcmMotionLoras() {
      return ANIMATELCM_MOTION_LORAS;
    },
    animateLcmControlFields() {
      return ANIMATELCM_CONTROL_FIELDS;
    },
    svdEngineControlFields() {
      return visibleSvdControlFields(this.svdEngine);
    },
    svdPresetNames() {
      return SVD_PRESET_NAMES;
    },
    svdEngineSummary() {
      return svdEngineSummary(this.svdEngine);
    },
    isForgeAnimationLayerActive() {
      const kind = this.activeVideoLayer?.kind;
      return kind === 'deforum' || kind === 'wan' || kind === 'animatelcm' || kind === 'svd';
    },
    activeAnimationPlugin() {
      return pluginByLayerKind(this.activeVideoLayer?.kind) || null;
    },
    activeAnimationPluginId() {
      return this.activeAnimationPlugin?.id || null;
    },
    wanEngineControlFields() {
      return visibleWanControlFields(this.wanEngine);
    },
    wanSpeedPresetNames() {
      return WAN_SPEED_PRESET_NAMES;
    },
    wanMotionPresetNames() {
      return WAN_MOTION_PRESET_NAMES;
    },
    wanMotionLoras() {
      return WAN_MOTION_LORAS;
    },
    wanDownloadPackages() {
      return WAN_DOWNLOAD_PACKAGES;
    },
    wanI2vModelOptions() {
      return WAN_I2V_MODEL_OPTIONS;
    },
    activeWanMotionLoras() {
      return Array.isArray(this.wanEngine?.motion_loras) ? this.wanEngine.motion_loras : [];
    },
    isBlendLayerActive() {
      return this.activeVideoLayer?.kind === 'blend';
    },
    isInputLayerActive() {
      return this.activeVideoLayer?.kind === 'input';
    },
    activeLayerPlaybackUrl() {
      const layer = this.activeVideoLayer;
      if (!layer) return '';
      if (layer.kind === 'input') return this.inputLayerPlaybackUrl || layer.playbackUrl || '';
      if (layer.kind === 'library') return layer.playbackUrl || '';
      return '';
    },
    showLayerInputVideo() {
      const layer = this.activeVideoLayer;
      if (!layer || !this.activeLayerPlaybackUrl) return false;
      if (!this.layerKindVisible('input')) return false;
      return layer.kind === 'input' || layer.kind === 'library';
    },
    appView() {
      return this;
    },
    videoLayerStatusLabel() {
      const layer = this.activeVideoLayer;
      if (!layer) return '—';
      if (layer.kind === 'webgl') return 'WebGL engine';
      if (layer.kind === 'blend') {
        if (this.showDeforumVideo) return 'WebGL + Deforum';
        return 'WebGL · waiting for Deforum';
      }
      if (layer.kind === 'deforum') {
        const frames = this.deforumGeneratedFrameCount;
        const frameSuffix = frames ? ` · ${frames} frame${frames === 1 ? '' : 's'}` : '';
        if (this.showDeforumVideo) return `Deforum live${frameSuffix}`;
        if (this.videoReady) return `Deforum ready${frameSuffix}`;
        if (this.deforumPlaying) return `Deforum warming up${frameSuffix}`;
        return frames ? `Deforum · ${frames} frame${frames === 1 ? '' : 's'}` : 'Waiting for Deforum';
      }
      if (layer.kind === 'wan') {
        const frames = this.deforumGeneratedFrameCount;
        const frameSuffix = frames ? ` · ${frames} frame${frames === 1 ? '' : 's'}` : '';
        const model = String(this.wanEngine?.wan_t2v_model || 'Wan').trim();
        if (this.showDeforumVideo) return `WAN live · ${model}${frameSuffix}`;
        if (this.deforumPlaying) return `WAN generating · ${model}${frameSuffix}`;
        return `WAN Video · ${model}`;
      }
      if (layer.kind === 'svd') {
        const frames = this.deforumGeneratedFrameCount;
        const frameSuffix = frames ? ` · ${frames} frame${frames === 1 ? '' : 's'}` : '';
        const summary = this.svdEngineSummary;
        const ckpt = String(this.svdEngine?.svd_checkpoint || 'SVD').trim();
        if (this.showDeforumVideo) return `SVD live · ${summary?.modelFamily || 'SVD'}${frameSuffix}`;
        if (this.deforumPlaying) return `SVD generating · ${ckpt}${frameSuffix}`;
        return `SVD · ${summary?.modelFamily || ckpt}`;
      }
      if (layer.kind === 'animatelcm') {
        return this.deforumPlaying ? 'AnimateLCM · generating' : 'AnimateLCM · idle';
      }
      if (layer.kind === 'input') {
        return this.activeLayerPlaybackUrl ? `Input · ${this.inputLayerLabel || 'Video'}` : 'Input · no source';
      }
      if (layer.kind === 'library') return `Layer · ${layer.label || 'Video'}`;
      if (layer.kind === 'cloud') return `Cloud · ${layer.label || 'Link'}`;
      return layer.label || 'Layer';
    },
    showPreviewStill() {
      if (this.isWebglSoloPreview) return false;
      const layer = this.activeVideoLayer;
      if (layer && (layer.kind === 'deforum' || layer.kind === 'wan' || layer.kind === 'svd' || layer.kind === 'blend')) {
        const stored = this.readVideoLayerOpacity(layer);
        if (stored <= 0.001 && (this.showDeforumVideo || this.shouldAutoRevealDeforumVideo)) return false;
      } else if (this.effectiveForgeLayerOpacity <= 0) {
        return false;
      }
      const shouldSurfaceStill = this.currentTab !== 'LIVE'
        || this.isForgeAnimationLayerActive
        || this.isBlendLayerActive
        || (this.previewGenerating && !!this.forgeLivePreviewImage);
      return !!(!this.showDeforumVideo && this.displayedPreviewStillPath && shouldSurfaceStill);
    },
    backgroundAudioMetrics() {
      const levels = Array.isArray(this.audioMappingLevels) ? this.audioMappingLevels.map((value) => Math.max(0, Math.min(1, Number(value) || 0))) : [];
      const bass = levels[0] || 0;
      const mid = levels[1] || 0;
      const treble = levels[2] || 0;
      const level = levels.length ? levels.reduce((sum, value) => sum + value, 0) / levels.length : 0;
      const referencePlaying = this.audioSpectrumPlaying;
      return {
        active: level > 0.01 || referencePlaying,
        level,
        bass,
        mid,
        treble,
        pulse: Math.min(1, bass * 0.7 + level * 0.3),
      };
    },
    availableOllamaNodes() {
      return (this.gpuPool.nodes || []).filter((node) => node && node.enabled && node.backend === 'ollama');
    },
    healthyOllamaNodes() {
      return this.availableOllamaNodes.filter((node) => node.status === 'healthy');
    },
    storyOllamaStatusLabel() {
      const healthy = this.healthyOllamaNodes;
      if (healthy.length) {
        const primary = healthy[0];
        const model = primary.model || primary.currentModel;
        const name = primary.name || primary.url || 'Ollama';
        const suffix = healthy.length > 1 ? ` (+${healthy.length - 1} more)` : '';
        return model ? `Ollama ready — ${model} on ${name}${suffix}` : `Ollama ready — ${name}${suffix}`;
      }
      const configured = this.availableOllamaNodes;
      if (configured.length) {
        const node = configured[0];
        return `Ollama unreachable — ${node.name || node.url}`;
      }
      if (this.gpuPool && this.gpuPool.loading) return 'Checking Ollama…';
      return 'Ollama not configured';
    },
    storyOllamaStatusTone() {
      if (this.healthyOllamaNodes.length) return 'ready';
      if (this.availableOllamaNodes.length) return 'warn';
      return 'off';
    },
    storyOllamaNeedsConfigure() {
      return this.healthyOllamaNodes.length === 0;
    },
    storyGeneratorSourceLabel() {
      const activeResult = this.generator && this.generator.result && this.generator.result.source;
      if (activeResult && activeResult.model) {
        return `Ollama ${activeResult.model}${activeResult.node && activeResult.node.name ? ' on ' + activeResult.node.name : ''}`;
      }
      const firstNode = this.availableOllamaNodes[0];
      if (firstNode) {
        return `Ollama ${firstNode.model || firstNode.currentModel || firstNode.name}`;
      }
      return 'Local fallback';
    },
    storyGeneratorStatusLabel() {
      if (this.generator.isGenerating) return 'Generating';
      if (this.generator.result) return 'Ready';
      return 'Idle';
    },
    storyGeneratorStatusLive() {
      return !!this.generator.isGenerating || !!this.generator.result;
    },
    storyGeneratorSceneCount() {
      return Math.max(2, Number(this.generator.numScenes) || 4);
    },
    storyGeneratorFrameCount() {
      return Number(this.deforumSettings && this.deforumSettings.max_frames)
        || Number(this.generator.totalFrames)
        || 96;
    },
    storyGeneratorFps() {
      return this.masterFps;
    },
    storyGeneratorSceneMeta() {
      const scenes = this.storyGeneratorSceneCount;
      const frames = this.storyGeneratorFrameCount;
      return `~${Math.ceil(frames / scenes)} frames per scene`;
    },
    storyGeneratorTimelineMeta() {
      const fps = this.storyGeneratorFps;
      const frames = this.storyGeneratorFrameCount;
      return `${(frames / fps).toFixed(1)}s timeline`;
    },
    storyLlmRequestJsonForUi() {
      const log = this.generator && this.generator.llmRequestLog;
      if (!log || !log.ollamaRequest) return '';
      return stableJsonStringify(log.ollamaRequest);
    },
    runsJobLogStoryOllamaJson() {
      const entry = (this.runsJobLog || []).find((row) => row.kind === 'story_llm_request' && row.ollamaRequest);
      if (!entry) return '';
      return stableJsonStringify(entry.ollamaRequest);
    },
    storyGeneratorResolutionLabel() {
      const w = Number(this.deforumSettings && this.deforumSettings.W)
        || Number((this.generator.resolution || '1024x576').split('x')[0])
        || 1024;
      const h = Number(this.deforumSettings && this.deforumSettings.H)
        || Number((this.generator.resolution || '1024x576').split('x')[1])
        || 576;
      return `${w}×${h}`;
    },
    promptMorphBlendLinkedLfo() {
      const id = Number(this.prompts.morphBlendLfoLink || 0);
      if (!id) return null;
      return this.lfos.find((lfo) => lfo.id === id) || null;
    },
    promptMorphBlendLinkStatus() {
      const lfo = this.promptMorphBlendLinkedLfo;
      if (!lfo) return 'Manual control';
      return lfo.on ? `Linked to LFO ${lfo.id}` : `Linked to LFO ${lfo.id} (currently off)`;
    },
    loraCrossfaderLinkedLfo() {
      const id = Number(this.prompts.loraCrossfaderLfoLink || 0);
      if (!id) return null;
      return this.lfos.find((lfo) => lfo.id === id) || null;
    },
    loraCrossfaderLinkStatus() {
      const lfo = this.loraCrossfaderLinkedLfo;
      if (!lfo) return 'Manual control';
      return lfo.on ? `Linked to LFO ${lfo.id}` : `Linked to LFO ${lfo.id} (currently off)`;
    },
    currentLoraModelFamily() {
      return this.detectModelFamilyFromValue(
        this.forge.modelInfo,
        this.forge.currentModel || this.forge.selectedModel || this.forge.lastModel
      );
    },
    currentLoraModelFamilyLabel() {
      const labels = { sd15: 'SD1.5', sdxl: 'SDXL', flux: 'FLUX', zimage: 'Z-Image', svd: 'SVD' };
      return labels[this.currentLoraModelFamily] || 'Unknown';
    },
    loraBrowserFamilies() {
      const defs = [
        { key: 'sd15', label: 'SD1.5' },
        { key: 'sdxl', label: 'SDXL' },
        { key: 'flux', label: 'FLUX' },
        { key: 'svd', label: 'SVD' },
      ];
      const active = this.currentLoraModelFamily;
      return defs
        .map((family) => ({
          ...family,
          items: this.loras.available.filter((lora) => (lora.family || 'sd15') === family.key),
          compatible: !active || active === family.key,
          collapsed: this.loras.familyCollapsed[family.key] !== false,
        }))
        .filter((family) => !active || family.compatible);
    },
    compatibleLoraFamilies() {
      return this.loraBrowserFamilies
        .map((family) => ({ ...family, items: family.items.filter(Boolean) }))
        .filter((family) => family.items.length);
    },
    videoSwarmIsCloudRoot() {
      return this.isCloudStorageRoot(this.systemFiles.rootId);
    },
    videoSwarmIsVideosOnly() {
      return this.systemFiles.viewMode === 'videos-only';
    },
    videoSwarmCloudPathLabel() {
      const src = this.systemFiles.cloudSource;
      if (!src) return 'Cloud storage';
      return `${this.cloudProviderLabel(src.provider)} — ${src.label}`;
    },
    videoSwarmDisplayFolders() {
      if (this.videoSwarmIsVideosOnly || this.videoSwarmIsCloudRoot) return [];
      return Array.isArray(this.systemFiles.folders) ? this.systemFiles.folders : [];
    },
    videoSwarmDisplayVideos() {
      const list = Array.isArray(this.systemFiles.videos) ? this.systemFiles.videos : [];
      return list.slice(this.videoSwarmVisibleStart, this.videoSwarmVisibleEnd);
    },
    videoSwarmFullscreenVideo() {
      const list = this.systemFiles.videos || [];
      const idx = this.systemFiles.fullscreenIndex;
      return idx >= 0 && idx < list.length ? list[idx] : null;
    },
    loraCrossfaderReady() {
      return this.loras.groupA.length > 0 && this.loras.groupB.length > 0;
    },
    loraCrossfaderBlending() {
      return !!this.prompts.loraCrossfaderOn && this.loraCrossfaderReady;
    },
    loraCrossfaderStatusLabel() {
      return this.prompts.loraCrossfaderOn ? 'Enabled' : 'Disabled';
    },
    loraCrossfaderSummary() {
      const aCount = this.loras.groupA.length;
      const bCount = this.loras.groupB.length;
      const aMix = ((1 - this.prompts.crossfaderValue) * 100).toFixed(0);
      const bMix = (this.prompts.crossfaderValue * 100).toFixed(0);
      if (!this.prompts.loraCrossfaderOn) {
        return 'Crossfader is off. Click Enabled to blend A/B LoRA groups.';
      }
      if (!aCount && !bCount) {
        return 'Assign LoRAs to A and B groups to crossfade.';
      }
      if (!this.loraCrossfaderReady) {
        return `Needs LoRAs in both groups. Current assignment: A ${aCount}, B ${bCount}.`;
      }
      return `A ${aCount} · B ${bCount} · mix ${aMix}% / ${bMix}%`;
    },
    modelStatusKind() {
      if (this.forge.switching || this.forge.loading) return 'loading';
      if (this.forge.available || (this.apiHealth.sdForge && this.apiHealth.sdForge.available)) return 'ready';
      return 'offline';
    },
    modelStatusLabel() {
      if (this.modelStatusKind === 'loading') return 'Loading';
      if (this.modelStatusKind === 'ready') return 'Ready';
      return 'Offline';
    },
    engineCurrentModelName() {
      return this.normalizeModelName(
        (this.deforumSettings && this.deforumSettings.sd_model_name)
        || this.forge.currentModel
        || this.forge.selectedModel
        || this.forge.lastModel
      );
    },
    engineCurrentModelFamily() {
      return this.detectModelFamilyFromValue(this.forge.modelInfo, this.engineCurrentModelName);
    },
    engineCurrentModelFamilyLabel() {
      const labels = { sd15: 'SD1.5', sdxl: 'SDXL', flux: 'FLUX', zimage: 'Z-Image', svd: 'SVD' };
      return labels[this.engineCurrentModelFamily] || 'Generic';
    },
    engineModelFamilyTabs() {
      return [
        { key: 'sd15', label: 'SD1.5' },
        { key: 'sdxl', label: 'SDXL' },
        { key: 'flux', label: 'Flux' },
        { key: 'zimage', label: 'Z-Image' },
        { key: 'other', label: 'Other' },
      ];
    },
    groupedEngineModels() {
      const groups = { sd15: [], sdxl: [], flux: [], zimage: [], other: [] };
      (this.forge.models || []).forEach((model) => {
        const family = this.detectModelFamilyFromValue(
          model.metadata,
          `${model.title || ''} ${model.model_name || ''}`
        );
        const bucket = groups[family] ? family : 'other';
        groups[bucket].push(model);
      });
      Object.keys(groups).forEach((key) => {
        groups[key].sort((a, b) => String(a.title || a.model_name || '').localeCompare(String(b.title || b.model_name || '')));
      });
      return groups;
    },
    activeEngineModelList() {
      const tab = this.engineModelPickerTab || 'sd15';
      return this.groupedEngineModels[tab] || [];
    },
    engineCurrentCfgScale() {
      const fallback = Number(this.forge.options && this.forge.options.cfg_scale)
        || Number((this.liveVibe.find((param) => param.key === 'cfgscale') || {}).val)
        || 1;
      return this.readFirstNumericValue(
        (this.deforumSettings && (this.deforumSettings.cfg_scale_schedule || this.deforumSettings.distilled_cfg_scale_schedule)) || '',
        fallback
      );
    },
    engineCurrentSteps() {
      if (this.lcmEngine && this.lcmEngine.enabled) {
        return Math.max(1, Math.round(Number(this.lcmEngine.steps) || 1));
      }
      return this.currentStepsValue();
    },
    lcmEngineEnabled() {
      return !!(this.lcmEngine && this.lcmEngine.enabled);
    },
    engineSamplerOptions() {
      return [...new Set([
        this.deforumSettings && this.deforumSettings.sampler,
        this.forge.options && this.forge.options.sampler_name,
        this.gpuPool && this.gpuPool.forgeModal && this.gpuPool.forgeModal.options && this.gpuPool.forgeModal.options.sampler_name,
        ...(this.forge.samplers || []),
        ...FALLBACK_FORGE_SAMPLERS,
      ].map((value) => String(value || '').trim()).filter(Boolean))];
    },
    engineSchedulerOptions() {
      return [...new Set([
        this.deforumSettings && this.deforumSettings.scheduler,
        this.forge.options && this.forge.options.scheduler,
        this.gpuPool && this.gpuPool.forgeModal && this.gpuPool.forgeModal.options && this.gpuPool.forgeModal.options.scheduler,
        ...(this.forge.schedulers || []),
        ...FALLBACK_FORGE_SCHEDULERS,
      ].map((value) => String(value || '').trim()).filter(Boolean))];
    },
    sdForgeGpuNodes() {
      return (this.gpuPool.nodes || []).filter((n) => n && n.backend === 'sd-forge');
    },
    mediatorHealthSummary() {
      const nodes = this.sdForgeGpuNodes.filter((n) => n.mediator);
      if (!nodes.length) {
        const legacy = this.infrastructure && this.infrastructure.mediator;
        if (legacy) {
          const ok = legacy.status === 'healthy' && legacy.deforumStatus === 'healthy';
          return { label: legacy.status || 'unknown', ok };
        }
        return { label: 'unknown', ok: false };
      }
      const healthy = nodes.filter(
        (n) => n.mediator.deforumStatus === 'healthy' && n.mediator.deforumationStatus === 'healthy'
      ).length;
      if (healthy === nodes.length) return { label: 'healthy', ok: true };
      if (healthy > 0) return { label: `${healthy}/${nodes.length} ok`, ok: false };
      return { label: 'unreachable', ok: false };
    },
    deforumLayerFieldGroups() {
      return this.deforumFieldGroups.filter((g) => g && g.id !== 'global');
    },
    deforumGlobalEngineGroup() {
      return DEFORUM_GLOBAL_ENGINE_GROUP;
    },
    deforumControlTabs() {
      return [
        { id: 'settings', label: 'Settings' },
        { id: 'controlnet', label: 'ControlNet' },
        { id: 'motion', label: 'Motion' },
        { id: 'macros', label: 'Macros' },
      ];
    },
    deforumCnUnits() {
      return Array.from({ length: DEFORUM_CN_SLOT_COUNT }, (_, i) => i + 1);
    },
    editorImportUrl() {
      const raw = String(this.editorPendingImportUrl || '').trim();
      if (raw) return raw;
      const filePath = String(this.editorPendingImportPath || '').trim();
      if (!filePath) return '';
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      return deforaMediaFileUrl(origin, filePath, this.editorPendingImportRootId);
    },
    freecutFrameSrc() {
      const route = String(this.editorFreecutRoute || 'projects').trim();
      let src = freecutProjectsUrl();
      if (route.startsWith('editor/')) {
        src = freecutEditorUrl(route.slice('editor/'.length));
      }
      return appendDeforaImportParam(src, this.editorImportUrl);
    },
    activeDeforumFieldGroup() {
      const groups = this.deforumLayerFieldGroups;
      return groups.find((group) => group.id === this.deforumActiveTab) || groups[0] || null;
    },
    deforumMode2d3d() {
      return normalizeDeforumMode2d3d(this.deforumSettings?.animation_mode);
    },
    deforumMode3dActive() {
      return this.deforumMode2d3d === '3D';
    },
    engineOptimizedDefaults() {
      return this.optimizedDefaultsForModel(this.engineCurrentModelName);
    },
    engineOptimizedProfileLabel() {
      return (this.engineOptimizedDefaults && this.engineOptimizedDefaults.profileLabel) || 'Manual / custom';
    },
    paramPanelGroups() {
      return [
        { label: 'Style', items: this.liveVibe },
        { label: 'Camera', items: this.liveCam },
      ];
    },
    pinnedParamItems() {
      const allParams = [...this.liveVibe, ...this.liveCam];
      return this.pinnedParams
        .map(key => allParams.find(p => p.key === key))
        .filter(Boolean);
    },
    modulatingNowItems() {
      return [...this.liveVibe, ...this.liveCam]
        .filter(p => this.paramSources[p.key] && this.paramSources[p.key] !== 'Manual')
        .map(p => ({
          key: p.key,
          label: p.label,
          source: this.paramSources[p.key],
          val: p.val,
          min: p.min,
          max: p.max,
          pct: Math.round(((p.val - p.min) / ((p.max - p.min) || 1)) * 100),
        }));
    },
    liveActiveLayerLabel() {
      const layer = this.findVideoLayer(this.activeVideoLayerId);
      return layer?.label || '—';
    },
    liveContextSummaryParams() {
      const modulating = this.modulatingNowItems || [];
      if (modulating.length) return modulating.slice(0, 4);
      const pinned = (this.pinnedParamItems || []).slice(0, 4);
      if (pinned.length) {
        return pinned.map((p) => ({
          key: p.key,
          label: p.label,
          val: p.val,
          source: this.paramSources[p.key] || 'Manual',
        }));
      }
      return [...(this.liveVibe || []), ...(this.liveCam || [])].slice(0, 3).map((p) => ({
        key: p.key,
        label: p.label,
        val: p.val,
        source: this.paramSources[p.key] || 'Manual',
      }));
    },
    audioReactiveActive() {
      return ['Audio sent to mediator', 'Streaming'].includes(this.audioStatus);
    },
    audioSpectrumPlaying() {
      const el = this.$refs && this.$refs.avSyncAudio;
      return !!(el && this.audio.objectUrl && !el.paused && !el.ended);
    },
    audioSpectrumEditorLive() {
      return !!(this.audio.objectUrl || (this.audioSpectrumBins && this.audioSpectrumBins.length));
    },
    animationModeGroupLabel() {
      const mode = (this.defaultAnimation && this.defaultAnimation.mode) || 'instancing';
      const labels = {
        instancing: 'Instancing',
        volume: 'Volume',
        nebula: 'Nebula',
        raycast: 'Raycast',
        marching: 'Marching',
        ocean: 'Ocean',
        interactive_points: 'Interactive points',
        interactive_raycast_points: 'Raycast points',
        lensflares: 'Lens flares',
        transition: 'Scene transition',
        protoplanet: 'GPGPU protoplanet',
        periodic_table: 'Periodic table (CSS3D)',
        customlights: 'Custom lights',
      };
      return `Standby — ${labels[mode] || 'Instancing'}`;
    },
    modulationMappingsGroups() {
      const groups = new Map();
      this.animationTargets.forEach((t) => {
        const label = t.group || 'Animation';
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(t);
      });
      this.lfoTargets.forEach((t) => {
        const label = t.group || 'Deforum';
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(t);
      });
      const modeLabel = this.animationModeGroupLabel;
      const entries = [...groups.entries()].map(([label, items]) => ({
        label,
        shortLabel: String(label).replace(/^Standby — /, ''),
        items,
      }));
      entries.sort((a, b) => {
        if (a.label === modeLabel) return -1;
        if (b.label === modeLabel) return 1;
        return a.label.localeCompare(b.label);
      });
      return entries;
    },
    modulationMappingsVisibleGroups() {
      let groups = this.modulationMappingsGroups;
      if (this.mappingsActiveOnly) {
        groups = groups
          .map((g) => ({
            ...g,
            items: g.items.filter((t) => this.paramHasActiveMapping(t.key)),
          }))
          .filter((g) => g.items.length);
      }
      return groups;
    },
    mappingsActiveGroupLabel() {
      const groups = this.modulationMappingsVisibleGroups || [];
      const tab = this.mappingsGroupTab || this.animationModeGroupLabel;
      if (groups.some((g) => g.label === tab)) return tab;
      return groups[0]?.label || '';
    },
    mappingsActiveGroup() {
      const groups = this.modulationMappingsVisibleGroups || [];
      const label = this.mappingsActiveGroupLabel;
      return groups.find((g) => g.label === label) || groups[0] || null;
    },
    modulationMapPickerParamLabel() {
      const key = this.modulationMapPicker?.paramKey;
      if (!key) return '';
      const t = this.modulationTargetByKey(key);
      return t?.label || key;
    },
    videoSwarmIsCloudRoot() {
      return this.isCloudStorageRoot(this.systemFiles.rootId);
    },
    videoSwarmIsVideosOnly() {
      return this.systemFiles.viewMode === 'videos-only';
    },
    videoSwarmCloudPathLabel() {
      const src = this.systemFiles.cloudSource;
      if (!src) return 'Cloud storage';
      return `${this.cloudProviderLabel(src.provider)} — ${src.label}`;
    },
    videoSwarmDisplayFolders() {
      if (this.videoSwarmIsVideosOnly || this.videoSwarmIsCloudRoot) return [];
      return Array.isArray(this.systemFiles.folders) ? this.systemFiles.folders : [];
    },
    videoSwarmDisplayVideos() {
      const list = Array.isArray(this.systemFiles.videos) ? this.systemFiles.videos : [];
      return list.slice(this.videoSwarmVisibleStart, this.videoSwarmVisibleEnd);
    },
    videoSwarmFullscreenVideo() {
      const list = this.systemFiles.videos || [];
      const idx = this.systemFiles.fullscreenIndex;
      return idx >= 0 && idx < list.length ? list[idx] : null;
    },
    liveModSlotPickerOptions() {
      return [
        { index: 0, label: 'Slider 1' },
        { index: 1, label: 'Slider 2' },
        { index: 2, label: 'XY Pad 1 · X' },
        { index: 3, label: 'XY Pad 1 · Y' },
        { index: 4, label: 'XY Pad 2 · X' },
        { index: 5, label: 'XY Pad 2 · Y' },
        { index: 6, label: 'Knob 1' },
        { index: 7, label: 'Knob 2' },
      ];
    },
    audioBandTabDefs() {
      return [
        { key: 'low', label: 'Low' },
        { key: 'mid', label: 'Mid' },
        { key: 'high', label: 'High' },
      ];
    },
    activeAudioMappingIndex() {
      const selected = Number(this.audioSelectedMappingIndex);
      if (Number.isFinite(selected) && selected >= 0 && selected < this.audioMappings.length) {
        return selected;
      }
      const tabs = this.audioBandTabDefs;
      const key = this.audioActiveBandTab;
      const idx = tabs.findIndex((tab) => tab.key === key);
      return idx >= 0 ? idx : 0;
    },
    activeAudioMapping() {
      return this.audioMappings[this.activeAudioMappingIndex] || this.audioMappings[0] || null;
    },
    audioSpectrumBandLabels() {
      return this.audioBandTabDefs.map((tab) => tab.label);
    },
    audioSpectrumBandColors() {
      try {
        const s = getComputedStyle(document.documentElement)
        const v = (name) => s.getPropertyValue(name).trim()
        return [v('--band-low'), v('--band-mid'), v('--band-high')].filter(Boolean);
      } catch (_e) {
        return [];
      }
    },
    liveModulating() {
      const paramMap = {};
      [...this.liveVibe, ...this.liveCam].forEach(p => { paramMap[p.key] = p; });
      this.modulationTargets.forEach(t => {
        if (!paramMap[t.key]) {
          const hudKey = Object.entries(this.liveParamAliases).find(([, route]) => route === t.key)?.[0];
          const hud = hudKey ? this.liveHudParamByKey(hudKey) : null;
          if (hud) {
            paramMap[t.key] = {
              key: t.key,
              label: t.label,
              val: Number(hud.val ?? 0),
              min: hud.min ?? 0,
              max: hud.max ?? 1,
              step: hud.step ?? 0.01,
            };
            return;
          }
          const animField = t.field;
          const val = animField && this.defaultAnimation
            ? Number(this.defaultAnimation[animField])
            : (t.default || 0);
          paramMap[t.key] = {
            key: t.key,
            label: t.label,
            val: Number.isFinite(val) ? val : (t.default || 0),
            min: t.min || 0,
            max: t.max || 1,
            step: t.step ?? 0.01,
          };
        }
      });
      const modulated = {};
      this.lfos.filter(l => l.on && l.targets.length).forEach(l => {
        l.targets.forEach(key => {
          if (!modulated[key]) modulated[key] = { key, sources: [] };
          modulated[key].sources.push(`LFO ${l.id}`);
        });
      });
      this.macrosRack.filter(m => m.on && m.target).forEach(m => {
        const key = m.target;
        if (!modulated[key]) modulated[key] = { key, sources: [] };
        modulated[key].sources.push('Macro');
      });
      if (this.audioReactiveActive) {
        this.audioMappings.forEach((mapping) => {
          if (!mapping || !mapping.param) return;
          if (!modulated[mapping.param]) modulated[mapping.param] = { key: mapping.param, sources: [] };
          modulated[mapping.param].sources.push('Audio');
        });
      }
      [
        { key: 'translation_x', active: Math.abs(Number(this.motionPadValues.translation_x) || 0) > 0.01 },
        { key: 'translation_y', active: Math.abs(Number(this.motionPadValues.translation_y) || 0) > 0.01 },
      ].forEach(({ key, active }) => {
        if (!active) return;
        if (!modulated[key]) modulated[key] = { key, sources: [] };
        modulated[key].sources.push('XY');
      });
      return Object.values(modulated).map(entry => {
        const p = paramMap[entry.key] || { key: entry.key, label: entry.key, val: 0, min: 0, max: 1 };
        return { ...p, source: entry.sources.join(' + ') };
      });
    },
    liveModulationSlots() {
      const pick = (i) => {
        const key = this.liveModSlotParamKeys[i];
        if (!key) return null;
        const target = this.modulationTargetByKey(key);
        const meta = this.paramControlMeta(key);
        const src = this.paramSources[key] || this.paramSources[this.liveParamCanonicalKey(key)] || 'Manual';
        return {
          key,
          label: (target && target.label) || key,
          val: meta.hud ? meta.hud.val : meta.value,
          min: meta.min,
          max: meta.max,
          step: meta.step,
          source: src,
        };
      };
      const fmtVal = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return '—';
        return Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2);
      };
      const shadeFrom = (p) => {
        if (!p) return 35;
        const min = Number(p.min ?? 0);
        const max = Number(p.max ?? 1);
        const val = Number(p.val ?? 0);
        const t = (val - min) / ((max - min) || 1);
        return Math.round(30 + Math.max(0, Math.min(1, t)) * 70);
      };

      const sliderSlot = (p, label) => {
        if (!p?.key) {
          return { kind: 'slider', label, paramKey: '', mappingLabel: '', min: 0, max: 1, step: 0.01, value: 0, valueLabel: '—', shade: 35 };
        }
        const meta = this.paramControlMeta(p.key);
        const val = meta.hud ? meta.hud.val : meta.value;
        const slotParam = { ...p, val, min: meta.min, max: meta.max };
        return {
          kind: 'slider',
          label: p.label || label,
          paramKey: p.key,
          mappingLabel: p?.source && p.source !== 'Manual' ? p.source : '',
          min: meta.min,
          max: meta.max,
          step: meta.step,
          value: val,
          valueLabel: fmtVal(val),
          shade: shadeFrom(slotParam),
        };
      };

      const knobSlot = (p, label) => {
        if (!p?.key) {
          return { kind: 'knob', label, paramKey: '', mappingLabel: '', min: 0, max: 1, step: 0.01, value: 0, valueLabel: '—' };
        }
        const meta = this.paramControlMeta(p.key);
        const val = meta.hud ? meta.hud.val : meta.value;
        return {
          kind: 'knob',
          label: p.label || label,
          paramKey: p.key,
          mappingLabel: p?.source && p.source !== 'Manual' ? p.source : '',
          min: meta.min,
          max: meta.max,
          step: meta.step,
          value: val,
          valueLabel: fmtVal(val),
        };
      };

      const xySlot = (px, py, label) => {
        const xMeta = px?.key ? this.paramControlMeta(px.key) : null;
        const yMeta = py?.key ? this.paramControlMeta(py.key) : null;
        const xMin = Number(xMeta?.min ?? px?.min ?? 0);
        const xMax = Number(xMeta?.max ?? px?.max ?? 1);
        const yMin = Number(yMeta?.min ?? py?.min ?? 0);
        const yMax = Number(yMeta?.max ?? py?.max ?? 1);
        const xVal = Number(xMeta?.hud ? xMeta.hud.val : xMeta?.value ?? px?.val ?? 0);
        const yVal = Number(yMeta?.hud ? yMeta.hud.val : yMeta?.value ?? py?.val ?? 0);
        const nx = (xVal - xMin) / ((xMax - xMin) || 1);
        const ny = (yVal - yMin) / ((yMax - yMin) || 1);
        const clx = Math.max(0, Math.min(1, Number.isFinite(nx) ? nx : 0));
        const cly = Math.max(0, Math.min(1, Number.isFinite(ny) ? ny : 0));
        return {
          kind: 'xypad',
          label,
          paramKey: '',
          paramKeyX: px?.key || '',
          paramKeyY: py?.key || '',
          mappingLabel: [px?.source, py?.source].filter((s) => s && s !== 'Manual').join(' · '),
          x: clx,
          y: cly,
          xLabel: fmtVal(xVal),
          yLabel: fmtVal(yVal),
          puckStyle: { left: `${clx * 100}%`, top: `${(1 - cly) * 100}%` },
        };
      };

      return [
        sliderSlot(pick(0), 'Slider 1'),
        sliderSlot(pick(1), 'Slider 2'),
        xySlot(pick(2), pick(3), 'XY Pad 1'),
        xySlot(pick(4), pick(5), 'XY Pad 2'),
        knobSlot(pick(6), 'Knob 1'),
        knobSlot(pick(7), 'Knob 2'),
      ];
    },
    sessionCatalog() {
      try {
        if (typeof window === 'undefined' || !window.localStorage) return [];
        const storage = window.localStorage;
        const names = new Set();
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (!key) continue;
          if (key.startsWith('defora_session_') && !key.endsWith('__touchedAt') && !key.endsWith('__restoreDeclinedAt')) {
            names.add(key.replace(/^defora_session_/, ''));
          }
        }
        names.add(String(this.session || 'default'));

        const sessionList = [...names].map((name) => {
          const touchedRaw = storage.getItem(`defora_session_${name}__touchedAt`);
          const touchedAt = touchedRaw != null ? Number(touchedRaw) : NaN;
          const runs = (this.runsAll || []).filter((r) => {
            const id = String(r && r.run_id ? r.run_id : '');
            if (!id) return false;
            return id === name || id.startsWith(`${name}_`) || id.startsWith(`${name}-`) || id.includes(name);
          });
          let images = 0;
          let videos = 0;
          runs.forEach((r) => {
            const frames = Number(r && (r.frame_count ?? r.frames ?? r.length_frames ?? 0)) || 0;
            if (frames > 1) videos += 1;
            else images += 1;
          });
          return {
            name,
            touchedAt: Number.isFinite(touchedAt) ? touchedAt : 0,
            images,
            videos,
            runs: runs.length,
          };
        });

        return sessionList.sort((a, b) => (b.touchedAt || 0) - (a.touchedAt || 0) || a.name.localeCompare(b.name));
      } catch (_e) {
        return [];
      }
    },
    targetOwners() {
      const map = {};
      this.lfos.forEach(l => {
        if (!l.on) return;
        l.targets.forEach(key => {
          if (!map[key]) map[key] = [];
          map[key].push(`LFO ${l.id}`);
        });
      });
      this.macrosRack.forEach((m, idx) => {
        if (!m.on || !m.target) return;
        if (!map[m.target]) map[m.target] = [];
        map[m.target].push(`Macro ${idx + 1}`);
      });
      return map;
    },
    activeSlot() {
      return this.cn.slots.find((s) => s.id === this.cn.active) || this.cn.slots[0];
    },
    currentControlNetModelFamily() {
      return this.engineCurrentModelFamily || this.currentLoraModelFamily || '';
    },
    currentControlNetModelFamilyLabel() {
      const labels = { sd15: 'SD1.5', sdxl: 'SDXL', flux: 'FLUX', svd: 'SVD' };
      return labels[this.currentControlNetModelFamily] || 'Generic';
    },
    controlNetCompatibleModels() {
      const activeFamily = this.currentControlNetModelFamily;
      return (this.cn.availableModels || []).filter((model) => {
        const family = this.detectModelFamilyFromValue(null, `${model && model.name ? model.name : ''} ${model && model.id ? model.id : ''}`);
        return !activeFamily || !family || family === activeFamily;
      });
    },
    activeControlNetModelIsCompatible() {
      const selected = String(this.activeSlot && this.activeSlot.model || '').trim();
      if (!selected) return true;
      const selectedFamily = this.detectModelFamilyFromValue(null, selected);
      if (!this.currentControlNetModelFamily || !selectedFamily) return true;
      return selectedFamily === this.currentControlNetModelFamily;
    },
    activeControlNetModelChoices() {
      const selected = String(this.activeSlot && this.activeSlot.model || '').trim();
      const hasSelectedOption = this.controlNetCompatibleModels.some((model) => model && model.name === selected);
      if (!selected || hasSelectedOption) return this.controlNetCompatibleModels;
      const matched = (this.cn.availableModels || []).find((model) => model && model.name === selected);
      return [
        {
          ...(matched || { id: `current-${selected.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name: selected, category: 'current' }),
          current: true,
          incompatible: !this.activeControlNetModelIsCompatible,
        },
        ...this.controlNetCompatibleModels,
      ];
    },
    controlNetModelSummary() {
      const count = this.controlNetCompatibleModels.length;
      if (this.currentControlNetModelFamily) {
        return `Showing ${count} ${this.currentControlNetModelFamilyLabel}-compatible models.`;
      }
      return `Showing ${count} available models.`;
    },
    controlNetWeightPercent() {
      return Math.max(0, Math.min(100, ((Number(this.activeSlot && this.activeSlot.weight) || 0) / 2) * 100));
    },
    controlNetWeightLabel() {
      const weight = Number(this.activeSlot && this.activeSlot.weight) || 0;
      if (weight < 0.35) return 'Very subtle';
      if (weight < 0.75) return 'Subtle';
      if (weight < 1.1) return 'Balanced';
      if (weight < 1.5) return 'Strong';
      return 'Very strong';
    },
    modulationTargets() {
      return [...this.lfoTargets, ...this.animationTargets];
    },
    lfoTargetGroups() {
      const groups = {};
      this.modulationTargets.forEach((target) => {
        const label = target.group || "Other";
        if (!groups[label]) groups[label] = [];
        groups[label].push(target);
      });
      return Object.entries(groups).map(([label, items]) => ({ label, items }));
    },
    sequencerParamOptions() {
      const opts = this.modulationTargets.map((t) => ({ key: t.key, label: t.label }));
      this.cn.slots.forEach((s) => {
        opts.push({ key: `cn_${s.id}_weight`, label: `CN ${s.id} Weight`, group: "ControlNet" });
        opts.push({ key: `cn_${s.id}_start`, label: `CN ${s.id} Start`, group: "ControlNet" });
        opts.push({ key: `cn_${s.id}_end`, label: `CN ${s.id} End`, group: "ControlNet" });
      });
      return opts;
    },
    audioBandChips() {
      return Object.entries(this.audioBandPresets).map(([key, v]) => ({
        key,
        label: v.label,
        freq_min: v.freq_min,
        freq_max: v.freq_max,
      }));
    },
    sortedSequencerMarkers() {
      const raw = (this.sequencer && this.sequencer.markers) || [];
      return [...raw].sort((a, b) => a.t - b.t);
    },
    sortedSequencerClips() {
      const raw = (this.sequencer && this.sequencer.clips) || [];
      return [...raw].sort((a, b) => a.t - b.t);
    },
    sequencerClipSummary() {
      const clips = this.sortedSequencerClips;
      const count = (type) => clips.filter((c) => c.type === type).length;
      return { prompt: count('prompt'), lora: count('lora'), controlnet: count('controlnet'), video: count('video') };
    },
    hasLibraryVideoSelection() {
      return !!this.resolveLibraryVideoEntry();
    },
    masterFps() {
      const n = Number(this.deforumSettings && this.deforumSettings.fps);
      return Math.max(1, Math.min(120, Number.isFinite(n) && n > 0 ? Math.round(n) : 24));
    },
    sequencerJobFps() {
      return this.masterFps;
    },
    sequencerJobTotalFrames() {
      const fromDeforum = Number(this.deforumSettings && this.deforumSettings.max_frames);
      if (Number.isFinite(fromDeforum) && fromDeforum > 0) {
        return Math.floor(fromDeforum);
      }
      const fps = this.sequencerJobFps;
      const dur = Number(this.sequencer && this.sequencer.durationSec) || 0;
      return Math.max(1, Math.ceil(dur * fps));
    },
    sequencerJobTimeSec() {
      if (this.sequencerPlaying) {
        return Number(this.sequencerPlayhead) || 0;
      }
      if (this.deforumPlaying && this.showMotionSequencerDock) {
        return Number(this.jobPlaybackTimeSec) || 0;
      }
      return Number(this.sequencerPlayhead) || 0;
    },
    sequencerJobFrameIndex() {
      const fps = this.sequencerJobFps;
      const total = this.sequencerJobTotalFrames;
      const idx = Math.floor((Number(this.sequencerJobTimeSec) || 0) * fps + 1e-6);
      return Math.min(total - 1, Math.max(0, idx));
    },
    sequencerJobFrameNumber() {
      return this.sequencerJobFrameIndex + 1;
    },
    sequencerJobFrameLabel() {
      return `Frame ${this.sequencerJobFrameNumber} / ${this.sequencerJobTotalFrames}`;
    },
    sequencerJobFrameProgressPct() {
      const total = this.sequencerJobTotalFrames;
      if (total <= 1) return 0;
      return (this.sequencerJobFrameIndex / (total - 1)) * 100;
    },
    sequencerJobFrameLive() {
      return !!this.sequencerPlaying || !!this.deforumPlaying;
    },
    sequencerCalculatedDuration() {
      if (!this.sequencer.bpmSync) return "—";
      const bpm = Math.max(1, this.sequencer.bpm || 120);
      const beats = (this.sequencer.bars || 4) * (this.sequencer.beatsPerBar || 4);
      const duration = (beats / bpm) * 60;
      return duration.toFixed(2);
    },
    selectedSequencerTrack() {
      return this.sequencer.tracks.find((track) => track.id === this.sequencerSelectedTrackId) || this.sequencer.tracks[0] || null;
    },
    sequencerParamMetaMap() {
      const meta = {};
      this.modulationTargets.forEach((target) => {
        meta[target.key] = {
          label: target.label,
          min: Number(target.min ?? 0),
          max: Number(target.max ?? 1),
        };
      });
      this.cn.slots.forEach((slot) => {
        meta[`cn_${slot.id}_weight`] = { label: `CN ${slot.id} Weight`, min: 0, max: 2 };
        meta[`cn_${slot.id}_start`] = { label: `CN ${slot.id} Start`, min: 0, max: 1 };
        meta[`cn_${slot.id}_end`] = { label: `CN ${slot.id} End`, min: 0, max: 1 };
      });
      return meta;
    },
    selectedModulationLfo() {
      return this.lfos.find((lfo) => lfo.id === this.modulationSelectedLfoId) || this.lfos[0] || null;
    },
    isDeforumMotion2d() {
      const mode = String(this.deforumSettings?.animation_mode || '2D').trim().toUpperCase();
      return mode === '2D';
    },
    motionMovePadRange() {
      return this.isDeforumMotion2d ? 1 : 10;
    },
    motionAxisOptionsList() {
      const keys = this.isDeforumMotion2d
        ? ['translation_x', 'translation_y', 'angle', 'zoom']
        : ['translation_x', 'translation_y', 'translation_z', 'zoom', 'rotation_z'];
      const labels = {
        translation_x: { key: 'translation_x', label: 'Pan X', shortLabel: 'X', icon: 'arrow-right' },
        translation_y: { key: 'translation_y', label: 'Pan Y', shortLabel: 'Y', icon: 'chevron-up' },
        translation_z: { key: 'translation_z', label: 'Depth Z', shortLabel: 'Z', icon: 'panel-bottom' },
        angle: { key: 'angle', label: 'Angle', shortLabel: 'Ang', icon: 'rotate-ccw' },
        zoom: { key: 'zoom', label: 'Zoom', shortLabel: 'Zm', icon: 'size-full' },
        rotation_z: { key: 'rotation_z', label: 'Tilt', shortLabel: 'Tlt', icon: 'rotate-ccw' },
      };
      return keys.map((key) => labels[key]).filter(Boolean);
    },
    motionPadPuckStyle() {
      return this.motionPadPuckStyleFor('move');
    },
    motionLookPadPuckStyle() {
      return this.motionPadPuckStyleFor('look');
    },
    motionPadReadout() {
      return {
        x: Number(this.motionPadValues.translation_x || 0),
        y: Number(this.motionPadValues.translation_y || 0),
        z: Number(this.motionPadValues.translation_z || 0),
        zoom: Number(this.motionPadValues.zoom ?? 1),
        tilt: Number(this.motionPadValues.rotation_z ?? 0),
        lookX: Number(this.motionPadValues.look_x ?? 0),
        lookY: Number(this.motionPadValues.look_y ?? 0),
      };
    },
    savedMotionPresetNames() {
      return Object.keys(this.motionStylesSaved || {}).sort((a, b) => a.localeCompare(b));
    },
    morphHudSummary() {
      const slots = Array.isArray(this.performance.slots) ? this.performance.slots : [];
      const summarize = (sideKey) => {
        if (!slots.length) return `No ${sideKey} slots`;
        const labels = slots
          .slice(0, 2)
          .map((slot) => {
            if (slot.type === 'param' && slot.paramKey) {
              const meta = this.modulationTargetByKey(slot.paramKey);
              return meta ? meta.label : this.slotTypeLabel(slot.type);
            }
            if (slot.type === 'style') {
              const a = this.promptStyleLabel(slot.valueA);
              const b = this.promptStyleLabel(slot.valueB);
              if (a && b) return `${a}↔${b}`;
              return a || b || this.slotTypeLabel(slot.type);
            }
            return this.slotTypeLabel(slot.type);
          });
        const extra = slots.length > 2 ? ` +${slots.length - 2}` : '';
        return `${sideKey} · ${labels.join(' / ')}${extra}`;
      };
      return {
        a: summarize('A'),
        b: summarize('B'),
      };
    },
    bindingGroups() {
      const groups = {};
      this.modulationTargets.forEach((t) => {
        const label = t.group || "Other";
        if (!groups[label]) groups[label] = [];
        groups[label].push(t);
      });
      return Object.entries(groups).map(([label, items]) => ({ label, items }));
    },
    modulationSubtabSummary() {
      const sub = this.normalizeModulationSubTab(this.currentSubTab.MODULATION);
      if (sub === 'LFO') {
        const active = this.lfos.filter((l) => l.on).length;
        return `${active}/${this.lfos.length} LFO active`;
      }
      if (sub === 'AV_SYNC') {
        if (this.avSyncEnabled && this.audio.objectUrl) return 'Sync on';
        return this.audio.objectUrl ? 'Sync off' : 'Upload track';
      }
      if (sub === 'AUDIO_REACTIVE') {
        return this.audioReactiveActive ? 'Audio live' : 'Audio idle';
      }
      if (sub === 'BEAT_MACROS') {
        return this.beatMacroOn ? 'Beat macros on' : 'Beat macros off';
      }
      if (sub === 'MAPPINGS') {
        const n = this.mappingsActiveOnly
          ? this.modulationMappingsVisibleGroups.reduce((sum, g) => sum + g.items.length, 0)
          : this.modulationMappingsGroups.reduce((sum, g) => sum + g.items.length, 0);
        return n ? `${n} parameters` : 'No mappings';
      }
      return '';
    },
  },
  watch: {
    sequencer: {
      handler() {
        this.$nextTick(() => this.drawTimeline());
      },
      deep: true,
    },
    'sequencer.fps'(next) {
      if (this._syncingGlobalFps) return;
      this.setGlobalFps(next, { source: 'sequencer' });
    },
    'generator.fps'(next) {
      if (this._syncingGlobalFps) return;
      this.setGlobalFps(next, { source: 'generator' });
    },
    sequencerPlayhead() {
      this.$nextTick(() => this.drawTimeline());
    },
    'performance.crossfader'() {
      this.applyCrossfadeMorph();
      this.saveSessionState();
    },
    session(newSession) {
      this.saveSessionState();
      if (this.deforumSettings) {
        this.deforumSettings = { ...this.deforumSettings, batch_name: newSession };
      }
    },
    showDefaultAnimation(visible) {
      if (visible) this.$nextTick(() => this.kickstandbyAnimation());
    },
    audioMappings: {
      deep: true,
      handler() {
        if (this.audioBandPreviewIndex < 0) return;
        const mapping = this.audioMappings[this.audioBandPreviewIndex];
        if (mapping) this.updateAudioBandpassFilter(mapping);
      },
    },
    deforumGeneratedFrameCount(count) {
      if (count > 0) this.maybePromoteDeforumPreview();
    },
    isDeforumMotion2d(is2d) {
      this.motionXYPadSlots = is2d
        ? [
          { id: 'primary', xAxis: 'translation_x', yAxis: 'translation_y' },
          { id: 'look', xAxis: 'angle', yAxis: 'zoom' },
        ]
        : [{ id: 'primary', xAxis: 'translation_x', yAxis: 'translation_y' }];
    },
    deforumPlaying(playing) {
      if (playing) {
        this.frameRailFollowLatest = true;
        this.pinHeldPreviewFrame();
        this.maybePromoteDeforumPreview();
        this.scheduleFrameRefresh(0);
      } else {
        this.clearHeldPreviewFrame();
        this.clearFrameThumbLoadingState();
      }
    },
    videoReady(ready) {
      if (ready) {
        this.maybePromoteDeforumPreview();
        if (this.showDeforumVideo) this.clearHeldPreviewFrame();
      }
    },
    showDeforumVideo(visible) {
      if (visible) this.clearHeldPreviewFrame();
    },
    currentTab() {
      this.syncRunsMonitorPolling();
    },
    'currentSubTab.SETTINGS'(sub) {
      if (this.currentTab !== 'SETTINGS') return;
      this.syncRunsMonitorPolling();
      if (sub === 'SYSTEM') void this.refreshRuns();
      if (sub === 'PLUGINS') void this.refreshPlugins();
    },
    runsAutoRefresh() {
      this.syncRunsMonitorPolling();
      this.saveSessionState();
    },
    liveEngineDrawerOpen(open) {
      this.$nextTick(() => this.updateSidePanelDockBounds());
      if (open) void this.preloadDeforumPipeline();
    },
    liveAnimationBoxOpen(open) {
      if (this.enginePanelDetailsOpen !== open) this.enginePanelDetailsOpen = open;
    },
    enginePanelDetailsOpen(open) {
      if (this.liveAnimationBoxOpen !== open) this.liveAnimationBoxOpen = open;
    },
    currentTab(tab, prev) {
      if ((prev === "STREAM" || prev === "LIBRARY") && tab !== prev) {
        if (prev === "STREAM" && this.hlsWatchEnabled) this.disableHlsWatch();
      }
    },
    hlsPreviewStreamValid(valid) {
      if (!valid && this.hlsWatchEnabled) {
        this.disableHlsWatch();
      }
    },
    deforumActiveTab(tab) {
      if (tab === 'sampling') void this.ensureForgeSamplerSchedulerLists();
    },
    'currentSubTab.LIVE'(sub) {
      if (sub === 'DEFORUM_JOB') void this.ensureForgeSamplerSchedulerLists();
    },
    sidePanelUsesEdgeDock() {
      this.updateSidePanelDockBounds();
      this.$nextTick(() => this.bindSidePanelDockTracking());
    },
    videoStageSize() {
      this.updateSidePanelDockBounds();
    },
    libraryWorkspaceOpen() {
      this.updateSidePanelDockBounds();
    },
    currentTab() {
      this.updateSidePanelDockBounds();
    },
    rightPanelOpen() {
      this.updateSidePanelDockBounds();
    },
  },
  mounted() {
    // Restore prompt: if we have saved UI state and current state differs, ask before applying.
    if (!this.checkAndPromptSessionRestore()) {
      this.loadSessionState();
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const savedTab = window.localStorage.getItem('defora_tab');
        if (savedTab === 'EDITOR' || savedTab === 'LIBRARY') {
          this.openLibraryWorkspace(savedTab === 'EDITOR' ? 'editor' : 'browser');
        } else if (savedTab === 'STREAM') {
          this.switchTab('SETTINGS');
          this.switchSubTab('SETTINGS', 'OUTPUT');
        }
      }
    } catch (_e) {}
    this.initVideoLayers();
    this.initDefaultScene();
    this.applyStartupVideoPreview();
    this.applyContextPanelStartupDefaults();
    this.ensureStandbyAnimationAtStartup();
    this.syncMotionPadFromPayload(this.motionPresets[this.motionSelectedPreset] || { translation_x: 0, translation_y: 0 });
    this.applyCrossfadeMorph();
    this.loadMotionStyles();
    this.loadBindings();
    this.refreshPresets();
    this.refreshSharedPresets();
    this.refreshGpuPool(false);
    this.loadControlNetModels();
    this.loadControlNetModules();
    this.refreshPlugins();
    void this.loadPromptStyles();
    this.syncDeforumSettingsJson();
    const deforumSettingsPromise = this.loadDeforumSettings({ syncServerModel: false });
    const forgeRefreshPromise = this.refreshForgeAll();
    deforumSettingsPromise.finally(() => {
      if (!this.deforumPlaying) this.schedulePreviewFrame();
      void this.preloadDeforumPipeline();
    });
    Promise.allSettled([deforumSettingsPromise, forgeRefreshPromise]).then(() => {
      this.restoreLastModel();
      void this.ensureDefaultForgeModelPreloaded();
      void this.preloadDeforumPipeline();
    });
    this.scanMidi();
    this.connectWebSocket();
    void this.loadStandbyPreviewVideo();
    if (typeof fetch === "function") {
      const cachedThumbs = this.loadCachedFrameThumbs();
      if (cachedThumbs.length) {
        this.thumbs = cachedThumbs;
        this.updateFrameSelection("");
      }
      const scheduleFramesPoll = () => {
        this.refreshFrames().finally(() => {
          this.framesTimer = setTimeout(scheduleFramesPoll, this.framesRefreshBackoffMs || 5000);
        });
      };
      scheduleFramesPoll();
      const scheduleHealthPoll = () => {
        this.refreshApiHealth().finally(() => {
          this.apiStatusTimer = setTimeout(scheduleHealthPoll, this.apiHealthBackoffMs || 15000);
        });
      };
      scheduleHealthPoll();
    }
    this.playbackTimer = setInterval(() => this.ensureLivePlayback(), 4000);
    this.lfoTimer = setInterval(() => this.runLfos(), 120);
    this.beatTimer = setInterval(() => this.processBeat(), 50);
    this.startLfoAnimation();
    this.setupKeyboardShortcuts();
    if (typeof window !== 'undefined') {
      this._viewportResizeHandler = () => {
        this.viewportWidth = window.innerWidth;
      };
      window.addEventListener('resize', this._viewportResizeHandler, { passive: true });
    }
    this.refreshRuns();
    this.$nextTick(() => {
      this.refreshSequencerList();
      setTimeout(() => this.drawTimeline(), 200);
      this.kickstandbyAnimation();
      this.bindSidePanelDockTracking();
    });
    this.initPromptHistory();
    this.refreshServiceHealth();
    this.syncRunsMonitorPolling();
  },
  beforeUnmount() {
    this.unbindSidePanelDockTracking();
    if (this._viewportResizeHandler && typeof window !== 'undefined') {
      window.removeEventListener('resize', this._viewportResizeHandler);
      this._viewportResizeHandler = null;
    }
    this.disposeLiveAudioAnalyser();
    this.stopSequencerPlayback();
    if (this.framesTimer) clearTimeout(this.framesTimer);
    if (this.apiStatusTimer) clearTimeout(this.apiStatusTimer);
    if (this.playbackTimer) clearInterval(this.playbackTimer);
    if (this.lfoTimer) clearInterval(this.lfoTimer);
    if (this.beatTimer) clearInterval(this.beatTimer);
    if (this.previewDebounceTimer) clearTimeout(this.previewDebounceTimer);
    if (this.deforumPreviewTimer) clearTimeout(this.deforumPreviewTimer);
    this.stopForgePreviewProgressPoll();
    this.previewRequestQueue = [];
    this.previewQueueProcessing = false;
    if (this.frameRefreshTimer) clearTimeout(this.frameRefreshTimer);
    if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
    this.stopRunsPolling();
    this.stopLfoAnimation();
    if (this.playerEl) {
      this.detachPlayerListeners(this.playerEl);
    }
    if (this.hls && this.hls.destroy) {
      this.hls.destroy();
      this.hls = null;
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("keydown", this._keyHandler);
    }
  },
  methods: {

  cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  },

  themeColor(name, fallback) {
    return this.cssVar(name) || fallback
  },

  sanitizeSessionName(raw) {
    return String(raw || '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 60) || 'default';
  },
  selectSession(name) {
    const next = this.sanitizeSessionName(name);
    this.session = next;
    try { if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem('defora_session', next); } catch (_e) {}
    this.loadSessionState();
    this.saveSessionState();
  },
  createNewSession() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const next = this.sanitizeSessionName(`session_${stamp}`);
    this.selectSession(next);
  },
  resetUiLayoutDefaults() {
    this.paramPanelOpen = false;
    this.deforumPanelOpen = false;
    this.rightPanelOpen = true;
    this.sidePanelDock = 'auto';
    this.videoStageSize = 'full';
    this.liveAnimationBoxOpen = false;
    this.enginePanelDetailsOpen = false;
    this.enginePanelDetailsTab = 'ENGINE';
    this.liveEngineDrawerOpen = false;
    this.layersSidebarOpen = false;
    this.libraryFullscreen = false;
    this.libraryWorkspaceOpen = false;
    this.libraryWorkspacePane = 'browser';
    this.generateDockExpanded = false;
    this.motionSequencerSideOpen = false;
    this.saveSessionState();
  },
  purgeSession(name) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const clean = this.sanitizeSessionName(name);
      window.localStorage.removeItem(`defora_session_${clean}`);
      window.localStorage.removeItem(`defora_session_${clean}__touchedAt`);
      window.localStorage.removeItem(`defora_session_${clean}__restoreDeclinedAt`);
      if (clean === this.session) {
        this.selectSession('default');
      }
    } catch (_e) {}
  },
  restoreSession(name) {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const clean = this.sanitizeSessionName(name);
      const raw = window.localStorage.getItem(`defora_session_${clean}`);
      if (!raw) return;
      this.pendingSessionStateRaw = raw;
      this.session = clean;
      try { window.localStorage.setItem('defora_session', clean); } catch (_e) {}
      this.clearSessionRestoreDeclined();
      this.loadSessionState();
      this.saveSessionState();
    } catch (_e) {}
  },

  async refreshApiHealth() {
    if (typeof fetch !== "function") return;
    try {
      const res = await fetch("/api/status");
      if (!res.ok) {
        this.apiHealthBackoffMs = Math.min(120000, (this.apiHealthBackoffMs || 15000) * 2);
        return;
      }
      const j = await res.json();
      if (j && j.sdForge) {
        const wasAvailable = !!(this.apiHealth?.sdForge?.available || this.forge?.available);
        this.apiHealth = { sdForge: { ...j.sdForge } };
        this.forge.available = !!j.sdForge.available;
        if (!wasAvailable && this.forge.available) {
          void this.preloadDeforumPipeline();
        }
      }
      this.apiHealthBackoffMs = 15000;
    } catch (_e) {
      this.apiHealthBackoffMs = Math.min(120000, (this.apiHealthBackoffMs || 15000) * 2);
    }
  },

  async refreshServiceHealth() {
    if (typeof fetch !== 'function') return;
    const startedAt = Date.now();
    this.serviceHealth.loading = true;
    this.serviceHealth.lastChecked = new Date().toISOString();
    const next = {
      web: { ok: false },
      hls: { updated: null, ageMs: null },
      stream: { status: 'unknown' },
    };

    const safeJson = async (res) => {
      try { return await res.json(); } catch (_e) { return null; }
    };

    await Promise.allSettled([
      (async () => {
        try {
          const res = await fetch('/health', { cache: 'no-store' });
          next.web.ok = !!res.ok;
        } catch (_e) {
          next.web.ok = false;
        }
      })(),
      (async () => {
        try {
          const res = await fetch('/api/health', { cache: 'no-store' });
          if (!res.ok) return;
          const j = await safeJson(res);
          const updated = j && j.updated != null ? Number(j.updated) : null;
          next.hls.updated = Number.isFinite(updated) ? updated : null;
          if (next.hls.updated != null) next.hls.ageMs = Math.max(0, Date.now() - next.hls.updated);
        } catch (_e) {
          /* ignore */
        }
      })(),
      (async () => {
        try {
          const res = await fetch('/api/stream/status', { cache: 'no-store' });
          if (!res.ok) return;
          const j = await safeJson(res);
          next.stream.status = (j && j.status) ? String(j.status) : 'unknown';
        } catch (_e) {
          /* ignore */
        }
      })(),
    ]);

    this.serviceHealth.web = next.web;
    this.serviceHealth.hls = next.hls;
    this.serviceHealth.stream = next.stream;
    this.serviceHealth.lastChecked = new Date().toISOString();
    this.serviceHealth.loading = false;
    // keep a tiny status breadcrumb
    const dt = Date.now() - startedAt;
    if (dt > 1500 && this.performance && this.performance.status === '') {
      this.performance.status = `Service health refreshed (${dt}ms)`;
      setTimeout(() => { if (this.performance.status && this.performance.status.startsWith('Service health refreshed')) this.performance.status = ''; }, 2500);
    }
  },
  appendRunsJobLog(message, level = 'info') {
    let entry;
    if (message && typeof message === 'object' && (message.kind || message.message)) {
      entry = {
        id: message.id || `log-${++this._runsJobLogSeq}`,
        ts: message.ts || new Date().toISOString(),
        level: message.level || level,
        kind: message.kind || null,
        message: String(message.message || message.kind || 'log'),
        clientRequest: message.clientRequest || null,
        ollamaRequest: message.ollamaRequest || null,
        promptStyles: message.promptStyles || null,
      };
    } else {
      entry = {
        id: `log-${++this._runsJobLogSeq}`,
        ts: new Date().toISOString(),
        message: String(message || ''),
        level,
        kind: null,
        clientRequest: null,
        ollamaRequest: null,
      };
    }
    this.mergeRunsJobLogEntry(entry);
  },
  mergeRunsJobLogEntry(entry) {
    if (!entry || !entry.id) return;
    const prev = (this.runsJobLog || []).filter((row) => row.id !== entry.id);
    this.runsJobLog = [entry, ...prev].slice(0, 80);
  },
  clearRunsJobLog() {
    this.runsJobLog = [];
    if (typeof fetch === 'function') {
      void fetch('/api/runs/job-log', { method: 'DELETE' }).catch(() => {});
    }
  },
  applyStoryLlmRequestLog(llmLog) {
    if (!llmLog || !llmLog.ollamaRequest) return;
    this.generator.llmRequestLog = {
      clientRequest: llmLog.clientRequest || null,
      ollamaRequest: llmLog.ollamaRequest,
      logId: llmLog.logId || null,
    };
    const entry = storyLlmRequestLogEntry(llmLog.clientRequest, llmLog.ollamaRequest, { id: llmLog.logId });
    this.mergeRunsJobLogEntry(entry);
  },
  async persistStoryLlmRequestLog(clientPayload, { model = '' } = {}) {
    const clientRequest = normalizeStoryClientRequest(clientPayload);
    const ollamaRequest = buildStoryOllamaApiBody(clientRequest, { model });
    if (typeof fetch !== 'function') {
      this.applyStoryLlmRequestLog({ clientRequest, ollamaRequest });
      return { clientRequest, ollamaRequest };
    }
    try {
      const res = await fetch('/api/runs/job-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'story_llm_request', clientRequest, ollamaRequest }),
      });
      const data = await res.json();
      if (res.ok && data.llmLog) {
        this.applyStoryLlmRequestLog(data.llmLog);
        return data.llmLog;
      }
      if (res.ok && data.entry) {
        this.applyStoryLlmRequestLog({
          clientRequest: data.entry.clientRequest,
          ollamaRequest: data.entry.ollamaRequest,
          logId: data.entry.id,
        });
      }
    } catch (_e) {
      this.applyStoryLlmRequestLog({ clientRequest, ollamaRequest });
    }
    return { clientRequest, ollamaRequest };
  },
  async refreshRunsJobLogFromServer() {
    if (typeof fetch !== 'function') return;
    try {
      const res = await fetch('/api/runs/job-log?limit=80', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const entries = Array.isArray(data.entries) ? data.entries : [];
      if (!entries.length) return;
      this.runsJobLog = entries.slice().reverse();
      const latestStory = entries.filter((row) => row.kind === 'story_llm_request').pop();
      if (latestStory && latestStory.ollamaRequest) {
        this.generator.llmRequestLog = {
          clientRequest: latestStory.clientRequest,
          ollamaRequest: latestStory.ollamaRequest,
          logId: latestStory.id,
        };
      }
    } catch (_e) { /* ignore */ }
  },
  formatRunsLogTime(ts) {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleTimeString();
    } catch (_e) {
      return '';
    }
  },
  onRunsAutoRefreshChange() {
    if (this.runsAutoRefresh) this.startRunsPolling();
    else this.stopRunsPolling();
    this.saveSessionState();
  },
  syncRunsMonitorPolling() {
    if (this.runsMonitorActive && this.runsAutoRefresh) this.startRunsPolling();
    else this.stopRunsPolling();
  },
  startRunsPolling() {
    this.stopRunsPolling();
    if (!this.runsAutoRefresh) return;
    const ms = Math.max(2000, (Number(this.runsPollIntervalSec) || 5) * 1000);
    this._runsPollTimer = setInterval(() => {
      if (this.runsMonitorActive) void this.refreshRuns({ fromPoll: true });
    }, ms);
  },
  stopRunsPolling() {
    if (this._runsPollTimer) {
      clearInterval(this._runsPollTimer);
      this._runsPollTimer = null;
    }
  },
  noteRunsActivityAfterRefresh() {
    if (!this.runsMonitorActive) return;
    const running = this.runsAll.filter((r) => r.status === 'running').length;
    const queued = this.runsAll.filter((r) => r.status === 'queued').length;
    const gpu = this.runsActiveGpuJobs.length;
    const key = `${running}|${queued}|${gpu}|${this.runsAll.length}`;
    if (key === this._runsActivityKey) return;
    this._runsActivityKey = key;
    this.appendRunsJobLog(
      `Activity: ${running} running, ${queued} queued, ${gpu} GPU batch(es), ${this.runsAll.length} total`,
      'info',
    );
  },
  async launchTestRun() {
    if (this.runsLaunching || typeof fetch !== 'function') return;
    this.runsLaunching = true;
    this.appendRunsJobLog('Launching test job…', 'info');
    try {
      let res = await fetch('/api/deforum/warmup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxFrames: 24, fps: 12 }),
      });
      let data = res.ok ? await res.json() : null;
      if (res.ok && data && data.ok && data.batchId) {
        const note = data.status === 'already_running' ? 'already running' : 'submitted';
        this.appendRunsJobLog(`Warmup batch ${note}: ${data.batchId}`, 'info');
        void this.refreshRuns();
        return;
      }
      res = await fetch('/api/runs/launch-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      data = res.ok ? await res.json() : null;
      if (res.ok && data && data.ok && data.run_id) {
        this.appendRunsJobLog(`Demo run logged: ${data.run_id} (${data.status || 'queued'})`, 'success');
        void this.refreshRuns();
      } else {
        const err = (data && data.error) || `Launch failed (${res.status})`;
        this.appendRunsJobLog(err, 'error');
        this.runsStatus = err;
      }
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      this.appendRunsJobLog(`Launch error: ${msg}`, 'error');
      this.runsStatus = 'Failed to launch test job';
    } finally {
      this.runsLaunching = false;
    }
  },
  async refreshRuns(opts = {}) {
    if (typeof fetch !== "function") return;
    if (!opts.fromPoll) this.runsLoading = true;
    try {
      const res = await fetch("/api/runs");
      if (!res.ok) return;
      const data = await res.json();
      this.runsAll = data.runs || [];
      this.applyRunsFilters();
      void this.refreshGpuPool(true);
      // Best-effort: fetch Deforum batch queue from all Forge GPUs and merge into runs list.
      try {
        const bres = await fetch("/api/deforum/batches?all=1", { cache: "no-store" });
        if (bres.ok) {
          const bj = await bres.json();
          const batches = Array.isArray(bj.batches) ? bj.batches : [];
          this.deforumBatches = batches;
          this.deforumBatchNodes = Array.isArray(bj.nodes) ? bj.nodes : [];
          const errors = Array.isArray(bj.errors) ? bj.errors : [];
          this.deforumBatchesStatus = errors.length
            ? `Some GPUs unavailable (${errors.length})`
            : "";
        } else {
          this.deforumBatches = [];
          this.deforumBatchNodes = [];
          this.deforumBatchesStatus = "Deforum batches unavailable";
        }
      } catch (_e) {
        this.deforumBatches = [];
        this.deforumBatchNodes = [];
        this.deforumBatchesStatus = "Deforum batches unavailable";
      }
      if (this.deforumBatches.length) {
        const manifestRuns = data.runs || [];
        const mapped = this.deforumBatches.map((b) => {
          const id = b.batch_id || b.id || b.batchId || "";
          const status = String(b.status || b.state || "queued").toLowerCase();
          const started = b.started_at || b.created_at || b.createdAt || null;
          const model = b.model || b.sd_model_name || b.sd_model_checkpoint || "";
          const node = b._node || null;
          const existing = manifestRuns.find((r) => r.run_id === id || r.run_id === `batch:${id}`);
          const framesTotal =
            existing?.frames_total
            ?? b.max_frames
            ?? b.frame_count
            ?? b.frames
            ?? null;
          let framesDone =
            existing?.frames_done
            ?? b.frames_done
            ?? b.frames_completed
            ?? b.current_frame
            ?? null;
          if (framesDone == null && typeof b.progress === "number" && framesTotal) {
            framesDone = Math.round(b.progress * Number(framesTotal));
          }
          let framesProgressPct = existing?.frames_progress_pct ?? null;
          if (framesProgressPct == null && framesDone != null && framesTotal) {
            framesProgressPct = Math.min(100, Math.round((Number(framesDone) / Number(framesTotal)) * 100));
          }
          return {
            run_id: id ? `batch:${id}` : `batch:unknown:${Math.random().toString(36).slice(2, 8)}`,
            status: status.includes("run") || status.includes("progress") ? "running" : status.includes("queue") || status.includes("pending") ? "queued" : status.includes("cancel") ? "cancelled" : status,
            model,
            tag: "deforum-batch",
            started_at: started,
            frame_count: framesTotal,
            frames_total: framesTotal,
            frames_done: framesDone,
            frames_progress_pct: framesProgressPct,
            has_thumbnail: !!(existing?.has_thumbnail),
            latest_frame: existing?.latest_frame ?? null,
            thumb_rev: existing?.thumb_rev ?? existing?.latest_frame ?? null,
            _isBatch: true,
            _batch: b,
            _batchNode: node,
            _gpu: (node && node.name) || (node && node.url) || "",
          };
        });
        const existing = this.runsAll.filter((r) => !String(r.run_id || "").startsWith("batch:"));
        this.runsAll = [...mapped, ...existing];
      }
      this.applyRunsFilters();
      this.runsLastRefreshedAt = Date.now();
      if (this.runsMonitorActive) void this.refreshRunsJobLogFromServer();
      this.noteRunsActivityAfterRefresh();
    } catch (_e) {
      this.runsStatus = "Failed to load runs";
      if (this.runsMonitorActive) this.appendRunsJobLog('Failed to load runs', 'error');
    } finally {
      if (!opts.fromPoll) this.runsLoading = false;
    }
  },
  openMidiSettings() {
    this.switchTab('SETTINGS');
    this.switchSubTab('SETTINGS', 'MIDI');
  },
  openGpuSettings() {
    this.switchTab('SETTINGS');
    this.switchSubTab('SETTINGS', 'GPUS');
  },
  openRunsSettings() {
    this.switchTab('SETTINGS');
    this.switchSubTab('SETTINGS', 'SYSTEM');
    this.runsBrowserTab = 'active';
    void this.refreshRuns();
    this.syncRunsMonitorPolling();
  },
  openRecentRun(run) {
    if (!run) return;
    this.switchTab('RUNS');
    this.showRunDetails(run);
  },
  openRunsDrawerSystem() {
    this.switchTab('RUNS');
  },
  openFramesInRunsPanel() {
    this.liveBottomDrawerOpen = true;
    this.liveBottomDrawerTab = 'SYSTEM';
    this.setRunsBrowserTab('frames');
    this.syncRunsMonitorPolling();
  },
  applyRunsFilters() {
    let filtered = (this.runsAll || []).filter((r) => r.status !== 'running' && r.status !== 'queued');
    const { search, status, tag, model } = this.runsFilter;
    if (status) filtered = filtered.filter(r => r.status === status);
    if (tag) filtered = filtered.filter(r => (r.tag || "").toLowerCase().includes(tag.toLowerCase()));
    if (model) filtered = filtered.filter(r => (r.model || "").toLowerCase().includes(model.toLowerCase()));
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(r =>
        (r.run_id || "").toLowerCase().includes(s) ||
        (r.tag || "").toLowerCase().includes(s) ||
        (r.model || "").toLowerCase().includes(s) ||
        (r.prompt_positive || "").toLowerCase().includes(s) ||
        (r.notes || "").toLowerCase().includes(s)
      );
    }
    const { field, order } = this.runsSort;
    filtered.sort((a, b) => {
      let va = a[field] || "";
      let vb = b[field] || "";
      if (typeof va === "number" && typeof vb === "number") {
        return order === "desc" ? vb - va : va - vb;
      }
      va = String(va).toLowerCase();
      vb = String(vb).toLowerCase();
      return order === "desc" ? vb.localeCompare(va) : va.localeCompare(vb);
    });
    this.runsFiltered = filtered;
  },
  toggleRunSelect(runId) {
    const idx = this.runsSelected.indexOf(runId);
    if (idx >= 0) this.runsSelected.splice(idx, 1);
    else this.runsSelected.push(runId);
  },
  async showRunDetails(run) {
    if (!run) return;
    this.runsDetailTab = 'summary';
    this.runsDetailJsonShowDiffOnly = false;
    if (run._isBatch) {
      this.runsDetailView = { ...run };
      this.frameRailRunId = null;
      return;
    }
    this.frameRailRunId = run.run_id || null;
    if (typeof fetch !== "function") return;
    try {
      const res = await fetch(`/api/runs/${run.run_id}`);
      if (!res.ok) return;
      this.runsDetailView = await res.json();
      this.frameRailRunId = this.runsDetailView?.run_id || this.frameRailRunId;
    } catch (_e) {
      this.runsStatus = "Failed to load run details";
    }
  },
  onRunRowClick(run, event) {
    if (!run) return;
    if (event?.target?.closest?.('button, a, input, select, textarea, label')) return;
    if (event && (event.metaKey || event.ctrlKey)) {
      this.toggleRunSelect(run.run_id);
      return;
    }
    void this.showRunDetails(run);
  },
  openRecentRunFromRail(run) {
    if (!run) return;
    this.switchTab('RUNS');
    void this.showRunDetails(run);
  },
  runPrimaryVideoUrl(run) {
    if (!run) return "";
    if (run.primary_video && run.primary_video.url) return run.primary_video.url;
    if (Array.isArray(run.videos) && run.videos.length) {
      return `/api/runs/${encodeURIComponent(run.run_id)}/video/${encodeURIComponent(run.videos[0])}`;
    }
    const output = (run.outputs || []).find((o) => o.kind === "video");
    return output?.url || "";
  },
  runHasOutputMaterial(run) {
    if (!run) return false;
    return !!(
      run.has_video
      || run.has_frames
      || (Array.isArray(run.frames) && run.frames.length)
      || (Array.isArray(run.outputs) && run.outputs.length)
    );
  },
  async openRunMaterialInBrowser(run) {
    if (!run) return;
    const framesOut = (run.outputs || []).find((o) => o.kind === "frames");
    const browsePath = framesOut?.browse_path || null;
    const rootId = framesOut?.rootId || "runs";
    if (!browsePath) return;
    this.openLibraryWorkspace('browser');
    this.librarySubTab = "BROWSER";
    await this.initSystemFilesBrowser();
    await this.browseSystemFiles(browsePath, { rootId });
  },
  openRunVideoInEditor(run) {
    const output = (run?.outputs || []).find((o) => o.kind === "video");
    if (output?.browse_path) {
      this.openInVideoEditor({
        path: output.browse_path,
        rootId: output.rootId || "runs",
        name: output.name || "Run video",
      });
      return;
    }
    const url = this.runPrimaryVideoUrl(run);
    if (!url) return;
    this.editorPendingImportUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;
    this.editorPendingImportPath = "";
    this.editorPendingImportRootId = "runs";
    this.editorFreecutRoute = "projects";
    this.editorStatus = "Ready to import run video";
    this.editorStatusLive = true;
    this.openLibraryVideoEditor();
  },
  canKillQueuedRun(run) {
    return !!(run && run._isBatch && run.status === "queued");
  },
  async killQueuedRun(run) {
    if (typeof fetch !== "function") return;
    if (!this.canKillQueuedRun(run)) return;
    const batchId = String(run.run_id || "").replace(/^batch:/, "");
    const nodeId = (run._batchNode && run._batchNode.id) || "";
    if (!batchId) return;
    if (!confirm(`Cancel queued batch ${batchId}?`)) return;
    try {
      const qs = nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : "";
      const res = await fetch(`/api/deforum/batches/${encodeURIComponent(batchId)}/cancel${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nodeId ? { nodeId } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok !== false) {
        this.runsStatus = `Cancelled batch ${batchId}`;
        await this.refreshRuns();
      } else {
        this.runsStatus = data.error || `Failed to cancel batch ${batchId}`;
      }
    } catch (_e) {
      this.runsStatus = "Failed to cancel batch";
    }
  },
  async rerunRun(run) {
    if (typeof fetch !== "function") return;
    if (!confirm(`Rerun ${run.run_id}?`)) return;
    try {
      const res = await fetch(`/api/runs/${run.run_id}/rerun`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: {} }),
      });
      const data = await res.json();
      this.runsStatus = data.success ? `Rerun request saved for ${run.run_id}` : data.error;
    } catch (_e) {
      this.runsStatus = "Failed to submit rerun";
    }
  },
  async deleteRun(run) {
    if (typeof fetch !== "function") return;
    if (!confirm(`Delete ${run.run_id}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/runs/${run.run_id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        await this.refreshRuns();
        this.runsStatus = `Deleted ${run.run_id}`;
      } else {
        this.runsStatus = data.error;
      }
    } catch (_e) {
      this.runsStatus = "Failed to delete run";
    }
  },
  async saveRunNotes(run) {
    if (typeof fetch !== "function") return;
    try {
      const res = await fetch(`/api/runs/${run.run_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: run.notes }),
      });
      const data = await res.json();
      this.runsStatus = data.success ? "Notes saved" : data.error;
    } catch (_e) {
      this.runsStatus = "Failed to save notes";
    }
  },
  async exportRuns(format) {
    if (typeof fetch !== "function") return;
    try {
      const res = await fetch(`/api/runs/export?format=${format}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `runs_export.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (_e) {
      this.runsStatus = "Failed to export";
    }
  },
  getRunProp(runId, prop) {
    const run = this.runsAll.find(r => r.run_id === runId);
    if (!run) return '-';
    const val = run[prop];
    if (val === undefined || val === null || val === '') return '-';
    if ((prop === 'prompt_positive' || prop === 'prompt_negative') && String(val).length > 80) {
      return String(val).slice(0, 80) + '…';
    }
    return val;
  },
  async exportRunComparison(format) {
    if (this.runsSelected.length < 2) {
      this.runsStatus = 'Select at least 2 runs to compare';
      return;
    }
    try {
      const res = await fetch('/api/runs/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_ids: this.runsSelected, format }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      if (format === 'csv') {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'runs_comparison.csv';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data.comparison, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'runs_comparison.json';
        a.click();
        URL.revokeObjectURL(url);
      }
      this.runsStatus = `Exported comparison (${this.runsSelected.length} runs)`;
    } catch (err) {
      this.runsStatus = err.message || 'Compare export failed';
    }
  },
  formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  },
  runListingId(run) {
    return String(run?.run_id || '').replace(/^batch:/, '');
  },
  runListingThumbUrl(run) {
    if (!run) return '';
    const id = this.runListingId(run);
    if (!id) return '';
    if (!run.has_thumbnail && !(Number(run.frames_done) > 0) && !run.latest_frame) return '';
    const base = `/api/runs/${encodeURIComponent(id)}/thumb`;
    const rev = run.thumb_rev || run.latest_frame || run.frames_done || '';
    return rev ? `${base}?v=${encodeURIComponent(rev)}` : base;
  },
  runFramesDone(run) {
    if (!run) return null;
    if (Number.isFinite(run.frames_done)) return run.frames_done;
    if (run._isBatch && run._batch) {
      const b = run._batch;
      const total = this.runFramesTotal(run);
      if (Number.isFinite(b.frames_done)) return b.frames_done;
      if (Number.isFinite(b.frames_completed)) return b.frames_completed;
      if (Number.isFinite(b.current_frame)) return b.current_frame;
      if (typeof b.progress === 'number' && total) return Math.round(b.progress * total);
    }
    return null;
  },
  runFramesTotal(run) {
    if (!run) return null;
    if (Number.isFinite(run.frames_total) && run.frames_total > 0) return run.frames_total;
    const total = run.frame_count ?? run.length_frames ?? null;
    if (Number.isFinite(total) && total > 0) return total;
    if (run._isBatch && run._batch) {
      const b = run._batch;
      const candidate = b.max_frames ?? b.frame_count ?? b.frames ?? null;
      if (Number.isFinite(candidate) && candidate > 0) return candidate;
    }
    return null;
  },
  runFrameProgressPct(run) {
    if (!run) return null;
    if (Number.isFinite(run.frames_progress_pct)) return run.frames_progress_pct;
    const done = this.runFramesDone(run);
    const total = this.runFramesTotal(run);
    if (done != null && total != null && total > 0) {
      return Math.min(100, Math.round((done / total) * 100));
    }
    return null;
  },
  runFrameProgressLabel(run) {
    const done = this.runFramesDone(run);
    const total = this.runFramesTotal(run);
    if (done == null && total == null) return '-';
    const pct = this.runFrameProgressPct(run);
    const doneStr = done != null ? done : '?';
    const totalStr = total != null ? total : '?';
    if (pct != null) return `${doneStr}/${totalStr} · ${pct}%`;
    return `${doneStr}/${totalStr}`;
  },
  runWorkerName(run) {
    if (!run) return '—';
    return (
      run._gpu
      || (run._batchNode && run._batchNode.name)
      || (run._batch && run._batch._node && run._batch._node.name)
      || (run.job && run.job.snapshot && run.job.snapshot.node && run.job.snapshot.node.name)
      || '—'
    );
  },
  runLiveFramesLabel(run) {
    const done = this.runFramesDone(run);
    if (done == null) return '—';
    const total = this.runFramesTotal(run);
    if (total != null) return `${done} / ${total} frames`;
    return `${done} frames`;
  },
  formatDurationShort(seconds) {
    const sec = Number(seconds);
    if (!Number.isFinite(sec) || sec < 0) return '—';
    if (sec < 45) return `~${Math.max(1, Math.round(sec))}s left`;
    if (sec < 3600) return `~${Math.round(sec / 60)}m left`;
    return `~${(sec / 3600).toFixed(1)}h left`;
  },
  runEtaLabel(run) {
    if (!run) return '—';
    if (run.status === 'queued') return 'Waiting in queue';
    const done = this.runFramesDone(run);
    const total = this.runFramesTotal(run);
    if (total != null && done != null && done >= total) return 'Finishing…';
    if (done == null || done <= 0 || !total) return 'Estimating…';
    const startedMs = run.started_at ? new Date(run.started_at).getTime() : NaN;
    if (!Number.isFinite(startedMs)) return 'Estimating…';
    const elapsedSec = Math.max(1, (Date.now() - startedMs) / 1000);
    const rate = done / elapsedSec;
    if (!Number.isFinite(rate) || rate <= 0) return 'Estimating…';
    const remaining = Math.max(0, total - done);
    if (remaining <= 0) return 'Finishing…';
    return this.formatDurationShort(remaining / rate);
  },
  runDetailCurrentContext() {
    const styleSnap = this.buildPromptStyleJobSnapshot();
    return buildRunDetailCurrentContext({
      deforumSettings: this.normalizedDeforumSettings(),
      forgeModel: this.forge?.selectedModel || this.forge?.currentModel,
      promptStyles: styleSnap,
    });
  },
  runDetailJsonRows(run) {
    return buildRunDetailJsonRows(run, this.runDetailCurrentContext(), {
      diffOnly: !!this.runsDetailJsonShowDiffOnly,
    });
  },
  runDetailJsonPretty(run) {
    return runDetailJsonPretty(run);
  },
  runDetailJsonDiffCount(run) {
    return buildRunDetailJsonRows(run, this.runDetailCurrentContext(), { diffOnly: true }).length;
  },
  async copyRunDetailJson(run) {
    const text = this.runDetailJsonPretty(run);
    if (!text) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      this.runsStatus = 'Run JSON copied';
    } catch (_e) {
      this.runsStatus = 'Failed to copy JSON';
    }
  },
 layersSidebarToggle() {
   this.layersSidebarOpen = !this.layersSidebarOpen;
   this.saveSessionState();
 },
 setLiveBottomDrawerTab(tab) {
   const allowed = ['MODULATION', 'CROSSFADER', 'SYSTEM'];
   const next = allowed.includes(tab) ? tab : 'MODULATION';
   this.liveBottomDrawerTab = next;
   this.liveBottomDrawerOpen = true;
   this.saveSessionState();
 },
 toggleLiveBottomDrawer() {
   this.liveBottomDrawerOpen = !this.liveBottomDrawerOpen;
   this.saveSessionState();
 },
 toggleRightPanel() {
   this.rightPanelOpen = !this.rightPanelOpen;
   this.saveSessionState();
 },
 toggleEngineDrawer() {
   this.liveEngineDrawerOpen = !this.liveEngineDrawerOpen;
   this.saveSessionState();
 },
 updateSidePanelDockBounds() {
   this.$nextTick(() => {
     if (this.sidePanelUsesEdgeDock) return;
     const el = this.$refs.videoStageRef;
     if (!el || typeof el.getBoundingClientRect !== 'function') return;
     const rect = el.getBoundingClientRect();
     if (rect.height < 8) return;
     this.sidePanelDockBounds = { top: rect.top, left: rect.left, height: rect.height };
   });
 },
 bindSidePanelDockTracking() {
   if (typeof window === 'undefined') return;
   const run = () => this.updateSidePanelDockBounds();
   if (!this._sidePanelDockOnResize) {
     window.addEventListener('resize', run, { passive: true });
     this._sidePanelDockOnResize = run;
   }
   if (this._sidePanelDockResizeObserver) {
     this._sidePanelDockResizeObserver.disconnect();
     this._sidePanelDockResizeObserver = null;
   }
   if (typeof ResizeObserver === 'function') {
     const el = this.$refs.videoStageRef;
     if (el) {
       this._sidePanelDockResizeObserver = new ResizeObserver(run);
       this._sidePanelDockResizeObserver.observe(el);
     }
   }
   run();
 },
 unbindSidePanelDockTracking() {
   if (this._sidePanelDockOnResize) {
     window.removeEventListener('resize', this._sidePanelDockOnResize);
     this._sidePanelDockOnResize = null;
   }
   if (this._sidePanelDockResizeObserver) {
     this._sidePanelDockResizeObserver.disconnect();
     this._sidePanelDockResizeObserver = null;
   }
 },
 switchTab(id) {
   if (id === 'EDITOR' || id === 'LIBRARY') {
     this.openLibraryWorkspace(id === 'EDITOR' ? 'editor' : 'browser');
     return;
   }
   if (id === 'STREAM') {
     this.currentTab = 'SETTINGS';
     this.switchSubTab('SETTINGS', 'OUTPUT');
     try { if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem('defora_tab', 'SETTINGS'); } catch (_e) {}
     void this.refreshStreamStatus();
     this.saveSessionState();
     return;
   }
   if (id === 'AUDIO') {
     this.currentTab = 'AUDIO';
     this.currentSubTab.MODULATION = 'AUDIO_REACTIVE';
     try { if (typeof window !== 'undefined' && window.localStorage) { window.localStorage.setItem('defora_tab', 'AUDIO'); window.localStorage.setItem('defora_subtab_MODULATION', 'AUDIO_REACTIVE'); } } catch (_e) {}
     this.saveSessionState(); return;
   }
   if (id === 'RUNS') {
     this.currentTab = 'SETTINGS';
     this.currentSubTab.SETTINGS = 'RUNS';
     void this.refreshRuns();
     this.syncRunsMonitorPolling();
     try { if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem('defora_tab', 'SETTINGS'); } catch(_e) {}
     this.saveSessionState(); return;
   }
   if (id === 'GENERATE') {
     // GENERATE merged into MOTION — open MOTION with sequencer expanded
     this.currentTab = 'MOTION';
     this.motionSequencerSideOpen = true;
     this.$nextTick(() => { this.refreshSequencerList(); setTimeout(() => this.drawTimeline(), 200); });
     try { if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem('defora_tab', 'MOTION'); } catch(_e) {}
     this.saveSessionState(); return;
   }
   this.currentTab = id;
   if (id === 'MOTION') { this.$nextTick(() => { this.refreshSequencerList(); setTimeout(() => this.drawTimeline(), 200); }); }
   try { if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem('defora_tab', id); } catch(_e) {}
   this.saveSessionState();
 },
 normalizeModulationSubTab(sub) {
   if (sub === 'AUDIO') return 'AUDIO_REACTIVE';
   if (sub === 'ACTIVE' || sub === 'ACTIVE_MODS') return 'MAPPINGS';
   if (sub === 'CROSSFADER') return 'LFO';
   const allowed = ['LFO', 'AV_SYNC', 'AUDIO_REACTIVE', 'BEAT_MACROS', 'MAPPINGS'];
   return allowed.includes(sub) ? sub : 'LFO';
 },
 normalizeLiveSubTab(sub) {
   const allowed = ['MONITOR', 'DEFORUM_JOB'];
   if (sub === 'ADD_SOURCE') return 'MONITOR';
   return allowed.includes(sub) ? sub : 'MONITOR';
 },
 normalizeMotionSubTab(sub) {
  if (sub === 'SEQUENCER') {
    this.motionSequencerSideOpen = true;
    return 'PERFORMANCE';
  }
  return sub === 'PERFORMANCE' ? sub : 'PERFORMANCE';
 },
 switchSubTab(tab, sub) {
  if (tab === 'SETTINGS' && sub === 'RUNS') {
    this.openRunsSettings();
    return;
  }
  if (tab === 'SETTINGS' && sub === 'FORGE') sub = 'GPUS';
  if (tab === 'SETTINGS' && sub === 'KEYS') sub = 'ENGINE';
  if (tab === 'SETTINGS' && (sub === 'BINDINGS' || sub === 'PRESETS')) sub = 'MIDI';
  if (tab === 'MODULATION') sub = this.normalizeModulationSubTab(sub);
  if (tab === 'LIVE') sub = this.normalizeLiveSubTab(sub);
  if (tab === 'MOTION') sub = this.normalizeMotionSubTab(sub);
  if (tab === 'LIVE') {
    if (sub === 'DEFORUM_JOB') {
      this.enginePanelDetailsTab = 'JOB';
      if (!this.liveEngineDrawerOpen) {
        this.liveEngineDrawerOpen = true;
      }
      void this.ensureForgeSamplerSchedulerLists();
    } else {
      this.enginePanelDetailsTab = 'ENGINE';
    }
  }
   this.currentSubTab[tab] = sub;
   try { if (typeof window !== 'undefined' && window.localStorage) window.localStorage.setItem('defora_subtab_' + tab, sub); } catch(_e) {}
  if (tab === 'PROMPTS' && sub !== 'LORA') {
    this.loraPickerOpen = false;
  }
  if (tab === 'PROMPTS' && sub === 'LORA' && !this.lorasLoading && !this.loras.available.length) {
    this.refreshLoras();
  }
  if (tab === 'LIVE' && sub === 'ADD_SOURCE') {
    sub = 'MONITOR';
    this.toggleVideoLayerAdd(true);
  }
  if (tab === 'LIVE' && this.videoLayerAddOpen && !this.systemFiles._rootsLoaded) {
    void this.initSystemFilesBrowser();
  }
  if (tab === 'SETTINGS') {
    if (sub === 'SYSTEM') void this.refreshRuns();
    this.syncRunsMonitorPolling();
  }
 },
 setRunsBrowserTab(tab) {
  if (tab !== 'active' && tab !== 'past' && tab !== 'frames') return;
  this.runsBrowserTab = tab;
  if (tab === 'frames') {
    this.showFrames = true;
    const detail = this.runsDetailView;
    if (detail?.run_id && Array.isArray(detail.frames) && detail.frames.length) {
      this.frameRailRunId = detail.run_id;
    }
    void this.refreshFrames();
  } else if (tab === 'active' || tab === 'past') {
    void this.refreshRuns();
  }
  this.saveSessionState();
 },
 toggleLoraCrossfaderPicker(group) {
  if (group !== 'A' && group !== 'B') return;
  this.loraCrossfaderPickerGroup = this.loraCrossfaderPickerGroup === group ? null : group;
  if (this.loraCrossfaderPickerGroup && !this.lorasLoading && !this.loras.available.length) {
    this.refreshLoras();
  }
},
 togglePlayPause() {
   this.toggleDeforumPlay();
 },
 stopVideo() {
   this.stopDeforumPlay();
 },
 toggleDeforumPlay() {
   if (this.deforumPlaying) {
     this.pauseDeforumAnimation();
   } else {
     this.startDeforumAnimation();
   }
 },
 async startDeforumAnimation() {
   if (!this.guardDeforumSettingsBeforeRun('start the Deforum job')) return;
   if (!this.deforumSessionStartedAt) {
     const ONE_HOUR_MS = 3600000;
     const activeJobs = (this.runsActiveGpuJobs || []).filter((j) => {
       if (!j.startedAt) return false;
       return Date.now() - new Date(j.startedAt).getTime() < ONE_HOUR_MS;
     });
     if (activeJobs.length) {
       const mins = Math.floor((Date.now() - new Date(activeJobs[0].startedAt).getTime()) / 60000);
       const label = mins < 1 ? 'less than a minute' : `${mins} minute${mins !== 1 ? 's' : ''}`;
       const ok = window.confirm(`A Deforum job has been running for ${label}. Stop it and start a new job?`);
       if (!ok) return;
     }
   }
   this.applyCrossfadeMorph();
   this.applyDeforumControlNetForRun();
   if (this.deforumSettings) this.deforumSettings.batch_name = this.session;
   this.queueDeforumSettingsSave();
   const styleSnap = this.buildPromptStyleJobSnapshot();
   if (styleSnap) {
     this.appendRunsJobLog({
       kind: 'job_prompt_styles',
       message: `Prompt styles: ${promptStyleJobSummary(styleSnap) || styleSnap.activeStyleId}`,
       promptStyles: styleSnap,
     });
   }
   this.persistDeforumContinuationFromLatest({ queueSave: false, saveSession: false });
   const startFrame = this.deforumContinuationStartFrameValue();
   this.sendControl('liveParam', { start_frame: startFrame, should_resume: 1 });
   this.pinHeldPreviewFrame();
   this.frameRailFollowLatest = true;
   this.deforumPlaying = true;
   if (!this.deforumSessionStartedAt) this.deforumSessionStartedAt = Date.now();
   this.performance.status = 'Deforum animation playing';
   this.isPlaying = true;
   this.openFramesInRunsPanel();
   this.scheduleFrameRefresh(0);
 },
 pauseDeforumAnimation() {
   this.persistDeforumContinuationFromLatest({ checkpoint: true });
   this.sendControl('liveParam', { is_paused_rendering: 1 });
   this.deforumPlaying = false;
   this.performance.status = 'Animation paused — parameter changes update preview';
   this.isPlaying = false;
 },
 stopDeforumPlay() {
   this.persistDeforumContinuationFromLatest({ checkpoint: true });
   this.sendControl('liveParam', { is_paused_rendering: 1, should_resume: 0 });
   this.deforumPlaying = false;
   this.clearHeldPreviewFrame();
   this.deforumSessionStartedAt = null;
   this.performance.status = '';
   this.isPlaying = false;
   const video = this.playerEl || document.getElementById("player");
   if (video) {
     video.pause();
     video.currentTime = 0;
   }
  this.syncFrameSelectionFromPlayback(0);
 },
 async runStartupWarmup() {
   if (this.deforumPlaying || typeof fetch !== "function") return;
   if (!this.apiStatus?.sdForge?.available) return;
   try {
     const res = await fetch('/api/deforum/warmup', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ maxFrames: 48, fps: 12 }),
     });
     if (!res.ok) return;
     const data = await res.json();
     if (data.ok && data.status !== 'already_running') {
       this.performance.status = 'Startup clip generating… (WebGL stays visible until frames arrive)';
     }
   } catch (_e) {}
 },
 async toggleStreamRecord() {
   if (this.isRecording) {
     this.isRecording = false;
     try {
       const res = await fetch('/api/stream/stop-record', { method: 'POST' });
       const data = await res.json();
       this.performance.status = data.success ? 'Recording stopped' : (data.error || 'Stop failed');
     } catch (e) {
       this.performance.status = 'Stop record failed';
     }
   } else {
     this.isRecording = true;
     const output = `/tmp/defora_rec_${Date.now()}.mp4`;
     try {
       const res = await fetch('/api/stream/record', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ output, fps: 24 }),
       });
       const data = await res.json();
       const errText = String(data.error || data.message || '').trim();
       this.performance.status = data.success
         ? `Recording → ${output}`
         : (errText.includes('python') ? 'Recording unavailable (Python not installed on server)' : (errText || 'Record failed'));
       if (!data.success) this.isRecording = false;
     } catch (e) {
       this.isRecording = false;
       const msg = String(e.message || e);
       this.performance.status = msg.includes('python')
         ? 'Recording unavailable (Python not installed on server)'
         : 'Record failed';
     }
   }
 },
 async toggleRecord() {
   return this.toggleStreamRecord();
 },
newStreamDestination(protocol = 'rtmp') {
  const normalizedProtocol = ['rtmp', 'srt', 'whip'].includes(protocol) ? protocol : 'rtmp';
  const defaults = {
    rtmp: 'Custom RTMP',
    srt: 'Custom SRT',
    whip: 'Custom WHIP',
  };
  const { width, height } = this.currentResolution();
  return {
    id: `stream_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: defaults[normalizedProtocol] || 'Custom Stream',
    protocol: normalizedProtocol,
    target: '',
    fps: Number(this.generator && this.generator.fps) || 24,
    resolution: `${width}x${height}`,
    overlay: '',
    transition: '',
    kbps: null,
    health: 'idle',
  };
},
normalizeStreamDestination(dest, index = 0) {
  const row = dest && typeof dest === 'object' ? dest : {};
  return {
    id: row.id ? String(row.id) : `stream_saved_${index}`,
    name: String(row.name || 'Custom Stream'),
    protocol: ['rtmp', 'srt', 'whip'].includes(row.protocol) ? row.protocol : 'rtmp',
    target: String(row.target || '').trim(),
    fps: Number(row.fps) || 24,
    resolution: String(row.resolution || '1024x576'),
    overlay: String(row.overlay || ''),
    transition: String(row.transition || ''),
    kbps: Number.isFinite(Number(row.kbps)) ? Number(row.kbps) : null,
    health: String(row.health || 'idle'),
  };
},
addStreamDestination(protocol = 'rtmp') {
  const destination = this.newStreamDestination(protocol);
  this.streaming.destinations.push(destination);
  this.saveSessionState();
  return destination;
},
streamDestinationViewUrl(destination) {
  const target = String(destination && destination.target || '').trim();
  if (/^https?:\/\//i.test(target)) return target;
  const href = String(this.hlsStreamHref || '/hls/live/deforum.m3u8');
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return `${window.location.origin}${href.startsWith('/') ? href : `/${href}`}`;
  }
  return href;
},
applyStreamMetricsToDestinations(metrics = {}) {
  const running = !!(metrics && metrics.running);
  const activeId = this.streaming.activeDestinationId;
  const kbps = Number.isFinite(Number(metrics && metrics.kbps)) ? Number(metrics.kbps) : null;
  const fps = Number.isFinite(Number(metrics && metrics.fps)) ? Number(metrics.fps) : null;
  const health = String((metrics && metrics.health) || (running ? 'healthy' : 'offline'));
  this.streaming.destinations = (this.streaming.destinations || []).map((dest) => {
    const isActive = running && activeId === dest.id;
    if (!isActive) {
      if (dest.health === 'healthy' || dest.health === 'degraded') {
        return { ...dest, health: 'idle', kbps: null };
      }
      return dest;
    }
    return {
      ...dest,
      kbps,
      fps: fps || dest.fps,
      health,
    };
  });
},
removeStreamDestination(id) {
  this.streaming.destinations = this.streaming.destinations.filter((dest) => dest.id !== id);
  if (this.streaming.activeDestinationId === id) {
    this.streaming.activeDestinationId = null;
  }
  this.saveSessionState();
},
async refreshStreamStatus() {
  try {
    const res = await fetch('/api/stream/status', { cache: 'no-store' });
    const data = await res.json();
    const metrics = data.metrics && typeof data.metrics === 'object' ? data.metrics : {};
    this.streaming.activeStatus = data.status || metrics.status || 'unknown';
    this.streaming.status = (data.output || '').trim() || (this.streaming.activeStatus === 'running'
      ? 'Outbound stream is running.'
      : 'No outbound stream running.');
    if (this.streaming.activeStatus !== 'running') {
      this.streaming.activeDestinationId = null;
      this.applyStreamMetricsToDestinations({ running: false, health: 'offline' });
    } else {
      const activeId = this.streaming.activeDestinationId;
      if (!activeId && metrics.target) {
        const match = (this.streaming.destinations || []).find(
          (dest) => String(dest.target || '').trim() === String(metrics.target).trim()
        );
        if (match) this.streaming.activeDestinationId = match.id;
      }
      this.applyStreamMetricsToDestinations(metrics);
    }
  } catch (err) {
    this.streaming.activeStatus = 'error';
    this.streaming.status = err.message || 'Failed to read stream status';
    this.applyStreamMetricsToDestinations({ running: false, health: 'error' });
  }
},
async startStreamDestination(id) {
  const destination = this.streaming.destinations.find((dest) => dest.id === id);
  if (!destination) return;
  const target = String(destination.target || '').trim();
  if (!target) {
    this.streaming.status = 'Destination URL is required.';
    return;
  }
  try {
    const res = await fetch('/api/stream/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target,
        fps: Number(destination.fps) || 24,
        resolution: destination.resolution || undefined,
        protocol: destination.protocol || undefined,
        overlay: destination.overlay ? String(destination.overlay).trim() : undefined,
        transition: destination.transition ? String(destination.transition).trim() : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || 'Could not start outbound stream');
    }
    this.streaming.activeDestinationId = id;
    this.streaming.activeStatus = 'running';
    this.streaming.status = (data.message || '').trim() || `Streaming to ${destination.name}`;
    this.streamUrl = target;
    destination.health = 'healthy';
    this.saveSessionState();
    void this.refreshStreamStatus();
  } catch (err) {
    this.streaming.activeStatus = 'error';
    this.streaming.status = err.message || 'Could not start outbound stream';
    const failed = this.streaming.destinations.find((dest) => dest.id === id);
    if (failed) failed.health = 'error';
  }
},
async stopOutboundStream() {
  try {
    const res = await fetch('/api/stream/stop', { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || 'Could not stop outbound stream');
    }
    this.streaming.activeDestinationId = null;
    this.streaming.activeStatus = 'stopped';
    this.streaming.status = (data.message || '').trim() || 'Outbound stream stopped.';
    this.applyStreamMetricsToDestinations({ running: false, health: 'offline' });
    this.saveSessionState();
  } catch (err) {
    this.streaming.activeStatus = 'error';
    this.streaming.status = err.message || 'Could not stop outbound stream';
  }
},
normalizeDefaultAnimationSettings(input = {}) {
  const next = input && typeof input === 'object' ? input : {};
  const mode = ['instancing', 'volume', 'orbital', 'nebula', 'raycast', 'marching', 'ocean', 'customlights', 'transition', 'protoplanet', 'periodic_table'].includes(next.mode) ? next.mode : 'customlights';
  return {
    preferDeforumVideo: !!next.preferDeforumVideo,
    showStandbyClip: !!next.showStandbyClip,
    autoTransitionToDeforum: next.autoTransitionToDeforum !== false,
    mode,
    instCount: Math.max(1000, Math.min(50000, Math.round(Number(next.instCount) || 12000))),
    beamCount: Math.max(3, Math.min(12, Math.round(Number(next.beamCount) || 7))),
    speed: Math.max(0.1, Math.min(2.5, Number(next.speed) || 0.75)),
    spread: Math.max(0.2, Math.min(2.5, Number(next.spread) || 0.68)),
    glow: Math.max(0.1, Math.min(1.4, Number(next.glow) || 0.78)),
    hue: Math.max(0, Math.min(1, Number.isFinite(Number(next.hue)) ? Number(next.hue) : 0.6)),
    pulse: Math.max(0, Math.min(1, Number.isFinite(Number(next.pulse)) ? Number(next.pulse) : 0.36)),
    drift: Math.max(0, Math.min(1, Number.isFinite(Number(next.drift)) ? Number(next.drift) : 0.44)),
    mist: Math.max(0, Math.min(1, Number.isFinite(Number(next.mist)) ? Number(next.mist) : 0.58)),
    orbit: Math.max(0, Math.min(1, Number.isFinite(Number(next.orbit)) ? Number(next.orbit) : 0.52)),
    lineType: next.lineType === 'line' ? 'line' : 'segments',
    lineWidth: Math.max(1, Math.min(10, Number(next.lineWidth) || 2.4)),
    lineThreshold: Math.max(0, Math.min(10, Number.isFinite(Number(next.lineThreshold)) ? Number(next.lineThreshold) : 0.8)),
    lineTranslation: Math.max(0, Math.min(10, Number.isFinite(Number(next.lineTranslation)) ? Number(next.lineTranslation) : 0)),
    lineWorldUnits: next.lineWorldUnits !== false,
    lineVisualizeThreshold: !!next.lineVisualizeThreshold,
    lineAlphaToCoverage: next.lineAlphaToCoverage !== false,
    lineAnimate: next.lineAnimate !== false,
    mcMaterial: ['shiny', 'chrome', 'liquid', 'matte', 'flat', 'plastic', 'colors', 'multiColors'].includes(next.mcMaterial)
      ? next.mcMaterial
      : 'shiny',
    mcNumBlobs: Math.max(1, Math.min(50, Math.round(Number(next.mcNumBlobs) || 10))),
    mcResolution: Math.max(14, Math.min(100, Math.round(Number(next.mcResolution) || 28))),
    mcIsolation: Math.max(10, Math.min(300, Math.round(Number(next.mcIsolation) || 80))),
    mcFloor: next.mcFloor !== false,
    mcWallX: !!next.mcWallX,
    mcWallZ: !!next.mcWallZ,
    ocElevation: Math.max(0, Math.min(90, Number(next.ocElevation) || 2)),
    ocAzimuth: Math.max(-180, Math.min(180, Number.isFinite(Number(next.ocAzimuth)) ? Number(next.ocAzimuth) : 180)),
    ocExposure: Math.max(0, Math.min(1, Number.isFinite(Number(next.ocExposure)) ? Number(next.ocExposure) : 0.1)),
    ocDistortion: Math.max(0, Math.min(8, Number.isFinite(Number(next.ocDistortion)) ? Number(next.ocDistortion) : 3.7)),
    ocSize: Math.max(0.1, Math.min(10, Number.isFinite(Number(next.ocSize)) ? Number(next.ocSize) : 1)),
    ocCloudCoverage: Math.max(0, Math.min(1, Number.isFinite(Number(next.ocCloudCoverage)) ? Number(next.ocCloudCoverage) : 0.4)),
    ocCloudDensity: Math.max(0, Math.min(1, Number.isFinite(Number(next.ocCloudDensity)) ? Number(next.ocCloudDensity) : 0.5)),
    ocCloudElevation: Math.max(0, Math.min(1, Number.isFinite(Number(next.ocCloudElevation)) ? Number(next.ocCloudElevation) : 0.5)),
    forgeLayerOpacity: Math.max(0, Math.min(1, Number.isFinite(Number(next.forgeLayerOpacity)) ? Number(next.forgeLayerOpacity) : 0)),
    rememberCompositorLayerOnStartup: !!next.rememberCompositorLayerOnStartup,
    previewCompositorCrossfadeMs: Math.max(
      0,
      Math.min(5000, Math.round(Number(next.previewCompositorCrossfadeMs) || 800)),
    ),
    forgeLayerOpacityLfoLink: (() => {
      const id = Number(next.forgeLayerOpacityLfoLink);
      return id >= 1 && id <= 6 ? id : null;
    })(),
    forgeLayerOpacityLfoBase: Math.max(0, Math.min(1, Number.isFinite(Number(next.forgeLayerOpacityLfoBase)) ? Number(next.forgeLayerOpacityLfoBase) : (Number(next.forgeLayerOpacity) || 0))),
    deforumBackdropEnabled: next.deforumBackdropEnabled !== false,
    deforumBackdropMix: Math.max(0, Math.min(1, Number.isFinite(Number(next.deforumBackdropMix)) ? Number(next.deforumBackdropMix) : 0.35)),
    txTransition: Math.max(0, Math.min(1, Number.isFinite(Number(next.txTransition)) ? Number(next.txTransition) : 0.5)),
    txTransitionAnimate: next.txTransitionAnimate !== false,
    txSceneAnimate: next.txSceneAnimate !== false,
    txUseTexture: next.txUseTexture !== false,
    txTexture: Math.max(0, Math.min(5, Math.round(Number(next.txTexture) || 0))),
    txCycle: next.txCycle !== false,
    txThreshold: Math.max(0, Math.min(1, Number.isFinite(Number(next.txThreshold)) ? Number(next.txThreshold) : 0.1)),
    ...normalizeProtoplanetSettings(next),
    ppRestartSerial: Math.max(0, Math.round(Number(next.ppRestartSerial) || 0)),
    ...normalizePeriodicTableSettings(next),
  };
},
restartProtoplanetSimulation() {
  this.defaultAnimation = this.normalizeDefaultAnimationSettings({
    ...this.defaultAnimation,
    ppRestartSerial: (Number(this.defaultAnimation.ppRestartSerial) || 0) + 1,
  });
  this.saveSessionState();
},
onDefaultAnimationInput() {
  this.defaultAnimation = this.normalizeDefaultAnimationSettings(this.defaultAnimation);
  this.saveSessionState();
},
liveParamCanonicalKey(key) {
  if (!key) return key;
  return this.liveParamAliases[key] || key;
},
liveHudParamByKey(key) {
  return [...this.liveVibe, ...this.liveCam].find((p) => p.key === key) || null;
},
paramControlMeta(key) {
  const routeKey = this.liveParamCanonicalKey(key);
  let hud = this.liveHudParamByKey(key);
  if (!hud) {
    const hudKey = Object.entries(this.liveParamAliases).find(
      ([, route]) => route === key || route === routeKey
    )?.[0];
    if (hudKey) hud = this.liveHudParamByKey(hudKey);
  }
  if (hud) {
    return {
      min: Number(hud.min ?? 0),
      max: Number(hud.max ?? 1),
      step: Number(hud.step ?? 0.01) || 0.01,
      routeKey,
      hud,
      value: Number(hud.val ?? 0),
    };
  }
  const target = this.modulationTargetByKey(routeKey) || this.modulationTargetByKey(key);
  if (target) {
    let value = Number(target.default ?? 0);
    if (target.field && this.defaultAnimation) {
      const animVal = Number(this.defaultAnimation[target.field]);
      if (Number.isFinite(animVal)) value = animVal;
    } else if (target.key === 'translation_x') {
      value = Number(this.motionPadValues.translation_x ?? 0);
    } else if (target.key === 'translation_y') {
      value = Number(this.motionPadValues.translation_y ?? 0);
    } else if (target.key === 'translation_z') {
      value = Number(this.motionPadValues.translation_z ?? 0);
    } else if (target.key === 'zoom_2d') {
      value = Number(this.motionPadValues.zoom ?? 1);
    }
    return {
      min: Number(target.min ?? 0),
      max: Number(target.max ?? 1),
      step: Number(target.step ?? 0.01) || 0.01,
      routeKey: target.key,
      hud: null,
      value,
    };
  }
  return {
    min: 0,
    max: 1,
    step: 0.01,
    routeKey,
    hud: null,
    value: 0,
  };
},
clampParamToMeta(value, meta) {
  const min = Number(meta?.min ?? 0);
  const max = Number(meta?.max ?? 1);
  const step = Number(meta?.step ?? 0.01) || 0.01;
  let v = this.clampVal(Number(value), min, max);
  if (step > 0) {
    v = Math.round(v / step) * step;
    const decimals = (String(step).split('.')[1] || '').length;
    if (decimals > 0) v = Number(v.toFixed(decimals));
  }
  return v;
},
syncHudMotionFromParam(hudKey, value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return;
  if (hudKey === 'panx') this.motionPadValues.translation_x = v;
  else if (hudKey === 'pany') this.motionPadValues.translation_y = v;
  else if (hudKey === 'zoom') this.motionPadValues.zoom = v;
},
modulationTargetByKey(key) {
  if (!key) return null;
  const canonical = this.liveParamCanonicalKey(key);
  return this.lfoTargets.find((t) => t.key === canonical || t.key === key)
    || this.animationTargets.find((t) => t.key === canonical || t.key === key)
    || null;
},
isAnimationModKey(key) {
  return typeof key === 'string' && key.startsWith('anim_');
},
applyAnimationModulation(field, value) {
  if (!field) return;
  this.defaultAnimation = this.normalizeDefaultAnimationSettings({
    ...this.defaultAnimation,
    [field]: value,
  });
},
routeModulationValue(key, value, payload, cnUpdates) {
  const pluginParsed = parseCommonVisualModKey(key);
  if (pluginParsed) {
    this.writeCommonVisualValue(pluginParsed.pluginId, pluginParsed.paramId, value);
    return;
  }
  if (String(key).startsWith('wan.')) {
    this.onWanEngineFieldChange(String(key).slice(4), value, 'number');
    return;
  }
  const anim = this.animationTargets.find((t) => t.key === key);
  if (anim) {
    this.applyAnimationModulation(anim.field, value);
    return;
  }
  if (key.startsWith('cn_')) {
    const parts = key.split('_');
    const slotId = parts[1];
    const field = parts[2];
    const slot = this.cn.slots.find((s) => s.id === slotId);
    if (slot) {
      if (field === 'weight') slot.weight = value;
      else if (field === 'start') slot.start = value;
      else if (field === 'end') slot.end = value;
      cnUpdates[slotId] = slot;
    }
    return;
  }
  payload[key] = value;
},
readCommonVisualValue(pluginId, paramId) {
  const binding = bindingFor(pluginId, paramId);
  const param = COMMON_VISUAL_PARAMS.find((p) => p.id === paramId);
  if (!param || binding.type === 'disabled') return param?.default ?? 0;
  if (binding.type === 'animation') {
    const field = binding.field;
    const val = Number(this.defaultAnimation?.[field]);
    return Number.isFinite(val) ? val : param.default;
  }
  if (binding.type === 'schedule') {
    const raw = readScheduleValueAtFrame(this.deforumSettings?.[binding.key], 0);
    const val = Number(raw);
    return Number.isFinite(val) ? val : param.default;
  }
  if (binding.type === 'wan') {
    const val = Number(this.wanEngine?.[binding.key]);
    return Number.isFinite(val) ? val : param.default;
  }
  return param.default;
},
writeCommonVisualValue(pluginId, paramId, rawValue) {
  const binding = bindingFor(pluginId, paramId);
  if (binding.type === 'disabled') return;
  const param = COMMON_VISUAL_PARAMS.find((p) => p.id === paramId);
  const num = Number(rawValue);
  if (!Number.isFinite(num) || !param) return;
  const clamped = this.clampVal(num, param.min, param.max);
  if (binding.type === 'animation') {
    this.defaultAnimation = this.normalizeDefaultAnimationSettings({
      ...this.defaultAnimation,
      [binding.field]: clamped,
    });
    this.saveSessionState();
    return;
  }
  if (binding.type === 'schedule') {
    this.onDeforumFieldInput(binding.key, `0:(${clamped})`, 'text');
    return;
  }
  if (binding.type === 'wan') {
    this.onWanEngineFieldChange(binding.key, clamped, 'number');
  }
},
onCommonVisualInput(paramId, rawValue, pluginIdOverride) {
  const pluginId = pluginIdOverride || this.activeAnimationPluginId;
  if (!pluginId) return;
  this.writeCommonVisualValue(pluginId, paramId, rawValue);
},
commonVisualItemsForPlugin(pluginId) {
  if (!pluginId) return [];
  return COMMON_VISUAL_PARAMS.map((p) => {
    const disabled = !isCommonVisualEnabled(pluginId, p.id);
    const value = disabled ? p.default : this.readCommonVisualValue(pluginId, p.id);
    const readout = Number.isFinite(value)
      ? (Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2))
      : '—';
    return { ...p, paramId: p.id, value, readout, disabled };
  });
},
setDefaultAnimationMode(mode) {
  this.defaultAnimation = this.normalizeDefaultAnimationSettings({
    ...this.defaultAnimation,
    mode,
  });
  this.saveSessionState();
},
resetDefaultAnimationSettings() {
  const preferDeforumVideo = !!(this.defaultAnimation && this.defaultAnimation.preferDeforumVideo);
  this.defaultAnimation = this.normalizeDefaultAnimationSettings({ preferDeforumVideo });
  this.saveSessionState();
},
setPreferDeforumVideo(prefer) {
  this.defaultAnimation = this.normalizeDefaultAnimationSettings({
    ...this.defaultAnimation,
    preferDeforumVideo: prefer,
  });
  if (prefer) {
    if (!this.isForgeAnimationLayerActive) {
      this.activeVideoLayerId = 'deforum';
    }
    this.videoReady = false;
    if (this.hlsWatchEnabled) this.attachPlayer();
  } else if (this.isForgeAnimationLayerActive) {
    this.activeVideoLayerId = 'webgl';
  }
  this.saveSessionState();
},
async loadStandbyPreviewVideo() {
  try {
    const res = await fetch("/api/preview/standby-video", { method: "HEAD" });
    if (!res.ok) return;
    this.standbyPreviewVideoUrl = "/api/preview/standby-video";
    this.$nextTick(() => this.attachStandbyPreview());
  } catch (_e) {
    /* no standby file */
  }
},
attachStandbyPreview() {
  const video = this.$refs.standbyPreviewEl;
  if (!video || !this.standbyPreviewVideoUrl) return;
  if (typeof video.play === "function") {
    video.play().catch(() => {});
  }
},
setHlsPreviewStreamValid(valid) {
  this.hlsPreviewStreamValid = !!valid;
},
enableHlsWatch() {
  if (!this.hlsPreviewStreamValid) return;
  if (this.hlsWatchEnabled) return;
  this.hlsWatchEnabled = true;
  this.videoReady = false;
  this.attachPlayer();
  this.saveSessionState();
},
disableHlsWatch() {
  if (!this.hlsWatchEnabled) return;
  this.hlsWatchEnabled = false;
  this.detachHlsPlayer();
  this.saveSessionState();
},
detachHlsPlayer() {
  const video = this.playerEl || document.getElementById("player");
  if (video) {
    this.detachPlayerListeners(video);
    if (typeof video.pause === "function") video.pause();
    video.removeAttribute("src");
    if (typeof video.load === "function") video.load();
  }
  if (this.hls && this.hls.destroy) {
    this.hls.destroy();
    this.hls = null;
  }
  this.videoReady = false;
  this.markVideoReady(false);
},
rebuildVideoLayers() {
  const prev = Array.isArray(this.videoLayers) ? this.videoLayers : [];
  const prevVisible = (id) => {
    const layer = prev.find((row) => row && row.id === id);
    return layer ? layer.previewVisible !== false : true;
  };
  const prevOpacity = (id, kind) => {
    const layer = prev.find((row) => row && row.id === id);
    if (layer && Number.isFinite(Number(layer.opacity))) {
      return Math.max(0, Math.min(1, Number(layer.opacity)));
    }
    if (kind === 'deforum' || kind === 'wan' || kind === 'animatelcm' || kind === 'svd' || kind === 'blend') {
      const raw = Number(this.defaultAnimation?.forgeLayerOpacity);
      return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
    }
    return kind === 'webgl' ? 1 : 0;
  };
  const custom = (this.liveSources || []).map((source) => ({
    id: source.id,
    kind: source.type === 'cloud' ? 'cloud' : 'library',
    label: source.label || 'Source',
    playbackUrl: source.playbackUrl || null,
    url: source.url || null,
    builtin: false,
    previewVisible: true,
    opacity: 1,
  }));
  this.videoLayers = [
    { id: 'webgl', kind: 'webgl', label: 'WebGL', builtin: true, previewVisible: prevVisible('webgl'), opacity: prevOpacity('webgl', 'webgl') },
    { id: 'deforum', kind: 'deforum', label: 'Deforum', builtin: true, previewVisible: prevVisible('deforum'), opacity: prevOpacity('deforum', 'deforum') },
    { id: 'wan', kind: 'wan', label: 'WAN Video', builtin: true, previewVisible: prevVisible('wan'), opacity: prevOpacity('wan', 'wan') },
    { id: 'animatelcm', kind: 'animatelcm', label: 'AnimateLCM', builtin: true, previewVisible: prevVisible('animatelcm'), opacity: prevOpacity('animatelcm', 'animatelcm') },
    { id: 'svd', kind: 'svd', label: 'SVD', builtin: true, previewVisible: prevVisible('svd'), opacity: prevOpacity('svd', 'svd') },
    {
      id: 'input',
      kind: 'input',
      label: this.inputLayerLabel || 'Input',
      playbackUrl: this.inputLayerPlaybackUrl || null,
      builtin: true,
      previewVisible: prevVisible('input'),
      opacity: prevOpacity('input', 'input'),
    },
    ...custom,
  ];
},
findVideoLayer(layerId) {
  return (this.videoLayers || []).find((row) => row && row.id === layerId) || null;
},
readVideoLayerOpacity(layer) {
  if (!layer) return 1;
  const raw = Number(layer.opacity);
  if (Number.isFinite(raw)) return Math.max(0, Math.min(1, raw));
  if (layer.kind === 'deforum' || layer.kind === 'wan' || layer.kind === 'animatelcm' || layer.kind === 'svd' || layer.kind === 'blend') {
    const forgeRaw = Number(this.defaultAnimation?.forgeLayerOpacity);
    return Number.isFinite(forgeRaw) ? Math.max(0, Math.min(1, forgeRaw)) : 0;
  }
  return 1;
},
layerKindVisible(kind) {
  const layer = (this.videoLayers || []).find((row) => row && row.kind === kind);
  if (!layer) return true;
  if (!this.isVideoLayerPreviewVisible(layer)) return false;
  if (this.readVideoLayerOpacity(layer) <= 0.001) return false;
  return true;
},
videoLayerRenderStyle(layerId) {
  const layer = this.findVideoLayer(layerId);
  if (!layer || !this.isVideoLayerPreviewVisible(layer)) {
    return { opacity: '0', visibility: 'hidden', pointerEvents: 'none' };
  }
  const opacity = this.readVideoLayerOpacity(layer);
  if (opacity <= 0.001) {
    return { opacity: '0', visibility: 'hidden', pointerEvents: 'none' };
  }
  return { opacity: String(opacity), visibility: 'visible' };
},
setVideoLayerOpacity(layerId, value) {
  const layer = this.findVideoLayer(layerId);
  if (!layer || !layer.builtin) return;
  const next = Math.max(0, Math.min(1, Number(value)));
  layer.opacity = next;
  if (layer.kind === 'deforum' || layer.kind === 'wan' || layer.kind === 'animatelcm' || layer.kind === 'svd' || layer.kind === 'blend') {
    this.applyForgeLayerOpacity(next, { commitBase: true });
  } else {
    this.saveSessionState();
  }
},
isVideoLayerPreviewVisible(layer) {
  return !!(layer && layer.previewVisible !== false);
},
toggleVideoLayerPreview(layerId) {
  const layer = this.findVideoLayer(layerId);
  if (!layer || !layer.builtin) return;
  layer.previewVisible = layer.previewVisible === false;
  if (layer.previewVisible === false && this.activeVideoLayerId === layerId) {
    const fallback = (this.videoLayers || []).find(
      (row) => row && row.builtin && row.id !== layerId && row.previewVisible !== false,
    );
    if (fallback) this.selectVideoLayer(fallback.id);
  }
  this.saveSessionState();
},
videoLayerStatusShort(layer) {
  const tone = this.layerStatus(layer);
  if (tone === 'green') return 'Ready';
  if (tone === 'yellow') return 'Loading';
  return 'Offline';
},
toggleEnginePanelDetails(open) {
  const next = typeof open === 'boolean' ? open : !this.enginePanelDetailsOpen;
  this.enginePanelDetailsOpen = next;
  this.liveAnimationBoxOpen = next;
  if (next && this.enginePanelDetailsTab === 'JOB') {
    void this.ensureForgeSamplerSchedulerLists();
  }
  this.saveSessionState();
},
setEnginePanelDetailsTab(tab) {
  if (tab !== 'ENGINE' && tab !== 'JOB') return;
  this.enginePanelDetailsTab = tab;
  this.currentSubTab.LIVE = tab === 'JOB' ? 'DEFORUM_JOB' : 'MONITOR';
  if (this.currentTab === 'LIVE' && !this.liveEngineDrawerOpen) {
    this.liveEngineDrawerOpen = true;
  }
  if (tab === 'JOB') void this.ensureForgeSamplerSchedulerLists();
  this.saveSessionState();
},
openEngineControlsInRightPanel() {
  this.setEnginePanelDetailsTab('ENGINE');
},
async probeHlsPreviewStream() {
  if (typeof fetch !== 'function') return;
  try {
    const base = String(this.streamSrc || '/hls/live/deforum.m3u8');
    const url = base.includes('?') ? `${base}&probe=${Date.now()}` : `${base}?probe=${Date.now()}`;
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (res.ok) this.setHlsPreviewStreamValid(true);
  } catch (_e) {
    /* stream may not be up yet */
  }
},
async preloadDeforumPipeline({ force = false } = {}) {
  if (this._preloadDeforumStarted && !force) return;
  this._preloadDeforumStarted = true;
  this.deforumPreloadStatus = 'Preparing Deforum…';
  void this.ensureForgeSamplerSchedulerLists();
  void this.probeHlsPreviewStream();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
  const forgeUp = !!(this.apiHealth?.sdForge?.available || this.forge?.available);
  if (forgeUp) {
    await this.runStartupWarmup();
    this.deforumPreloadStatus = this.deforumGeneratedFrameCount > 0
      ? 'Deforum ready'
      : 'Deforum warming up in background';
  } else {
    this.deforumPreloadStatus = 'Waiting for Forge…';
  }
},
initVideoLayers() {
  this.rebuildVideoLayers();
  const allowed = new Set(this.videoLayers.map((layer) => layer.id));
  const remember = !!this.defaultAnimation?.rememberCompositorLayerOnStartup;
  const preferDeforum = remember && !!this.defaultAnimation?.preferDeforumVideo;
  if (preferDeforum && allowed.has('deforum')) {
    this.activeVideoLayerId = 'deforum';
  } else if (!allowed.has(this.activeVideoLayerId)) {
    this.activeVideoLayerId = 'webgl';
  }
  this.$nextTick(() => {
    if (this.showLayerInputVideo) this.attachInputVideo(this.activeLayerPlaybackUrl);
  });
},
ensureStandbyAnimationAtStartup() {
  const remember = !!this.defaultAnimation?.rememberCompositorLayerOnStartup;
  const preferDeforum = remember && !!this.defaultAnimation?.preferDeforumVideo;
  const deforumLive = this.deforumPlaying && this.videoReady;
  if (!preferDeforum && !deforumLive && this.activeVideoLayerId !== 'webgl' && !this.isBlendLayerActive) {
    this.activeVideoLayerId = 'webgl';
  }
  const webgl = this.findVideoLayer('webgl');
  if (webgl && !remember) {
    webgl.previewVisible = true;
    if (!Number.isFinite(Number(webgl.opacity)) || Number(webgl.opacity) <= 0) {
      webgl.opacity = 1;
    }
  }
  if (!this.defaultAnimation?.mode) {
    this.defaultAnimation = this.normalizeDefaultAnimationSettings(this.defaultAnimation);
  }
  this.$nextTick(() => this.kickstandbyAnimation());
},
pinHeldPreviewFrame() {
  const path = this.activePreviewStillPath || this.displayedPreviewStillPath;
  if (path) this.heldPreviewFramePath = path;
},
resetForgePreviewProgress() {
  this.forgeLivePreviewImage = '';
  this.previewProgressPct = null;
},
stopForgePreviewProgressPoll() {
  if (this.previewProgressPollTimer) {
    clearInterval(this.previewProgressPollTimer);
    this.previewProgressPollTimer = null;
  }
},
async pollForgePreviewProgress({ batchId = null, maxFrames = 1 } = {}) {
  if (!this.previewGenerating) return;
  try {
    const params = new URLSearchParams({ includeImage: '1', maxFrames: String(Math.max(1, Number(maxFrames) || 1)) });
    if (batchId) params.set('batchId', String(batchId));
    const res = await fetch(`/api/forge/progress?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!this.previewGenerating || !res.ok || !data.ok) return;
    if (data.previewImage) {
      this.forgeLivePreviewImage = data.previewImage;
    }
    if (data.progressPct != null) {
      this.previewProgressPct = data.progressPct;
    }
    if (data.progressLabel) {
      this.performance.status = `Rendering preview · ${data.progressLabel}`;
    } else if (data.progressPct != null) {
      this.performance.status = `Rendering preview · ${data.progressPct}%`;
    }
  } catch (_err) {
    /* forge may be offline mid-poll */
  }
},
startForgePreviewProgressPoll({ batchId = null, maxFrames = 1 } = {}) {
  this.stopForgePreviewProgressPoll();
  this.resetForgePreviewProgress();
  const poll = () => {
    void this.pollForgePreviewProgress({ batchId, maxFrames });
  };
  poll();
  const delay = this.wsStatus === 'connected' ? 400 : 750;
  this.previewProgressPollTimer = setInterval(poll, delay);
},
clearHeldPreviewFrame() {
  this.heldPreviewFramePath = "";
},
clearFrameThumbLoadingState() {
  this.frameThumbLoadingKeys = {};
},
markFrameThumbLoading(srcKey) {
  const key = this.frameSrcKey(srcKey);
  if (!key) return;
  const loading = this.frameThumbLoadingKeys || {};
  if (loading[key]) return;
  this.frameThumbLoadingKeys = { ...loading, [key]: true };
},
markFrameThumbLoaded(srcKey) {
  const key = this.frameSrcKey(srcKey);
  if (!key || !this.frameThumbLoadingKeys[key]) return;
  const next = { ...this.frameThumbLoadingKeys };
  delete next[key];
  this.frameThumbLoadingKeys = next;
},
isFrameThumbLoading(thumb) {
  const key = this.frameSrcKey(thumb && (thumb.src || thumb.url || thumb.path || ''));
  return !!key && !!this.frameThumbLoadingKeys[key];
},
onFrameThumbImageLoad(thumb) {
  this.markFrameThumbLoaded(thumb && (thumb.src || thumb.url || thumb.path || ''));
},
onFrameThumbImageError(thumb) {
  this.markFrameThumbLoaded(thumb && (thumb.src || thumb.url || thumb.path || ''));
},
onPreviewStillImageLoad() {
  this.markFrameThumbLoaded(this.displayedPreviewStillPath);
},
onPreviewStillImageError() {
  this.markFrameThumbLoaded(this.displayedPreviewStillPath);
},
applyNewGeneratedFrames(previousCount) {
  const thumbs = this.frameStripThumbs;
  const newCount = thumbs.length;
  if (newCount <= previousCount) return;
  for (let i = previousCount; i < newCount; i += 1) {
    const thumb = thumbs[i];
    if (thumb) this.markFrameThumbLoading(thumb.src || thumb.url || thumb.path || '');
  }
  if (this.deforumPlaying && this.frameRailFollowLatest) {
    this.followLatestGeneratedFrame();
    return;
  }
  if (!Number.isFinite(Number(this.selectedFrameIndex)) || this.selectedFrameIndex < 0) {
    this.selectFrame(thumbs.length - 1, { scroll: false });
  }
},
followLatestGeneratedFrame() {
  const thumbs = this.frameStripThumbs;
  if (!thumbs.length) return;
  const latest = thumbs[thumbs.length - 1];
  const path = (latest && (latest.src || latest.url || latest.path)) || '';
  if (path) this.markFrameThumbLoading(path);
  this.selectFrame(thumbs.length - 1, { scroll: true });
  this.updateHeldPreviewFromLatestFrame();
  if (path) {
    this.performance.lastPreviewPath = path;
    this.generator.lastPath = path;
  }
  this.persistDeforumContinuationFromLatest({ queueSave: true, saveSession: false });
},
updateHeldPreviewFromLatestFrame() {
  if (!this.deforumPlaying || this.showDeforumVideo) return;
  const path = this.latestGeneratedFramePath;
  if (path) this.heldPreviewFramePath = path;
},
applyStartupVideoPreview() {
  const remember = !!this.defaultAnimation?.rememberCompositorLayerOnStartup;
  if (!remember) {
    this._userPickedPreviewLayer = false;
    this.activeVideoLayerId = 'webgl';
    this.heldPreviewFramePath = '';
    const webgl = this.findVideoLayer('webgl');
    if (webgl) {
      webgl.previewVisible = true;
      webgl.opacity = 1;
    }
    (this.videoLayers || []).forEach((layer) => {
      if (!layer || !layer.builtin) return;
      if (layer.id === 'webgl') return;
      if (layer.kind === 'deforum' || layer.kind === 'wan' || layer.kind === 'animatelcm' || layer.kind === 'svd' || layer.kind === 'blend') {
        layer.opacity = 0;
        if (layer.id !== 'deforum') layer.previewVisible = false;
      } else if (layer.kind === 'input') {
        layer.opacity = 0;
      }
    });
    this.applyForgeLayerOpacity(0, { commitBase: true });
  }
  this.defaultAnimation = this.normalizeDefaultAnimationSettings({
    ...this.defaultAnimation,
    preferDeforumVideo: remember ? this.defaultAnimation.preferDeforumVideo : false,
    autoTransitionToDeforum: this.defaultAnimation?.autoTransitionToDeforum !== false,
  });
  this.$nextTick(() => this.kickstandbyAnimation());
},
applyContextPanelStartupDefaults() {
  let panelPrefLoaded = false;
  try {
    const raw = window.localStorage?.getItem(this.sessionStorageKey());
    if (raw) {
      const s = JSON.parse(raw);
      panelPrefLoaded = typeof s.rightPanelOpen === 'boolean' || typeof s.liveDrawerOpen === 'boolean';
    }
  } catch (_e) {}
  if (!panelPrefLoaded) {
    this.rightPanelOpen = true;
  }
  let savedTab = 'LIVE';
  try {
    savedTab = window.localStorage?.getItem('defora_tab') || 'LIVE';
  } catch (_e) {}
  if (savedTab === 'LIVE' && !this.libraryWorkspaceOpen) {
    this.switchTab('MODULATION');
  }
},
promoteToDeforum() {
  this.selectVideoLayer('deforum', { userInitiated: true });
},
setDeforumControlTab(tabId = 'settings') {
  const allowed = ['settings', 'controlnet', 'motion', 'macros'];
  if (!allowed.includes(tabId)) return;
  this.deforumControlTab = tabId;
  this.saveSessionState();
},
openEngineDeforumSettingsTab(tabId = 'canvas') {
  const allowed = (this.deforumLayerFieldGroups || []).map((g) => g.id);
  const next = allowed.includes(tabId) ? tabId : 'canvas';
  this.liveEngineDrawerOpen = true;
  this.promoteToDeforum();
  this.deforumControlTab = 'settings';
  this.deforumActiveTab = next;
  this.saveSessionState();
},
applyForgeLayerOpacity(value, { commitBase = false, fromModulation = false } = {}) {
  const next = this.clampVal(Number(value) || 0, 0, 1);
  this.defaultAnimation.forgeLayerOpacity = next;
  if (commitBase || !fromModulation) {
    this.defaultAnimation.forgeLayerOpacityLfoBase = next;
  }
  (this.videoLayers || []).forEach((layer) => {
    if (layer && (layer.kind === 'deforum' || layer.kind === 'wan' || layer.kind === 'animatelcm' || layer.kind === 'svd' || layer.kind === 'blend')) {
      layer.opacity = next;
    }
  });
  if (!fromModulation) this.onDefaultAnimationInput();
  this.syncDeforumBackdropToWebGL();
},
syncDeforumBackdropToWebGL() {
  const bg = this.$refs.threeBackgroundRef;
  if (!bg || typeof bg.setDeforumBackdropFromUrl !== 'function') return;
  if (this.defaultAnimation?.deforumBackdropEnabled === false) {
    if (typeof bg.clearDeforumBackdrop === 'function') bg.clearDeforumBackdrop();
    return;
  }
  const showOnWebgl = this.isWebglLayerActive || this.isBlendLayerActive;
  if (!showOnWebgl) {
    if (typeof bg.clearDeforumBackdrop === 'function') bg.clearDeforumBackdrop();
    return;
  }
  const thumb = (this.thumbs || []).slice(-1)[0];
  const src = thumb && (thumb.src || thumb.url || thumb.path);
  if (!src) {
    if (typeof bg.clearDeforumBackdrop === 'function') bg.clearDeforumBackdrop();
    return;
  }
  const baseMix = this.clampVal(Number(this.defaultAnimation?.deforumBackdropMix ?? 0.35), 0, 1);
  const forgeOp = this.effectiveForgeLayerOpacity;
  const opacity = this.isBlendLayerActive ? baseMix * (1 - forgeOp) : baseMix;
  bg.setDeforumBackdropFromUrl(src, { opacity });
},
setForgeLayerOpacityLfoLink(lfoId) {
  const nextId = Number(lfoId || 0);
  const allowed = nextId >= 1 && nextId <= 6 ? nextId : null;
  this.defaultAnimation.forgeLayerOpacityLfoLink = this.defaultAnimation.forgeLayerOpacityLfoLink === allowed
    ? null
    : allowed;
  this.defaultAnimation.forgeLayerOpacityLfoBase = this.defaultAnimation.forgeLayerOpacity;
  if (this.defaultAnimation.forgeLayerOpacityLfoLink) {
    const linked = this.lfos.find((lfo) => lfo.id === this.defaultAnimation.forgeLayerOpacityLfoLink);
    if (linked) linked.on = true;
    if (!this.isForgeAnimationLayerActive) {
      this.selectVideoLayer('deforum', { userInitiated: false });
    }
  }
  this.onDefaultAnimationInput();
},
maybePromoteDeforumPreview() {
  const anim = this.defaultAnimation || {};
  if (anim.autoTransitionToDeforum === false) return;
  if (this._userPickedPreviewLayer) return;
  if (this.activeVideoLayerId !== 'webgl') return;
  if (!this.deforumPlaying && !this.deforumGeneratedFrameCount) return;
  this.selectVideoLayer('deforum', { userInitiated: false });
},
kickstandbyAnimation(attempts = 0) {
  const bg = this.$refs.threeBackgroundRef;
  if (bg && typeof bg.ensureRunning === 'function') {
    bg.ensureRunning();
    return;
  }
  if (attempts < 30 && typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => this.kickstandbyAnimation(attempts + 1));
  }
},
selectVideoLayer(id, opts = {}) {
  if (!this.videoLayers.find((layer) => layer.id === id)) return;
  if (opts.userInitiated !== false) this._userPickedPreviewLayer = true;
  this.activeVideoLayerId = id;
  const layer = this.activeVideoLayer;
  if (layer?.kind === 'webgl') {
    this.setPreferDeforumVideo(false);
    this.clearHeldPreviewFrame();
    this.kickstandbyAnimation();
    return;
  }
  if (layer?.kind === 'blend') {
    this.defaultAnimation = this.normalizeDefaultAnimationSettings({
      ...this.defaultAnimation,
      preferDeforumVideo: true,
    });
    this.videoReady = false;
    if (this.hlsWatchEnabled) this.attachPlayer();
    this.kickstandbyAnimation();
    this.saveSessionState();
    return;
  }
  if (layer?.kind === 'deforum') {
    this.setPreferDeforumVideo(true);
    if (!this.deforumPlaying) {
      this.scheduleDeforumPreview();
      void this.preloadDeforumPipeline();
    }
    return;
  }
  if (layer?.kind === 'wan') {
    this.defaultAnimation = this.normalizeDefaultAnimationSettings({
      ...this.defaultAnimation,
      preferDeforumVideo: true,
    });
    this.videoReady = false;
    if (this.hlsWatchEnabled) this.attachPlayer();
    this.queueDeforumSettingsSave();
    if (!this.deforumPlaying) this.scheduleDeforumPreview();
    this.saveSessionState();
    return;
  }
  if (layer?.kind === 'wan') {
    this.defaultAnimation = this.normalizeDefaultAnimationSettings({
      ...this.defaultAnimation,
      preferDeforumVideo: true,
    });
    this.videoReady = false;
    if (this.hlsWatchEnabled) this.attachPlayer();
    this.queueDeforumSettingsSave();
    this.saveSessionState();
    return;
  }
  this.defaultAnimation = this.normalizeDefaultAnimationSettings({
    ...this.defaultAnimation,
    preferDeforumVideo: false,
  });
  if (layer?.playbackUrl || (layer?.kind === 'input' && this.inputLayerPlaybackUrl)) {
    this.$nextTick(() => this.attachInputVideo(this.activeLayerPlaybackUrl));
  }
  this.saveSessionState();
},
toggleVideoLayerAdd(open) {
  const next = typeof open === 'boolean' ? open : !this.videoLayerAddOpen;
  this.videoLayerAddOpen = next;
  if (next && !this.systemFiles._rootsLoaded) {
    void this.initSystemFilesBrowser();
  }
  this.saveSessionState();
},
_buildSceneSnapshot(name) {
  return {
    name,
    layers: (this.videoLayers || []).map((l) => ({
      id: l.id,
      kind: l.kind,
      opacity: typeof l.opacity === 'number' ? l.opacity : 1,
      previewVisible: l.previewVisible !== false,
    })),
    activeLayerId: this.activeVideoLayerId,
  };
},
syncLayerCompositing() {
  this.$nextTick(() => {
    if (typeof this.onDefaultAnimationInput === 'function') this.onDefaultAnimationInput();
  });
},
_applySceneSnapshot(scene) {
  if (!scene || !Array.isArray(scene.layers)) return;
  (this.videoLayers || []).forEach((layer) => {
    const s = scene.layers.find((l) => l.id === layer.id);
    if (!s) return;
    layer.opacity = typeof s.opacity === 'number' ? s.opacity : layer.opacity;
    layer.previewVisible = s.previewVisible !== false;
  });
  if (scene.activeLayerId) this.activeVideoLayerId = scene.activeLayerId;
  this.syncLayerCompositing();
  this.saveSessionState();
},
saveScene(name, asDefault = false) {
  const sceneName = (name || '').trim() || 'scene';
  const snap = this._buildSceneSnapshot(sceneName);
  const scenes = Array.isArray(this.savedScenes) ? [...this.savedScenes] : [];
  const idx = scenes.findIndex((s) => s.name === sceneName);
  if (idx >= 0) scenes[idx] = snap; else scenes.push(snap);
  this.savedScenes = scenes;
  if (asDefault) this.defaultSceneName = sceneName;
  try { localStorage.setItem('defora_scenes', JSON.stringify({ scenes, defaultSceneName: this.defaultSceneName })); } catch (_) {}
  this.saveSessionState();
},
loadScene(name) {
  const scene = (this.savedScenes || []).find((s) => s.name === name);
  if (scene) this._applySceneSnapshot(scene);
},
deleteScene(name) {
  this.savedScenes = (this.savedScenes || []).filter((s) => s.name !== name);
  if (this.defaultSceneName === name) this.defaultSceneName = 'default';
  try { localStorage.setItem('defora_scenes', JSON.stringify({ scenes: this.savedScenes, defaultSceneName: this.defaultSceneName })); } catch (_) {}
  this.saveSessionState();
},
initDefaultScene() {
  try {
    const raw = localStorage.getItem('defora_scenes');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.scenes) && parsed.scenes.length) {
        this.savedScenes = parsed.scenes;
        this.defaultSceneName = parsed.defaultSceneName || 'default';
        const def = parsed.scenes.find((s) => s.name === (parsed.defaultSceneName || 'default'));
        if (def) { this._applySceneSnapshot(def); return; }
      }
    }
  } catch (_) {}
  // No saved scenes — WebGL full opacity; other engines hidden until user raises opacity or frames arrive
  (this.videoLayers || []).forEach((l) => {
    if (l.id === 'webgl') { l.opacity = 1; l.previewVisible = true; }
    else if (l.id === 'deforum') { l.opacity = 0; l.previewVisible = true; }
    else if (l.id === 'wan') { l.opacity = 0; l.previewVisible = false; }
    else { l.previewVisible = false; l.opacity = 0; }
  });
  this.applyForgeLayerOpacity(0, { commitBase: true });
  this.syncLayerCompositing();
},
closeVideoLayer(id) {
  if (id === 'webgl' || id === 'deforum' || id === 'wan' || id === 'blend' || id === 'input') return;
  this.removeLiveSource(id);
  if (this.activeVideoLayerId === id) {
    this.selectVideoLayer('input');
  }
},
attachInputVideo(src) {
  const video = this.$refs.inputVideoEl;
  if (!video || !src) return;
  this.inputVideoReady = false;
  if (!this._inputVideoReadyHandler) {
    this._inputVideoReadyHandler = () => {
      try {
        this.inputVideoReady = video.readyState >= 2;
      } catch (_e) {
        this.inputVideoReady = true;
      }
    };
  }
  video.removeEventListener?.("loadeddata", this._inputVideoReadyHandler);
  video.removeEventListener?.("canplay", this._inputVideoReadyHandler);
  video.addEventListener?.("loadeddata", this._inputVideoReadyHandler);
  video.addEventListener?.("canplay", this._inputVideoReadyHandler);
  if (video.src !== src) {
    video.src = src;
    video.load();
  }
  try {
    const p = video.play?.();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (_e) {}
},
openCloudLayer(layer) {
  if (!layer?.url) return;
  window.open(layer.url, '_blank', 'noopener');
},
toggleVideoStageSize(next) {
  const allowed = ['small', 'medium', 'full'];
  const target = allowed.includes(String(next)) ? String(next) : null;
  const order = ['small', 'medium', 'full'];
  const current = allowed.includes(this.videoStageSize) ? this.videoStageSize : 'medium';
  const desired = target || order[(order.indexOf(current) + 1) % order.length];
  this.videoStageSize = desired;
  this.saveSessionState();
},
isVideoLayerRunning(layer) {
  if (!layer) return false;
  if (layer.kind === 'webgl') return this.layerKindVisible('webgl');
  if (layer.kind === 'deforum' || layer.kind === 'wan' || layer.kind === 'animatelcm' || layer.kind === 'svd') {
    return (
      this.deforumPlaying
      || this.videoReady
      || this.deforumGeneratedFrameCount > 0
      || this.showFrameProcessing
    );
  }
  if (layer.kind === 'blend') {
    return (
      this.showDefaultAnimation
      && (this.showDeforumVideo || this.deforumPlaying || this.videoReady || this.deforumGeneratedFrameCount > 0)
    );
  }
  if (layer.kind === 'input') {
    return !!(this.inputLayerPlaybackUrl || layer.playbackUrl);
  }
  if (layer.kind === 'library') return !!layer.playbackUrl;
  if (layer.kind === 'cloud') return !!layer.url;
  return this.layerStatus(layer) !== 'red';
},
layerStatus(layer) {
  if (!layer) return 'red';
  if (layer.kind === 'webgl') return 'green';
  if (layer.kind === 'blend') {
    if (this.showDeforumVideo) return 'green';
    if (this.deforumPlaying || this.videoReady) return 'yellow';
    return 'green';
  }
  if (layer.kind === 'deforum' || layer.kind === 'wan' || layer.kind === 'animatelcm' || layer.kind === 'svd') {
    if (this.videoReady) return 'green';
    if (this.deforumPlaying || (this.defaultAnimation && this.defaultAnimation.preferDeforumVideo)) return 'yellow';
    if (layer.kind === 'wan') return 'yellow';
    if (layer.kind === 'svd' || layer.kind === 'animatelcm') return 'yellow';
    return 'red';
  }
  if (layer.kind === 'input') {
    if (!this.inputLayerPlaybackUrl) return 'red';
    return this.inputVideoReady ? 'green' : 'yellow';
  }
  if (layer.kind === 'library') {
    if (!layer.playbackUrl) return 'red';
    return this.inputVideoReady ? 'green' : 'yellow';
  }
  if (layer.kind === 'cloud') {
    return layer.url ? 'yellow' : 'red';
  }
  return 'red';
},
animationLayerDescription(layer) {
  if (!layer) return '';
  if (layer.kind === 'webgl') {
    const mode = String(this.defaultAnimation?.mode || 'instancing');
    return `Standby WebGL · ${mode}`;
  }
  if (layer.kind === 'deforum') {
    if (this.deforumPlaying) return 'Deforum batch · animating';
    if (this.videoReady) return 'Deforum · live HLS feed';
    return 'Deforum · preview stills / batch';
  }
  if (layer.kind === 'wan') {
    const model = String(this.wanEngine?.wan_t2v_model || 'Wan').trim();
    if (this.deforumPlaying) return `WAN Video · ${model} · generating`;
    if (this.videoReady) return `WAN Video · ${model} · live`;
    return `WAN Video · ${model} · idle`;
  }
  if (layer.kind === 'svd') {
    const summary = this.svdEngineSummary;
    if (this.deforumPlaying) return `SVD · ${summary?.modelFamily || 'XT 1.1'} · generating`;
    if (this.videoReady) return `SVD · ${summary?.modelFamily || 'XT 1.1'} · live`;
    return `SVD · ${summary?.modelFamily || 'XT 1.1'} · img2vid`;
  }
  if (layer.kind === 'animatelcm') {
    if (this.deforumPlaying) return 'AnimateLCM · generating';
    if (this.videoReady) return 'AnimateLCM · live';
    return 'AnimateLCM · idle';
  }
  if (layer.kind === 'blend') return 'Composite · WebGL under Deforum';
  if (layer.kind === 'input') {
    return this.inputLayerPlaybackUrl
      ? `Input · ${this.inputLayerLabel || 'Video'}`
      : 'Input · link a library or cloud source';
  }
  if (layer.kind === 'library') return layer.label || 'Library video layer';
  if (layer.kind === 'cloud') return layer.label || 'Cloud link layer';
  return layer.label || '';
},
assignInputFromSelection() {
  const selected = (this.systemFiles.selectedPaths || [])
    .map((path) => (this.systemFiles.videos || []).find((video) => video.path === path))
    .filter(Boolean);
  const video = selected[0];
  if (!video) {
    this.liveSourceStatus = 'Select a video in the library grid first';
    return;
  }
  const entry = normalizeLibraryVideoEntry(video, (item) => this.systemFilePlaybackUrl(item));
  if (!entry) return;
  void this.applyLibraryVideoAsSource(entry, { closeLibrary: false });
  this.videoLayerAddOpen = false;
},
libraryVideoPlaybackUrl(entry) {
  if (!entry) return '';
  if (entry.videoUrl) return entry.videoUrl;
  return this.systemFilePlaybackUrl({
    path: entry.videoPath,
    rootId: entry.rootId || 'uploads',
    url: entry.url,
  });
},
resolveLibraryVideoEntry() {
  if (this.librarySelectedProject?.videoPath) {
    return normalizeLibraryVideoEntry(this.librarySelectedProject, (item) => this.libraryVideoPlaybackUrl(item));
  }
  if (this.librarySelectedVideo?.videoPath) {
    return normalizeLibraryVideoEntry(this.librarySelectedVideo, (item) => this.libraryVideoPlaybackUrl(item));
  }
  const paths = this.systemFiles.selectedPaths || [];
  if (paths.length === 1) {
    const video = (this.systemFiles.videos || []).find((v) => v.path === paths[0]);
    if (video) {
      return normalizeLibraryVideoEntry(
        { ...video, title: video.name, videoPath: video.path },
        (item) => this.systemFilePlaybackUrl(item),
      );
    }
  }
  return null;
},
async probeLibraryVideoDuration(url) {
  if (!url || typeof document === 'undefined') return null;
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const cleanup = () => {
      video.removeAttribute('src');
      try { video.load(); } catch (_e) { /* ignore */ }
    };
    const finish = (value) => {
      cleanup();
      resolve(value);
    };
    video.onloadedmetadata = () => {
      const duration = Number(video.duration);
      finish(Number.isFinite(duration) && duration > 0 ? duration : null);
    };
    video.onerror = () => finish(null);
    video.src = url;
  });
},
maybeConfirmExtendProjectForVideo(videoDurationSec, videoLabel = 'Video') {
  const projectDur = libraryProjectDurationSec(this);
  if (!shouldOfferProjectExtension(videoDurationSec, projectDur)) {
    return Promise.resolve({ extended: false, projectDurationSec: projectDur });
  }
  return new Promise((resolve) => {
    this.extendProjectPrompt = {
      videoLabel: String(videoLabel || 'Video'),
      videoDurationSec: Math.round(Number(videoDurationSec) * 100) / 100,
      projectDurationSec: Math.round(projectDur * 100) / 100,
    };
    this.extendProjectPromptOpen = true;
    this._extendProjectPromptResolver = resolve;
  });
},
dismissExtendProjectPrompt(extend) {
  this.extendProjectPromptOpen = false;
  const resolver = this._extendProjectPromptResolver;
  this._extendProjectPromptResolver = null;
  if (!resolver) return;
  let projectDurationSecValue = libraryProjectDurationSec(this);
  if (extend) {
    const result = extendLibraryProjectDuration(this, this.extendProjectPrompt.videoDurationSec, {
      onDeforumMaxFrames: (frames) => {
        this.onDeforumFieldInput('max_frames', frames, 'number');
      },
      clampSequencerClips: () => this.clampSequencerClips(),
    });
    projectDurationSecValue = result.durationSec;
    this.syncDeforumSettingsJson();
    this.queueDeforumSettingsSave();
    this.sequencerStatus = `Project extended to ${result.durationSec}s (${result.frameCount} frames)`;
    this.saveSessionState();
  }
  resolver({ extended: !!extend, projectDurationSec: projectDurationSecValue });
},
applyLibraryVideoAsSource(entry, { closeLibrary = true } = {}) {
  const normalized = normalizeLibraryVideoEntry(entry, (item) => this.libraryVideoPlaybackUrl(item));
  if (!normalized?.videoPath) {
    this.liveSourceStatus = 'Select a video in the library first';
    return Promise.resolve(false);
  }
  const url = normalized.videoUrl;
  this.inputLayerPlaybackUrl = url;
  this.inputLayerLabel = normalized.title || normalized.name || 'Input';
  this.inputLayerSourceMeta = {
    path: normalized.videoPath,
    rootId: normalized.rootId,
    url,
    label: this.inputLayerLabel,
  };
  this.rebuildVideoLayers();
  this.selectVideoLayer('input');
  if (this.currentTab !== 'LIVE') this.switchTab('LIVE');
  this.liveSourceStatus = `Source · ${this.inputLayerLabel}`;
  this.$nextTick(() => this.attachInputVideo(url));
  if (closeLibrary && this.libraryWorkspaceOpen) this.closeLibraryWorkspace();
  else this.librarySourceMode = false;
  this.saveSessionState();
  return Promise.resolve(true);
},
applyLibraryVideoToMotionSequencer(entry, { durationSec = null, projectDurationSecValue = null } = {}) {
  const normalized = normalizeLibraryVideoEntry(entry, (item) => this.libraryVideoPlaybackUrl(item));
  if (!normalized?.videoPath) {
    this.liveSourceStatus = 'Select a video in the library first';
    return false;
  }
  const url = normalized.videoUrl;
  const label = normalized.title || normalized.name || 'Video';
  const projectDur = projectDurationSecValue != null
    ? Number(projectDurationSecValue)
    : libraryProjectDurationSec(this);
  const videoDur = durationSec != null && Number.isFinite(Number(durationSec)) && Number(durationSec) > 0
    ? Number(durationSec)
    : projectDur;
  const sourceVideo = {
    path: normalized.videoPath,
    rootId: normalized.rootId,
    url,
    label,
    durationSec: videoDur,
  };
  void this.applyLibraryVideoAsSource(normalized, { closeLibrary: true });
  this.sequencer.sourceVideo = sourceVideo;
  const clip = buildMotionSequencerVideoClip(sourceVideo, projectDur);
  const kept = (this.sequencer.clips || []).filter((c) => c && c.type !== 'video');
  if (clip) this.sequencer.clips = [...kept, clip].sort((a, b) => a.t - b.t);
  else this.sequencer.clips = kept;
  this.sequencerSelectedClipId = clip?.id || this.sequencerSelectedClipId;
  this.sequencerStatus = `Motion sequence · ${label} (${Math.min(projectDur, videoDur).toFixed(1)}s)`;
  this.motionSequencerSideOpen = true;
  if (this.currentTab !== 'MOTION' && this.currentTab !== 'GENERATE') this.switchTab('MOTION');
  this.syncSequencerSourceVideo(0);
  this.saveSessionState();
  this.$nextTick(() => this.drawTimeline?.());
  return true;
},
async applyLibrarySelectionAsSource() {
  const audio = this.librarySelectedAudio;
  if (audio?.audioPath) {
    this.useLibraryAudio(audio, { webgl: true });
    return;
  }
  const entry = this.resolveLibraryVideoEntry();
  if (!entry?.videoPath) {
    this.liveSourceStatus = 'Select audio or video in the library first';
    return;
  }
  await this.applyLibraryVideoAsSource(entry, { closeLibrary: true });
},
async applyLibrarySelectionToMotionSequencer() {
  const entry = this.resolveLibraryVideoEntry();
  if (!entry?.videoPath) {
    this.liveSourceStatus = 'Select a video in the library first';
    return;
  }
  const url = entry.videoUrl || this.libraryVideoPlaybackUrl(entry);
  const videoDurationSec = await this.probeLibraryVideoDuration(url);
  const label = entry.title || entry.name || 'Video';
  const choice = await this.maybeConfirmExtendProjectForVideo(videoDurationSec, label);
  this.applyLibraryVideoToMotionSequencer(entry, {
    durationSec: videoDurationSec,
    projectDurationSecValue: choice.projectDurationSec,
  });
},
syncSequencerSourceVideo(tSec) {
  const src = this.sequencer?.sourceVideo;
  if (!src?.url) return;
  if (this.inputLayerPlaybackUrl !== src.url) {
    this.inputLayerPlaybackUrl = src.url;
    this.inputLayerLabel = src.label || 'Input';
    this.rebuildVideoLayers();
  }
  if (this.activeVideoLayerId !== 'input') this.selectVideoLayer('input');
  this.$nextTick(() => {
    this.attachInputVideo(src.url);
    const video = this.$refs?.inputVideoEl;
    if (!video) return;
    const maxTime = Number.isFinite(Number(src.durationSec)) && src.durationSec > 0
      ? src.durationSec
      : (Number.isFinite(Number(video.duration)) ? video.duration : Number(tSec) || 0);
    const target = Math.max(0, Math.min(Number(tSec) || 0, maxTime));
    try {
      if (Math.abs((video.currentTime || 0) - target) > 0.04) video.currentTime = target;
    } catch (_e) { /* ignore seek errors */ }
    if (this.sequencerPlaying) video.play?.().catch?.(() => {});
    else video.pause?.();
  });
},
toggleLibraryWorkspace() {
  if (this.libraryWorkspaceOpen) this.closeLibraryWorkspace();
  else this.openLibraryWorkspace('browser');
},
openLibraryWorkspace(pane = 'browser', options = {}) {
  if (options && options.asSource) this.librarySourceMode = true;
  this.libraryWorkspaceOpen = true;
  this.libraryWorkspacePane = pane === 'editor' ? 'editor' : 'browser';
  void this.initSystemFilesBrowser();
  this.saveSessionState();
},
closeLibraryWorkspace() {
  this.libraryWorkspaceOpen = false;
  this.libraryWorkspacePane = 'browser';
  this.librarySourceMode = false;
  this.saveSessionState();
},
setLibraryWorkspacePane(pane) {
  const next = pane === 'editor' ? 'editor' : 'browser';
  if (this.libraryWorkspacePane === next) return;
  this.libraryWorkspacePane = next;
  this.saveSessionState();
},
openLibraryVideoEditor() {
  this.openLibraryWorkspace('editor');
},
closeLibraryEditor() {
  this.setLibraryWorkspacePane('browser');
},
openInVideoEditor(video) {
  const fromProject = this.librarySelectedProject?.videoPath
    ? {
        path: this.librarySelectedProject.videoPath,
        rootId: this.librarySelectedProject.rootId || 'uploads',
        name: this.librarySelectedProject.title,
        url: this.librarySelectedProject.videoUrl,
      }
    : null;
  const entry = video || fromProject || (this.systemFiles.videos || []).find((v) => v.path === (this.systemFiles.selectedPaths || [])[0]);
  if (!entry || !entry.path) {
    this.editorStatus = 'Select a video in the library first';
    this.editorStatusLive = false;
    this.openLibraryWorkspace('browser');
    this.saveSessionState();
    return;
  }
  this.editorPendingImportPath = entry.path;
  this.editorPendingImportRootId = entry.rootId || this.systemFiles.rootId || 'uploads';
  this.editorPendingImportUrl = entry.url || this.systemFilePlaybackUrl(entry);
  this.editorFreecutRoute = 'projects';
  this.editorStatus = `Ready to import ${entry.name || 'video'}`;
  this.editorStatusLive = true;
  this.openLibraryWorkspace('editor');
},
useLibraryAudio(track, options = {}) {
  if (!track?.audioPath) return;
  const driveWebgl = options.webgl ?? !!this.librarySourceMode;
  if (this.audio.objectUrl && String(this.audio.objectUrl).startsWith('blob:')) {
    try { URL.revokeObjectURL(this.audio.objectUrl); } catch (_e) { /* ignore */ }
  }
  this.audio.track = track.audioPath;
  this.audio.uploadedFile = track.title || track.audioName || 'Audio';
  this.audio.objectUrl = track.audioUrl || null;
  this.audioBeatMacrosCollapsed = true;
  this.audioSpectrumBins = [];
  let setupDone = false;
  const afterAnalyserReady = () => {
    if (setupDone) return;
    setupDone = true;
    try { this.setupLiveAudioAnalyser(); } catch (_e) { /* ignore */ }
    void this.playAvSyncAudioForVisualizer();
    if (this.audio.objectUrl) {
      this.audioSpectrogramStatus = 'Analyzing…';
      this.scheduleAudioSpectrogramDecode(this._spectrogramGen);
    }
    if (driveWebgl) {
      this.applyAudioAsWebglSource();
    } else {
      this.audioStatus = 'Audio loaded from library';
      this.switchTab('AUDIO');
    }
  };
  const scheduleSetup = () => {
    const el = this.$refs && this.$refs.avSyncAudio;
    if (!el || !this.audio.objectUrl) {
      afterAnalyserReady();
      return;
    }
    const run = () => {
      el.removeEventListener('canplay', run);
      afterAnalyserReady();
    };
    if (el.readyState >= 2) {
      afterAnalyserReady();
      return;
    }
    el.addEventListener('canplay', run);
    if (typeof this.$nextTick === 'function') {
      this.$nextTick(() => {
        if (el.readyState >= 2) run();
      });
    }
  };
  if (typeof this.$nextTick === 'function') this.$nextTick(scheduleSetup);
  else setTimeout(scheduleSetup, 0);
  this.saveSessionState();
},
playAvSyncAudioForVisualizer() {
  const el = this.$refs && this.$refs.avSyncAudio;
  if (!el || !this.audio.objectUrl) return Promise.resolve();
  el.loop = true;
  try {
    const playResult = el.play && el.play();
    return playResult && typeof playResult.then === 'function'
      ? playResult.catch(() => {})
      : Promise.resolve();
  } catch (_e) {
    return Promise.resolve();
  }
},
applyAudioAsWebglSource() {
  const webgl = this.findVideoLayer('webgl');
  if (webgl) {
    webgl.previewVisible = true;
    if (!Number.isFinite(Number(webgl.opacity)) || Number(webgl.opacity) <= 0) {
      webgl.opacity = 1;
    }
  }
  this.selectVideoLayer('webgl');
  if (this.currentTab !== 'LIVE') this.switchTab('LIVE');
  this.audioStatus = 'Audio driving WebGL visualizer';
  if (this.libraryWorkspaceOpen) this.closeLibraryWorkspace();
  else this.librarySourceMode = false;
},
isCloudStorageRoot(rootId) {
  return String(rootId || this.systemFiles.rootId || '').startsWith('cloud:');
},
cloudStorageSourceId(rootId) {
  const id = String(rootId || this.systemFiles.rootId || '');
  return id.startsWith('cloud:') ? id.slice('cloud:'.length) : '';
},
cloudProviderLabel(provider) {
  const map = {
    google_drive: 'Google Drive',
    dropbox: 'Dropbox',
    onedrive: 'OneDrive',
    other: 'Cloud',
  };
  return map[String(provider || '').toLowerCase()] || 'Cloud';
},
async initSystemFilesBrowser() {
  try {
    if (!this.systemFiles._rootsLoaded) {
      const res = await fetch('/api/video-swarm/roots');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load library roots');
      this.systemFiles.roots = Array.isArray(data.roots) ? data.roots : [];
      this.systemFiles.cloudSources = Array.isArray(data.cloudSources) ? data.cloudSources : [];
      this.systemFiles._rootsLoaded = true;
    }
    await this.refreshLibraryBrowse();
  } catch (err) {
    this.systemFiles.status = err.message || 'Library unavailable';
  }
},
async refreshLibraryBrowse() {
  const roots = this.systemFiles.roots || [];
  const preferred =
    roots.find((r) => r.id === this.systemFiles.rootId)
    || roots.find((r) => r.id === 'uploads')
    || roots.find((r) => r.id === 'frames')
    || roots[0];
  if (!preferred) return;
  this.systemFiles.rootId = preferred.id;
  if (preferred.kind === 'cloud') {
    await this.browseSystemFiles('', { rootId: preferred.id });
    return;
  }
  await this.browseSystemFiles(preferred.path, { rootId: preferred.id });
},
async refreshCloudSources() {
  try {
    const res = await fetch('/api/video-swarm/cloud-sources');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load cloud sources');
    this.systemFiles.cloudSources = Array.isArray(data.sources) ? data.sources : [];
    const localRoots = (this.systemFiles.roots || []).filter((r) => r.kind !== 'cloud');
    this.systemFiles.roots = [
      ...localRoots,
      ...(this.systemFiles.cloudSources || []).map((source) => ({
        id: `cloud:${source.id}`,
        label: `${this.cloudProviderLabel(source.provider)} — ${source.label}`,
        kind: 'cloud',
        provider: source.provider,
        url: source.url,
        path: '',
      })),
    ];
  } catch (err) {
    this.systemFiles.status = err.message || 'Cloud storage unavailable';
  }
},
async connectCloudStorage({ label, provider, url } = {}) {
  const shareUrl = String(url || this.cloudDriveDraft.url || '').trim();
  if (!shareUrl) {
    this.systemFiles.status = 'Enter a cloud share link';
    return;
  }
  try {
    const res = await fetch('/api/video-swarm/cloud-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: String(label || '').trim() || this.cloudProviderLabel(provider || this.cloudDriveDraft.provider),
        provider: provider || this.cloudDriveDraft.provider || 'other',
        url: shareUrl,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not connect cloud storage');
    this.cloudDriveDraft.url = '';
    this.systemFiles.cloudConnectOpen = false;
    await this.refreshCloudSources();
    const created = data.source;
    if (created && created.id) {
      this.systemFiles.rootId = `cloud:${created.id}`;
      await this.browseSystemFiles('', { rootId: this.systemFiles.rootId });
    }
    this.systemFiles.status = 'Cloud storage connected';
  } catch (err) {
    this.systemFiles.status = err.message || 'Could not connect cloud storage';
  }
},
async disconnectCloudStorage(sourceId) {
  const id = String(sourceId || '').trim();
  if (!id) return;
  if (!window.confirm('Remove this cloud connection from the browser?')) return;
  try {
    const res = await fetch(`/api/video-swarm/cloud-sources/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not remove cloud storage');
    await this.refreshCloudSources();
    if (this.isCloudStorageRoot(this.systemFiles.rootId)) {
      const fallback = (this.systemFiles.roots || []).find((r) => r.kind !== 'cloud') || this.systemFiles.roots[0];
      if (fallback) {
        this.systemFiles.rootId = fallback.id;
        await this.browseSystemFiles(fallback.path, { rootId: fallback.id });
      }
    }
    this.systemFiles.status = 'Cloud storage removed';
  } catch (err) {
    this.systemFiles.status = err.message || 'Could not remove cloud storage';
  }
},
openCloudStorageLink(source) {
  const targetUrl = source && source.url ? String(source.url) : '';
  if (!targetUrl) return;
  try {
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  } catch (_e) {
    this.systemFiles.status = 'Could not open cloud link';
  }
},
async addCloudStorageVideo(sourceId) {
  const id = String(sourceId || this.cloudStorageSourceId() || '').trim();
  const videoUrl = String(this.systemFiles.cloudVideoDraft.url || '').trim();
  if (!id || !videoUrl) {
    this.systemFiles.status = 'Enter a direct video URL from the cloud share';
    return;
  }
  try {
    const res = await fetch(`/api/video-swarm/cloud-sources/${encodeURIComponent(id)}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: String(this.systemFiles.cloudVideoDraft.name || '').trim(),
        url: videoUrl,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not add cloud video');
    this.systemFiles.cloudVideoDraft = { name: '', url: '' };
    if (this.isCloudStorageRoot(this.systemFiles.rootId)) {
      await this.browseSystemFiles('', { rootId: this.systemFiles.rootId });
    }
    this.systemFiles.status = 'Cloud video added';
  } catch (err) {
    this.systemFiles.status = err.message || 'Could not add cloud video';
  }
},
toggleSystemFilesVideosOnly() {
  this.systemFiles.viewMode = this.systemFiles.viewMode === 'videos-only' ? 'browse' : 'videos-only';
  void this.browseSystemFiles(this.systemFiles.currentPath);
  this.saveSessionState();
},
openNewFolderDialog() {
  if (this.isCloudStorageRoot()) {
    this.systemFiles.status = 'Create folders on local storage roots only';
    return;
  }
  this.systemFiles.newFolderName = '';
  this.systemFiles.newFolderOpen = true;
},
cancelNewFolderDialog() {
  this.systemFiles.newFolderOpen = false;
  this.systemFiles.newFolderName = '';
},
async uploadSystemVideoFile(file, { target = "uploads" } = {}) {
  if (!file) return;
  const name = String(file.name || "upload.mp4");
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  const allowed = [".mp4", ".webm", ".mov", ".mkv", ".m4v", ".avi"];
  if (ext && !allowed.includes(ext)) {
    this.systemFiles.status = "Unsupported file type (use mp4, webm, mov, mkv, m4v, avi)";
    return;
  }
  this.systemFiles.loading = true;
  this.systemFiles.status = `Uploading ${name}…`;
  try {
    const body = await file.arrayBuffer();
    const q = new URLSearchParams({ name, dir: target === "videoswarm" ? "videoswarm" : "uploads" });
    const res = await fetch(`/api/video-swarm/upload?${q.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-Filename": name,
      },
      body,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    this.systemFiles.status = `Uploaded ${data.name || name}`;
    const browsePath = this.systemFiles.currentPath
      || (this.systemFiles.roots || []).find((r) => r.id === (data.rootId || "uploads"))?.path;
    await this.browseSystemFiles(browsePath, { rootId: data.rootId || "uploads" });
    if (data.path) this.systemFiles.selectedPaths = [data.path];
  } catch (err) {
    this.systemFiles.status = err.message || "Upload failed";
  } finally {
    this.systemFiles.loading = false;
  }
},
async uploadSystemVideoFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => f && f.size);
  if (!files.length) return;
  for (const file of files) {
    await this.uploadSystemVideoFile(file);
  }
},
async createSystemFolder() {
  const name = String(this.systemFiles.newFolderName || '').trim();
  if (!name) {
    this.systemFiles.status = 'Enter a folder name';
    return;
  }
  if (this.isCloudStorageRoot()) {
    this.systemFiles.status = 'Cannot create folders on cloud storage';
    return;
  }
  try {
    const res = await fetch('/api/video-swarm/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        path: this.systemFiles.currentPath,
        rootId: this.systemFiles.rootId,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not create folder');
    this.systemFiles.newFolderOpen = false;
    this.systemFiles.newFolderName = '';
    await this.browseSystemFiles(this.systemFiles.currentPath);
    this.systemFiles.status = `Created folder “${name}”`;
  } catch (err) {
    this.systemFiles.status = err.message || 'Could not create folder';
  }
},
systemFilesSortApiKey(uiKey) {
  const key = String(uiKey || 'name-asc').toLowerCase();
  if (key.startsWith('mtime') || key === 'date') return 'date';
  if (key.startsWith('size')) return 'size';
  return 'name';
},
setSystemFilesSort(sortKey) {
  this.systemFiles.sortKey = sortKey;
  void this.browseSystemFiles(this.systemFiles.currentPath);
  this.saveSessionState();
},
refreshSystemFilesBrowse() {
  const target = this.systemFiles.currentPath
    || (this.systemFiles.roots || []).find((r) => r.id === this.systemFiles.rootId)?.path;
  void this.browseSystemFiles(target);
},
setSystemFilesZoom(level) {
  this.systemFiles.zoomLevel = Math.max(0, Math.min(4, Number(level) || 0));
  this.saveSessionState();
},
async copySystemFilePath(filePath) {
  const value = String(filePath || '').trim();
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    this.systemFiles.status = 'Path copied';
    setTimeout(() => {
      if (this.systemFiles.status === 'Path copied') this.systemFiles.status = '';
    }, 2000);
  } catch (_e) {
    this.systemFiles.status = 'Could not copy path';
  }
},
async browseSystemFiles(targetPath, { rootId } = {}) {
  this.systemFiles.loading = true;
  try {
    const activeRootId = rootId || this.systemFiles.rootId;
    const q = new URLSearchParams();
    if (targetPath) q.set('path', targetPath);
    if (activeRootId) q.set('rootId', activeRootId);
    const videosOnly = this.systemFiles.viewMode === 'videos-only';
    if (videosOnly) q.set('videosOnly', '1');
    else if (this.systemFiles.recursive) q.set('recursive', '1');
    q.set('sort', this.systemFilesSortApiKey(this.systemFiles.sortKey));
    const res = await fetch(`/api/video-swarm/browse?${q.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Browse failed');
    this.systemFiles.cloudSource = data.kind === 'cloud' ? (data.cloudSource || null) : null;
    this.systemFiles.currentPath = data.path || '';
    this.systemFiles.parent = data.parent || '';
    this.systemFiles.folders = videosOnly || data.kind === 'cloud'
      ? []
      : (Array.isArray(data.folders) ? data.folders : []);
    this.systemFiles.videos = Array.isArray(data.videos) ? data.videos : [];
    this.systemFiles.folderCount = Number.isFinite(Number(data.folderCount))
      ? Number(data.folderCount)
      : this.systemFiles.folders.length;
    this.systemFiles.videoCount = Number.isFinite(Number(data.videoCount))
      ? Number(data.videoCount)
      : this.systemFiles.videos.length;
    if (rootId) this.systemFiles.rootId = rootId;
    else if (this.systemFiles.currentPath) {
      const match = (this.systemFiles.roots || []).find((r) => {
        const rootPath = String(r.path || '');
        return this.systemFiles.currentPath === rootPath
          || this.systemFiles.currentPath.startsWith(`${rootPath}/`);
      });
      if (match) this.systemFiles.rootId = match.id;
    }
    this.systemFiles.status = '';
  } catch (err) {
    this.systemFiles.status = err.message || 'Could not browse folder';
    this.systemFiles.folders = [];
    this.systemFiles.videos = [];
    this.systemFiles.folderCount = 0;
    this.systemFiles.videoCount = 0;
  } finally {
    this.systemFiles.loading = false;
  }
},
toggleSystemFilesRecursive() {
  this.systemFiles.recursive = !this.systemFiles.recursive;
  void this.browseSystemFiles(this.systemFiles.currentPath);
},
toggleSystemFilesShowNames() {
  this.systemFiles.showFilenames = !this.systemFiles.showFilenames;
},
toggleSystemFileSelection(filePath) {
  const paths = Array.isArray(this.systemFiles.selectedPaths) ? [...this.systemFiles.selectedPaths] : [];
  const idx = paths.indexOf(filePath);
  if (idx >= 0) paths.splice(idx, 1);
  else paths.push(filePath);
  this.systemFiles.selectedPaths = paths;
  if (paths.length === 1) {
    const video = (this.systemFiles.videos || []).find((v) => v.path === paths[0]);
    if (video) {
      const entry = normalizeLibraryVideoEntry(
        { ...video, title: video.name, videoPath: video.path },
        (item) => this.systemFilePlaybackUrl(item),
      );
      this.librarySelectedVideo = entry;
      this.librarySelectedProject = entry;
    }
  } else if (!paths.length) {
    this.librarySelectedVideo = null;
  }
},
openSystemFileFullscreen(index) {
  const list = this.systemFiles.videos || [];
  if (index >= 0 && index < list.length) this.systemFiles.fullscreenIndex = index;
},
closeSystemFileFullscreen() {
  this.systemFiles.fullscreenIndex = -1;
},
stepSystemFileFullscreen(delta) {
  const list = this.systemFiles.videos || [];
  if (!list.length) return;
  let idx = this.systemFiles.fullscreenIndex;
  if (idx < 0) idx = 0;
  idx = (idx + delta + list.length) % list.length;
  this.systemFiles.fullscreenIndex = idx;
},
async deleteSystemFile(filePath) {
  this.systemFiles.status = 'Delete is not available from the web UI yet';
},
systemFilePlaybackUrl(video) {
  if (!video) return '';
  if (video.url && /^https?:\/\//i.test(String(video.url))) return String(video.url);
  if (!video.path) return '';
  if (/^https?:\/\//i.test(String(video.path))) return String(video.path);
  const q = new URLSearchParams({ path: video.path });
  if (video.rootId) q.set('rootId', video.rootId);
  return `/api/video-swarm/file?${q.toString()}`;
},
formatVideoSwarmFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
},
systemFileMediaUrl(filePath) {
  const raw = String(filePath || '');
  if (/^https?:\/\//i.test(raw)) return raw;
  const video = (this.systemFiles.videos || []).find((v) => v.path === filePath);
  if (video) return this.systemFilePlaybackUrl(video);
  const q = new URLSearchParams({ path: filePath });
  if (this.systemFiles.rootId) q.set('rootId', this.systemFiles.rootId);
  return `/api/video-swarm/file?${q.toString()}`;
},
addLiveSourceFromVideo(video) {
  if (!video || !video.path) return;
  const entry = {
    id: `src-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'library',
    label: video.name || 'Video',
    path: video.path,
    rootId: video.rootId || this.systemFiles.rootId || 'frames',
    playbackUrl: this.systemFilePlaybackUrl(video),
  };
  this.liveSources = [...(this.liveSources || []), entry];
  this.rebuildVideoLayers();
  this.selectVideoLayer(entry.id);
  this.liveSourceStatus = `Opened layer: ${entry.label}`;
  this.videoLayerAddOpen = false;
  this.saveSessionState();
},
addLiveSourcesFromSelection() {
  const selected = (this.systemFiles.selectedPaths || [])
    .map((p) => (this.systemFiles.videos || []).find((v) => v.path === p))
    .filter(Boolean);
  if (!selected.length) {
    const hovered = (this.systemFiles.videos || []).find((v) => v.path === (this.systemFiles.selectedPaths || [])[0]);
    if (hovered) selected.push(hovered);
  }
  if (!selected.length) {
    this.liveSourceStatus = 'Select a video in the library grid first';
    return;
  }
  selected.forEach((video) => this.addLiveSourceFromVideo(video));
},
linkCloudDriveSource() {
  const url = String(this.cloudDriveDraft.url || '').trim();
  if (!url) {
    this.liveSourceStatus = 'Enter a cloud share link';
    return;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_e) {
    this.liveSourceStatus = 'Enter a valid https:// link';
    return;
  }
  const entry = {
    id: `cloud-${Date.now()}`,
    type: 'cloud',
    label: parsed.hostname.replace(/^www\./, ''),
    url: parsed.href,
    provider: this.cloudDriveDraft.provider || 'other',
    playbackUrl: parsed.href,
  };
  this.liveSources = [...(this.liveSources || []), entry];
  this.rebuildVideoLayers();
  this.selectVideoLayer(entry.id);
  this.cloudDriveDraft.url = '';
  this.liveSourceStatus = `Opened cloud layer: ${entry.label}`;
  this.videoLayerAddOpen = false;
  this.saveSessionState();
},
removeLiveSource(sourceId) {
  this.liveSources = (this.liveSources || []).filter((s) => s.id !== sourceId);
  this.rebuildVideoLayers();
  this.saveSessionState();
},
applyLiveSourceAsFeed(source) {
  if (!source) return;
  this.selectVideoLayer(source.id);
},
markVideoReady(ready) {
  this.videoReady = !!ready;
},
detachPlayerListeners(video = this.playerEl) {
  if (!video) return;
  if (this.timeHandler) video.removeEventListener("timeupdate", this.timeHandler);
  if (this.errorHandler) video.removeEventListener("error", this.errorHandler);
  if (this.videoReadyHandler) {
    video.removeEventListener("loadeddata", this.videoReadyHandler);
    video.removeEventListener("canplay", this.videoReadyHandler);
    video.removeEventListener("playing", this.videoReadyHandler);
  }
  if (this.videoWaitingHandler) {
    video.removeEventListener("waiting", this.videoWaitingHandler);
    video.removeEventListener("stalled", this.videoWaitingHandler);
    video.removeEventListener("emptied", this.videoWaitingHandler);
  }
  if (this.videoPlayHandler) video.removeEventListener("play", this.videoPlayHandler);
  if (this.videoPauseHandler) video.removeEventListener("pause", this.videoPauseHandler);
},
 attachPlayer() {
   if (!this.hlsWatchEnabled) return;
   const video = document.getElementById("player");
   if (!video) return;
  if (this.playerEl) this.detachPlayerListeners(this.playerEl);
   this.playerEl = video;
  this.markVideoReady(false);
   const hlsSource = this.streamSrc.includes("?") ? this.streamSrc + "&t=" + Date.now() : this.streamSrc + "?t=" + Date.now();
   if (this.hls && this.hls.destroy) {
     this.hls.destroy();
     this.hls = null;
   }
   if (video.canPlayType("application/vnd.apple.mpegurl")) {
     video.src = hlsSource;
     video.load();
     this.autoplayVideo(video);
   } else if (typeof Hls !== "undefined" && Hls.isSupported && Hls.isSupported()) {
     const hlsEvents = (Hls && Hls.Events) || { MANIFEST_PARSED: "manifest_parsed", ERROR: "error" };
     this.hls = new Hls({ liveSyncDurationCount: 1, liveMaxLatencyDurationCount: 3, maxBufferLength: 6, maxMaxBufferLength: 12 });
     this.hls.loadSource(hlsSource);
     this.hls.attachMedia(video);
     if (this.hls.on) {
       this.hls.on(hlsEvents.MANIFEST_PARSED, () => this.autoplayVideo(video));
       this.hls.on(hlsEvents.ERROR, () => {
         setTimeout(() => this.attachPlayer(), 800);
       });
     }
   } else {
     video.src = hlsSource;
   }
   this.timeHandler = () => {
     if (!isNaN(video.currentTime)) {
      const t = video.currentTime;
      this.timecode = this.formatPlaybackTime(t);
      this.jobPlaybackTimeSec = t;
      this.syncFrameSelectionFromPlayback(t);
     }
    if (video.readyState >= 2) this.markVideoReady(true);
     this.syncReferenceAudioToVideo(video);
   };
   this.errorHandler = () => {
    this.markVideoReady(false);
     if (this.hlsWatchEnabled) setTimeout(() => this.attachPlayer(), 800);
   };
  this.videoReadyHandler = () => {
    if (video.readyState >= 2) this.markVideoReady(true);
  };
  this.videoWaitingHandler = () => {
    this.markVideoReady(false);
  };
  this.videoPlayHandler = () => {
    this.isPlaying = true;
    if (video.readyState >= 2) this.markVideoReady(true);
    this.syncAvAudioPlayState(true, video);
  };
  this.videoPauseHandler = () => {
    this.isPlaying = false;
    this.syncAvAudioPlayState(false, video);
  };
   video.addEventListener("timeupdate", this.timeHandler);
   video.addEventListener("error", this.errorHandler);
  video.addEventListener("loadeddata", this.videoReadyHandler);
  video.addEventListener("canplay", this.videoReadyHandler);
  video.addEventListener("playing", this.videoReadyHandler);
  video.addEventListener("waiting", this.videoWaitingHandler);
  video.addEventListener("stalled", this.videoWaitingHandler);
  video.addEventListener("emptied", this.videoWaitingHandler);
  video.addEventListener("play", this.videoPlayHandler);
  video.addEventListener("pause", this.videoPauseHandler);
   this.autoplayVideo(video);
 },
 syncReferenceAudioToVideo(video) {
   if (!this.avSyncEnabled || !this.audio.objectUrl) return;
   const v = video || this.playerEl;
   const a = this.$refs.avSyncAudio;
   if (!v || !a || v.paused) return;
   const lag = Number(this.avSyncLeadSec);
   const L = Number.isFinite(lag) && lag >= 0 ? lag : 4;
   const target = Math.max(0, v.currentTime - L);
   if (Math.abs(a.currentTime - target) > 0.12) {
     try {
       a.currentTime = target;
     } catch (_e) {
       /* ignore seek errors on sparse codecs */
     }
   }
   if (a.paused) {
     a.play().catch(() => {});
   }
 },
 syncAvAudioPlayState(playing, video) {
   const a = this.$refs.avSyncAudio;
   if (!a || !this.avSyncEnabled || !this.audio.objectUrl) return;
   const v = video || this.playerEl;
   if (playing && v) {
     this.syncReferenceAudioToVideo(v);
     a.play().catch(() => {});
   } else {
     a.pause();
   }
 },
 autoplayVideo(video) {
   const el = video || this.playerEl;
   if (!el || typeof el.play !== "function") return;
  let p = null;
  try {
    p = el.play();
  } catch (_e) {
    this.isPlaying = false;
    this.markVideoReady(false);
    return;
  }
   if (p && typeof p.catch === "function") {
    p.then(() => {
      this.isPlaying = true;
      if (el.readyState >= 2) this.markVideoReady(true);
    }).catch(() => {
      this.isPlaying = false;
      this.markVideoReady(false);
    });
   }
 },
 ensureLivePlayback() {
   if (!this.hlsWatchEnabled || !this.playerEl) return;
   if (this.playerEl.paused || this.playerEl.readyState < 2) {
     this.autoplayVideo(this.playerEl);
   }
 },
 lfoTarget(lfo) {
   if (!lfo || !lfo.target) return null;
   return this.lfoTargets.find((t) => t.key === lfo.target) || null;
 },
 initLfoBase(lfo) {
   const target = this.lfoTarget(lfo);
   if (!target) return;
   if (lfo.base === null || lfo.base === undefined) {
     lfo.base = target.default != null ? target.default : (target.min + target.max) / 2;
   } else {
     lfo.base = this.clampVal(lfo.base, target.min, target.max);
   }
 },
 shapeValue(shape, phase) {
   const p = phase % (Math.PI * 2);
   if (shape === "Square") return Math.sin(p) >= 0 ? 1 : -1;
   if (shape === "Saw") return p / Math.PI - 1; // -1..1
   if (shape === "Triangle") return (2 * Math.asin(Math.sin(p))) / Math.PI;
   return Math.sin(p);
 },
 clampVal(v, min, max) {
   if (v === null || v === undefined || Number.isNaN(v)) return min;
   return Math.min(max, Math.max(min, v));
 },
 getNow() {
   return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
 },
formatPlaybackTime(seconds) {
  const t = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(2).padStart(5, "0");
  return `${String(m).padStart(2, "0")}:${s}`;
},
lfoRateRadPerSec(lfo) {
  const bpm = Number((lfo && lfo.bpm) || this.lfoBpm || 120);
  const speed = Number((lfo && lfo.speed) || 1);
  return (bpm / 60) * Math.PI * 2 * speed;
},
interpolatedLfoPhase(lfo, now = this.getNow()) {
  const basePhase = Number(lfo && lfo.phase) || 0;
  if (!lfo || !lfo.on || this.lastLfoTick == null) return basePhase;
  const elapsedSec = Math.max(0, (now - this.lastLfoTick) / 1000);
  return (basePhase + elapsedSec * this.lfoRateRadPerSec(lfo)) % (Math.PI * 2);
},
  runLfos(now = this.getNow()) {
    if (this.audio.track) return;
    if (this.lastLfoTick === null) {
      this.lastLfoTick = now;
      return;
    }
    const dtSec = (now - this.lastLfoTick) / 1000;
    this.lastLfoTick = now;
    if (dtSec <= 0) return;

    const payload = {};
    const cnUpdates = {};
    this.lfos.forEach((lfo) => {
      const drivesMorphBlend = Number(this.prompts.morphBlendLfoLink || 0) === lfo.id && lfo.id >= 1 && lfo.id <= 4;
      const drivesLoraCrossfader = this.prompts.loraCrossfaderOn
        && Number(this.prompts.loraCrossfaderLfoLink || 0) === lfo.id
        && lfo.id >= 1
        && lfo.id <= 6;
      const drivesForgeOpacity = Number(this.defaultAnimation?.forgeLayerOpacityLfoLink || 0) === lfo.id
        && lfo.id >= 1
        && lfo.id <= 6;
      if (!lfo.on || (!lfo.targets.length && !drivesMorphBlend && !drivesLoraCrossfader && !drivesForgeOpacity)) return;
      const depth = this.clampVal(lfo.depth ?? 0, 0, 1);
      const inc = dtSec * this.lfoRateRadPerSec(lfo);
      const phase = (lfo.phase || 0) + inc;
      lfo.phase = phase % (Math.PI * 2);
      lfo.renderPhase = lfo.phase;
      const wave = this.shapeValue(lfo.shape, lfo.phase);

      if (drivesMorphBlend) {
        const base = this.clampVal(
          Number(this.prompts.morphBlendLfoBase ?? this.prompts.morphBlend ?? 0.5) || 0.5,
          0,
          1
        );
        const amp = depth * 0.5;
        const value = this.clampVal(base + wave * amp, 0, 1);
        this.applyPromptMorphBlend(value, { fromModulation: true });
      }

      if (drivesLoraCrossfader) {
        const base = this.clampVal(
          Number(this.prompts.loraCrossfaderLfoBase ?? this.prompts.crossfaderValue ?? 0.5) || 0.5,
          0,
          1
        );
        const amp = depth * 0.5;
        const value = this.clampVal(base + wave * amp, 0, 1);
        this.applyLoraCrossfader(value, { fromModulation: true });
      }

      if (drivesForgeOpacity) {
        const base = this.clampVal(
          Number(this.defaultAnimation.forgeLayerOpacityLfoBase ?? this.defaultAnimation.forgeLayerOpacity ?? 0) || 0,
          0,
          1,
        );
        const amp = depth * 0.5;
        const value = this.clampVal(base + wave * amp, 0, 1);
        this.applyForgeLayerOpacity(value, { fromModulation: true });
      }

      lfo.targets.forEach((targetKey) => {
        const target = this.modulationTargetByKey(targetKey);
        if (!target) return;
        const base = lfo.base == null ? (target.default ?? (target.min + target.max) / 2) : this.clampVal(lfo.base, target.min, target.max);
        if (lfo.base === null) lfo.base = base;
        const amp = depth * (target.max - target.min) / 2;
        const value = this.clampVal(base + wave * amp, target.min, target.max);
        this.routeModulationValue(targetKey, value, payload, cnUpdates);
      });
    });
    if (Object.keys(payload).length) {
      this.sendControl("liveParam", payload);
    }
    Object.values(cnUpdates).forEach(slot => this.updateControlNet(slot));
  },
 startLfoAnimation() {
   this.stopLfoAnimation();
   const REDUCED = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
   let lastWaveTs = 0;
   const animate = (ts) => {
     // Throttle waveform SVG updates to ~20 fps — enough for smooth motion
     if (!REDUCED && ts - lastWaveTs > 48) {
       lastWaveTs = ts;
       this.lfos.forEach((lfo) => {
        lfo.renderPhase = this.interpolatedLfoPhase(lfo, ts);
         // Legacy canvas path (no-ops when no canvas element registered)
         const canvas = this.lfoCanvasRefs[lfo.id];
         if (canvas?.getContext) this.drawLfoPreview(canvas, lfo, ts);
       });
    } else if (REDUCED) {
      this.lfos.forEach((lfo) => {
        lfo.renderPhase = Number(lfo.phase) || 0;
      });
     }
     // Audio freq meter — update at full rate for responsive meter feel
     const analyser = this._liveSpecAnalyser;
     const buf = this._liveSpecFreqBuf;
     if (analyser && buf && buf.length) {
       try { analyser.getByteFrequencyData(buf); } catch (_) {}
       if (!REDUCED && ts - (this._audioSpectrumPaintTs || 0) > 48) {
         this._audioSpectrumPaintTs = ts;
         this.audioSpectrumBins = Array.from(buf);
       }
       const sampleRate = (analyser.context && analyser.context.sampleRate) || 44100;
       const nyquist = sampleRate / 2;
       const binCount = buf.length;
       this.audioMappings.forEach((m, idx) => {
         const lo = Math.max(0, Math.floor((m.freq_min / nyquist) * binCount));
         const hi = Math.min(binCount - 1, Math.ceil((m.freq_max / nyquist) * binCount));
         const count = Math.max(1, hi - lo + 1);
         let sum = 0;
         for (let i = lo; i <= hi; i++) sum += buf[i];
         if (this.audioMappingLevels.length <= idx) this.audioMappingLevels.push(0);
         this.audioMappingLevels[idx] = Math.min(1, sum / (count * 255));
       });
     } else {
       if (this.audioSpectrumBins.length) this.audioSpectrumBins = [];
       this.audioMappings.forEach((_, idx) => {
         if (this.audioMappingLevels.length > idx) this.audioMappingLevels[idx] = 0;
       });
     }
     this._lfoAnimFrame = requestAnimationFrame(animate);
   };
   this._lfoAnimFrame = requestAnimationFrame(animate);
 },
 stopLfoAnimation() {
   if (this._lfoAnimFrame != null && typeof cancelAnimationFrame === "function") {
     cancelAnimationFrame(this._lfoAnimFrame);
     this._lfoAnimFrame = null;
   }
 },
 drawLfoPreview(canvas, lfo, ts) {
   const ctx = canvas.getContext("2d");
   if (!ctx) return;
   const w = canvas.width;
   const h = canvas.height;
   const mid = h / 2;
   const amp = (h / 2 - 4) * (lfo.depth || 0.2);

   ctx.fillStyle = this.themeColor('--bg-0', 'rgb(8, 9, 13)');
   ctx.fillRect(0, 0, w, h);

   // Grid lines
   ctx.strokeStyle = "rgba(12, 48, 72, 0.5)";
   ctx.lineWidth = 0.5;
   ctx.beginPath();
   ctx.moveTo(0, mid);
   ctx.lineTo(w, mid);
   ctx.stroke();

   // Phase offset based on time and speed
   const speed = (lfo.speed || 1.0) * 0.002;
   const phase = (ts || 0) * speed;

   ctx.strokeStyle = lfo.on
     ? this.themeColor('--warn', 'rgb(239, 159, 39)')
     : this.themeColor('--border', 'rgb(42, 45, 58)');
   ctx.lineWidth = 2;
   ctx.beginPath();

   const cycles = 2;
   for (let x = 0; x < w; x++) {
     const t = (x / w) * cycles * Math.PI * 2 + phase;
     let y;
     const p = t % (Math.PI * 2);
     if (lfo.shape === "Sine") {
       y = mid + Math.sin(p) * amp;
     } else if (lfo.shape === "Triangle") {
       y = mid + (2 * Math.asin(Math.sin(p)) / Math.PI) * amp;
     } else if (lfo.shape === "Saw") {
       y = mid + (p / Math.PI - 1) * amp;
     } else {
       y = mid + (Math.sin(p) >= 0 ? 1 : -1) * amp;
     }
     if (x === 0) ctx.moveTo(x, y);
     else ctx.lineTo(x, y);
   }
   ctx.stroke();

   // Glow effect when enabled
   if (lfo.on) {
     ctx.strokeStyle = "rgba(255, 138, 26, 0.15)";
     ctx.lineWidth = 6;
     ctx.beginPath();
     for (let x = 0; x < w; x++) {
       const t = (x / w) * cycles * Math.PI * 2 + phase;
       const p = t % (Math.PI * 2);
       let y;
       if (lfo.shape === "Sine") {
         y = mid + Math.sin(p) * amp;
       } else if (lfo.shape === "Triangle") {
         y = mid + (2 * Math.asin(Math.sin(p)) / Math.PI) * amp;
       } else if (lfo.shape === "Saw") {
         y = mid + (p / Math.PI - 1) * amp;
       } else {
         y = mid + (Math.sin(p) >= 0 ? 1 : -1) * amp;
       }
       if (x === 0) ctx.moveTo(x, y);
       else ctx.lineTo(x, y);
     }
     ctx.stroke();
   }
 },
 processBeat() {
   const now = this.getNow();
   const bpm = this.audio.bpm || 120;
   const beatIntervalMs = (60 / bpm) * 1000;
   
   if (this.lastBeatTime === null) {
     this.lastBeatTime = now;
     this.beatCount = 0;
     this.beatPhase = 0;
     return;
   }
   
   const timeSinceLastBeat = now - this.lastBeatTime;
   
   // Check if a beat should occur
   if (timeSinceLastBeat >= beatIntervalMs) {
     this.lastBeatTime = now;
     this.beatCount++;
     this.triggerBeatMacros(now);
   }
   
   // Update continuous beat phase for smooth animations
   this.beatPhase = (timeSinceLastBeat / beatIntervalMs) % 1;
 },
 triggerBeatMacros(now = this.getNow()) {
   const payload = {};
   const cnUpdates = {};
   const activeMacros = this.macrosRack.filter(m => m.on);
   
   activeMacros.forEach((macro) => {
     const target = this.modulationTargetByKey(macro.target);
     if (!target) return;
     
     // Determine if this macro should trigger on this beat
     const shouldTrigger = this.shouldMacroTrigger(macro, now);
     if (!shouldTrigger) return;
     
     // Calculate value based on macro shape
     const base = target.default ?? (target.min + target.max) / 2;
     const depth = this.clampVal(macro.depth ?? 0.5, 0, 1);
     const offset = this.clampVal(macro.offset ?? 0, -1, 1);
     
     let value;
     if (macro.shape === "Noise") {
       // Random value for noise
       value = base + (Math.random() * 2 - 1) * depth * (target.max - target.min) / 2;
     } else {
       // Use shape value at current phase
       const phase = this.beatPhase * Math.PI * 2;
       const wave = this.shapeValue(macro.shape || "Sine", phase);
       value = base + (wave + offset) * depth * (target.max - target.min) / 2;
     }
     
     const clamped = this.clampVal(value, target.min, target.max);
     this.routeModulationValue(macro.target, clamped, payload, cnUpdates);
   });
   
   if (Object.keys(payload).length) {
     this.sendControl("liveParam", payload);
   }
   Object.values(cnUpdates).forEach(slot => this.updateControlNet(slot));
 },
 shouldMacroTrigger(macro, now) {
   const bpm = Number(macro.bpm || 0);
   if (bpm > 0) {
     const interval = (60 / bpm) * 1000;
     const last = this.lastMacroTrigger[macro.id] || 0;
     if (now - last >= interval) {
       this.lastMacroTrigger[macro.id] = now;
       return true;
     }
     return false;
   }
   // Fallback: if no BPM (or BPM is 0/invalid), trigger on every beat
   return true;
 },
 connectWebSocket() {
  if (!this.collabEnabled) {
    this.wsStatus = "offline";
    return;
  }
   const url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws";
   const connect = () => {
    if (!this.collabEnabled) {
      this.wsStatus = "offline";
      return;
    }
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) {
      return;
    }
    this.wsStatus = "connecting";
    const socket = new WebSocket(url);
    this.ws = socket;
    socket.onopen = () => {
      if (this.ws !== socket) return;
      this.wsStatus = "connected";
      if (this.wsReconnectTimer) {
        clearTimeout(this.wsReconnectTimer);
        this.wsReconnectTimer = null;
      }
      this.collabIdentify();
    };
    socket.onclose = () => {
      if (this.ws === socket) this.ws = null;
      this.clearCollaborationPresence();
      if (!this.collabEnabled) {
        this.wsStatus = "offline";
        return;
      }
      this.wsStatus = "disconnected";
      this.wsReconnectTimer = setTimeout(connect, 1000);
    };
    socket.onmessage = (evt) => {
       try {
         const msg = JSON.parse(evt.data);
         this.handleWsMessage(msg);
       } catch (_) {}
     };
   };
   connect();
 },
clearCollaborationPresence() {
  this.collab.userId = null;
  this.collab.users = [];
  this.collab.locks = {};
  this.collab.recording = false;
  this.collab.recordings = [];
  this.collab.status = '';
},
disconnectWebSocket({ status = "offline" } = {}) {
  if (this.wsReconnectTimer) {
    clearTimeout(this.wsReconnectTimer);
    this.wsReconnectTimer = null;
  }
  const socket = this.ws;
  this.ws = null;
  this.clearCollaborationPresence();
  this.wsStatus = status;
  if (socket && typeof socket.close === "function" && socket.readyState < 2) {
    try {
      socket.close();
    } catch (_) {}
  }
},
toggleCollaboration() {
  if (this.collabEnabled) {
    this.collabEnabled = false;
    this.disconnectWebSocket({ status: "offline" });
  } else {
    this.collabEnabled = true;
    this.wsStatus = "disconnected";
    this.connectWebSocket();
  }
  this.saveSessionState();
},
 handleWsMessage(msg) {
  if (msg.type === "batch" && Array.isArray(msg.messages)) {
    msg.messages.forEach((entry) => this.handleWsMessage(entry));
    return;
  }
   if (msg.type === "hello" && msg.userId) {
     this.collab.userId = msg.userId;
     this.collabIdentify();
   }
   if (msg.type === "presence" && Array.isArray(msg.users)) {
     this.collab.users = msg.users;
     const locks = {};
     msg.users.forEach((u) => {
       (u.lockedParams || []).forEach((param) => {
         locks[param] = u.name;
       });
     });
     this.collab.locks = locks;
   }
   if (msg.type === "shared_preset") {
     this.sharedPresetsStatus = `Shared preset ${msg.action}: ${msg.name}`;
     this.refreshSharedPresets();
     setTimeout(() => { this.sharedPresetsStatus = ""; }, 3000);
   }
   if (msg.type === "recording") {
     this.collab.recording = msg.status === "started";
     this.collab.status = msg.status === "started" ? "Session recording…" : "Recording saved on server";
   }
   if (msg.type === "recordings" && Array.isArray(msg.files)) {
     this.collab.recordings = msg.files;
   }
   if (msg.type === "playback") {
     this.collab.status = `Playback started (${msg.events || 0} events)`;
   }
   if (msg.type === "error") {
     console.error("[Defora WS]", msg.msg || msg, msg.locked || "");
    this.collab.status = this.collabEnabled ? (msg.msg || "WebSocket error") : "";
   }
   if (msg.type === "event") {
     if (msg.msg) console.log("[Defora event]", msg.msg);
   }
   if (msg.type === "stream" && msg.src) {
    this.markVideoReady(false);
     this.streamSrc = msg.src + "?t=" + Date.now();
     if (this.hlsWatchEnabled) this.attachPlayer();
   }
   if (msg.type === "frame") {
    if (msg.item) this.mergeFrameThumb(msg.item);
    this.scheduleFrameRefresh(msg.item ? 80 : 0);
   }
  if (msg.type === "warmup_started") {
    this.performance.status = 'Startup clip generating…';
    this.appendRunsJobLog(`Warmup started (batch ${msg.batchId || '—'})`, 'info');
    void this.refreshRuns({ fromPoll: true });
  }
  if (msg.type === "warmup_done") {
    if (this.performance.status === 'Startup clip generating…') {
      this.performance.status = 'Startup clip ready';
    }
    this.appendRunsJobLog(`Warmup finished: ${msg.status || 'done'} (batch ${msg.batchId || '—'})`, 'success');
    void this.refreshRuns({ fromPoll: true });
  }
  if (msg.type === "run_demo_started") {
    this.appendRunsJobLog(`Demo run started: ${msg.runId || '—'}`, 'info');
    void this.refreshRuns({ fromPoll: true });
  }
  if (msg.type === "run_demo_done") {
    this.appendRunsJobLog(`Demo run ${msg.status || 'done'}: ${msg.runId || '—'}`, 'success');
    void this.refreshRuns({ fromPoll: true });
  }
  if (msg.type === "runs_job_log" && msg.entry) {
    this.mergeRunsJobLogEntry(msg.entry);
    if (msg.entry.kind === 'story_llm_request' && msg.entry.ollamaRequest) {
      this.applyStoryLlmRequestLog({
        clientRequest: msg.entry.clientRequest,
        ollamaRequest: msg.entry.ollamaRequest,
        logId: msg.entry.id,
      });
    }
  }
  if (msg.type === "deforum_settings") {
    this.loadDeforumSettings({ syncServerModel: false });
  }
  if (msg.type === "sd_model" && msg.model) {
    const modelName = msg.model.model_name || msg.model.title || '';
    this.applyLoadedModelSelection(modelName, { queueDeforumSave: false });
  }
 },
 collabIdentify() {
   if (!this.ws || this.ws.readyState !== 1) return;
   this.wsSend({ type: "identify", name: this.collab.userName || "Performer" });
 },
 saveCollabUserName() {
   try {
     localStorage.setItem("defora_user_name", this.collab.userName || "Performer");
   } catch (_) {}
 },
 wsSend(payload) {
   if (!this.ws || this.ws.readyState !== 1) return;
   this.ws.send(JSON.stringify(payload));
 },
 modelSourceLabel(source) {
   return modelSourceLabel(source);
 },
 isParamLocked(key) {
   return Boolean(this.collab.locks[key]);
 },
 isParamLockedByMe(key) {
   const who = this.collab.locks[key];
   return who && who === (this.collab.userName || "Performer");
 },
 paramLockTitle(key) {
   if (!this.collab.locks[key]) return "Lock parameter for collaboration";
   if (this.isParamLockedByMe(key)) return "Unlock (you hold this lock)";
   return `Locked by ${this.collab.locks[key]}`;
 },
 toggleParamLock(key) {
   if (this.isParamLockedByMe(key)) {
     this.unlockParam(key);
   } else if (!this.isParamLocked(key)) {
     this.wsSend({ type: "lock_param", param: key });
   } else {
     this.collab.status = `${key} is locked by ${this.collab.locks[key]}`;
   }
 },
 isParamPinned(key) {
   return this.pinnedParams.includes(key);
 },
 toggleParamPin(key) {
   const idx = this.pinnedParams.indexOf(key);
   if (idx === -1) {
     this.pinnedParams.push(key);
   } else {
     this.pinnedParams.splice(idx, 1);
   }
   try {
     if (typeof localStorage !== 'undefined') {
       localStorage.setItem('defora_pinned_params', JSON.stringify(this.pinnedParams));
     }
   } catch (_) {}
 },
 unlockParam(key) {
   this.wsSend({ type: "unlock_param", param: key });
 },
 toggleSessionRecording() {
   if (this.collab.recording) {
     this.wsSend({ type: "stop_recording" });
   } else {
     this.wsSend({ type: "start_recording" });
   }
 },
 listSessionRecordings() {
   this.wsSend({ type: "list_recordings" });
 },
 playbackSessionRecording(filename) {
   this.wsSend({ type: "playback_recording", recordingFile: filename });
 },
 async refreshSharedPresets() {
  this.sharedPresetsLoading = true;
   try {
     const { data } = await apiFetch("/api/shared-presets", {}, "shared-presets list");
     this.sharedPresets = data.presets || [];
   } catch (err) {
     this.sharedPresetsStatus = err.message;
  } finally {
    this.sharedPresetsLoading = false;
   }
 },
 async shareCurrentPreset() {
   const name = (this.sharedPresetName || this.newPresetName || this.currentPreset || "shared").replace(/[^a-zA-Z0-9_-]/g, "") || "shared";
   const preset = {
     liveVibe: this.liveVibe,
     liveCam: this.liveCam,
     audio: { bpm: this.audio.bpm, track: this.audio.track },
     cn: { slots: this.cn.slots, active: this.cn.active },
    loras: { common: this.loras.common, groupA: this.loras.groupA, groupB: this.loras.groupB },
     prompts: {
       pos: this.prompts.pos,
       neg: this.prompts.neg,
       morphOn: this.prompts.morphOn,
       loraCrossfaderOn: this.prompts.loraCrossfaderOn,
       crossfaderValue: this.prompts.crossfaderValue,
       loraCrossfaderLfoLink: this.prompts.loraCrossfaderLfoLink,
       loraCrossfaderLfoBase: this.prompts.loraCrossfaderLfoBase,
       morphBlend: this.prompts.morphBlend,
       morphBlendLfoLink: this.prompts.morphBlendLfoLink,
       morphBlendLfoBase: this.prompts.morphBlendLfoBase,
     },
     lfos: this.lfos,
     macrosRack: this.macrosRack,
     paramSources: this.paramSources,
   };
   try {
     await apiFetch("/api/shared-presets", {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({
         name,
         preset,
         sharedBy: this.collab.userName || "anonymous",
         description: `Shared from web UI`,
       }),
     }, "share preset");
     this.sharedPresetsStatus = `Shared as ${name}`;
     this.sharedPresetName = name;
     await this.refreshSharedPresets();
   } catch (err) {
     this.sharedPresetsStatus = err.message;
   }
 },
 async loadSharedPreset(name) {
   try {
     const { data } = await apiFetch(`/api/shared-presets/${encodeURIComponent(name)}`, {}, "load shared preset");
     const preset = data.preset || data;
     if (preset.liveVibe) this.liveVibe = preset.liveVibe;
     if (preset.liveCam) this.liveCam = preset.liveCam;
     if (preset.audio) Object.assign(this.audio, preset.audio);
     if (preset.cn) Object.assign(this.cn, preset.cn);
     if (preset.lfos) this.lfos = preset.lfos;
     if (preset.macrosRack) this.macrosRack = preset.macrosRack;
     if (preset.prompts) Object.assign(this.prompts, preset.prompts);
     if (preset.loras) {
      this.loras.common = preset.loras.common || [];
       this.loras.groupA = preset.loras.groupA || [];
       this.loras.groupB = preset.loras.groupB || [];
       await this.refreshLoras();
     }
     this.sharedPresetsStatus = `Loaded shared preset: ${name}`;
     setTimeout(() => { this.sharedPresetsStatus = ""; }, 3000);
   } catch (err) {
     this.sharedPresetsStatus = err.message;
   }
 },
 async deleteSharedPreset(name) {
   if (!confirm(`Delete shared preset "${name}"?`)) return;
   try {
     await apiFetch(`/api/shared-presets/${encodeURIComponent(name)}`, { method: "DELETE" }, "delete shared preset");
     await this.refreshSharedPresets();
     this.sharedPresetsStatus = `Deleted ${name}`;
   } catch (err) {
     this.sharedPresetsStatus = err.message;
   }
 },
 async refreshGpuPool(refreshStats = false) {
   this.gpuPool.loading = true;
   this.infrastructure.loading = true;
   try {
     if (refreshStats) {
       await apiFetch("/api/gpu-pool/refresh", { method: "POST" }, "gpu pool refresh");
     }
     const [poolResult, infraResult] = await Promise.allSettled([
       apiFetch("/api/gpu-pool", {}, "gpu pool status"),
       apiFetch("/api/infrastructure", {}, "infrastructure status"),
     ]);
     if (poolResult.status === "fulfilled") {
       const data = poolResult.value.data;
       this.gpuPool.enabled = !!data.enabled;
       this.gpuPool.strategy = data.strategy || "round_robin";
      this.gpuPool.defaultForgeModel = data.defaultForgeModel || "";
       this.gpuPool.healthyNodes = data.healthyNodes ?? 0;
       this.gpuPool.nodes = data.nodes || [];
       const modelOptions = { ...(this.gpuPool.modelOptions || {}) };
       this.gpuPool.nodes.forEach((node) => {
         if (node && node.url && Array.isArray(node.availableModels) && node.availableModels.length) {
           modelOptions[node.url] = [...node.availableModels];
         }
       });
       this.gpuPool.modelOptions = modelOptions;
     } else {
       this.gpuPool.status = poolResult.reason?.message || "Failed to load GPU pool";
     }
     if (infraResult.status === "fulfilled") {
       const infra = infraResult.value.data || {};
       this.infrastructure.mediator = infra.mediator || null;
       this.infrastructure.transcoders = Array.isArray(infra.transcoders) ? infra.transcoders : [];
       this.infrastructure.updatedAt = infra.updatedAt || null;
     } else {
       this.infrastructure.mediator = null;
       this.infrastructure.transcoders = [];
     }
   } catch (err) {
     this.gpuPool.status = err.message;
   } finally {
     this.gpuPool.loading = false;
     this.infrastructure.loading = false;
   }
 },
ollamaModelOptions(url) {
  const map = this.gpuPool.modelOptions || {};
  const normalized = String(url || '').trim().replace(/\/+$/, '');
  return (map[url] || map[normalized] || []).filter(Boolean);
},
frameThumbsCacheKey() {
  return "defora.frameThumbs.v1";
},
frameThumbsCacheLimit() {
  return 48;
},
frameSrcKey(value) {
  return String(value || "").split("?")[0];
},
loadCachedFrameThumbs() {
  try {
    if (!window.localStorage) return [];
    const raw = window.localStorage.getItem(this.frameThumbsCacheKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => this.normalizeFrameThumb(item)).filter(Boolean);
  } catch (_e) {
    return [];
  }
},
saveCachedFrameThumbs(thumbs) {
  try {
    if (!window.localStorage) return;
    const payload = (Array.isArray(thumbs) ? thumbs : [])
      .slice(-this.frameThumbsCacheLimit())
      .map((thumb) => ({
        name: thumb.name,
        src: this.frameSrcKey(thumb.src || thumb.url || thumb.path || ""),
        frame: thumb.frame,
        mtime: thumb.mtime,
      }))
      .filter((thumb) => thumb.name || thumb.src);
    window.localStorage.setItem(this.frameThumbsCacheKey(), JSON.stringify(payload));
  } catch (_e) {
    /* ignore quota errors */
  }
},
mergeFrameThumbs(apiItems, { keepCachedOnEmpty = true } = {}) {
  const cached = this.loadCachedFrameThumbs();
  const apiThumbs = (Array.isArray(apiItems) ? apiItems : [])
    .map((item) => this.normalizeFrameThumb(item))
    .filter(Boolean);
  const byName = new Map();
  if (keepCachedOnEmpty || apiThumbs.length) {
    cached.forEach((thumb) => {
      if (thumb && thumb.name) byName.set(thumb.name, thumb);
    });
  }
  apiThumbs.forEach((thumb) => {
    if (thumb && thumb.name) byName.set(thumb.name, thumb);
  });
  return [...byName.values()]
    .sort((a, b) => {
      const aFrame = Number(a && a.frame);
      const bFrame = Number(b && b.frame);
      if (Number.isFinite(aFrame) && Number.isFinite(bFrame)) return aFrame - bFrame;
      return String(a && a.name || "").localeCompare(String(b && b.name || ""));
    })
    .slice(-this.frameThumbsCacheLimit());
},
normalizeFrameThumb(item) {
  if (!item) return null;
  if (typeof item === "string") {
    const src = item;
    const baseSrc = this.frameSrcKey(src);
    return {
      src,
      name: baseSrc.split("/").pop(),
      frame: this.parseFrameNumber(baseSrc),
      mtime: Date.now(),
    };
  }
  const rawSrc = item.src || item.url || item.path || "";
  const name = item.name || this.frameSrcKey(rawSrc).split("/").pop() || "";
  const frame = item.frame != null ? item.frame : this.parseFrameNumber(name || rawSrc);
  const mtime = Number(item.mtime) || Date.now();
  const src = rawSrc || (name ? `/frames/${name}?v=${mtime}` : "");
  return { src, name, frame, mtime };
},
mergeFrameThumb(item) {
  const normalized = this.normalizeFrameThumb(item);
  if (!normalized || (!normalized.name && !normalized.src)) return;
  const previousCount = this.frameStripThumbs.length;
  const selectedSrcKey = this.frameSrcKey(
    this.selectedFrameThumb ? (this.selectedFrameThumb.src || this.selectedFrameThumb.url || this.selectedFrameThumb.path || "") : ""
  );
  const next = [...(this.thumbs || [])]
    .filter((entry) => entry && entry.name !== normalized.name)
    .concat(normalized)
    .sort((a, b) => {
      const aFrame = Number(a && a.frame);
      const bFrame = Number(b && b.frame);
      if (Number.isFinite(aFrame) && Number.isFinite(bFrame)) return aFrame - bFrame;
      return String(a && a.name || "").localeCompare(String(b && b.name || ""));
    });
  this.thumbs = next;
  this.saveCachedFrameThumbs(next);
  if (this.frameStripThumbs.length > previousCount) {
    this.applyNewGeneratedFrames(previousCount);
  } else {
    this.updateFrameSelection(selectedSrcKey);
    this.updateHeldPreviewFromLatestFrame();
  }
},
scheduleFrameRefresh(delay = 0) {
  clearTimeout(this.frameRefreshTimer);
  this.frameRefreshTimer = setTimeout(() => {
    this.frameRefreshTimer = null;
    this.refreshFrames();
  }, Math.max(0, Number(delay) || 0));
},
nextFramesPollDelay({ failed = false } = {}) {
  const current = Number(this.framesRefreshBackoffMs) || 1000;
  if (failed) {
    return Math.min(10000, Math.max(1000, current * 2));
  }
  if (this.deforumPlaying) return 400;
  if (this.previewGenerating) return this.wsStatus === "connected" ? 400 : 750;
  if (this.wsStatus !== "connected") return 1500;
  return 3000;
},
async loadOllamaModels(url) {
  const normalized = (url || '').trim();
  if (!normalized) {
    this.gpuPool.status = 'Enter an Ollama URL first.';
    return [];
  }
  const { data } = await apiFetch(`/api/ollama/models?url=${encodeURIComponent(normalized)}`, {}, 'ollama models');
  const models = (data.models || [])
    .map((entry) => (entry && typeof entry === 'object' ? entry.name : entry))
    .filter(Boolean);
  const key = data && data.url ? data.url : normalized;
  this.gpuPool.modelOptions = {
    ...(this.gpuPool.modelOptions || {}),
    [key]: models,
  };
  return models;
},
async refreshGpuDraftModels() {
  try {
    const models = await this.loadOllamaModels(this.gpuPool.draft.url);
    if (!this.gpuPool.draft.model && models.length) this.gpuPool.draft.model = models[0];
    this.gpuPool.status = models.length ? `Loaded ${models.length} Ollama models.` : 'No Ollama models found.';
  } catch (err) {
    this.gpuPool.status = err.message;
  }
},
async refreshGpuEditModels() {
  try {
    const models = await this.loadOllamaModels(this.gpuPool.editDraft.url);
    if (!this.gpuPool.editDraft.model && models.length) this.gpuPool.editDraft.model = models[0];
    this.gpuPool.status = models.length ? `Loaded ${models.length} Ollama models.` : 'No Ollama models found.';
  } catch (err) {
    this.gpuPool.status = err.message;
  }
},
gpuForgeOptionKeys() {
  return [
    'sampler_name',
    'scheduler',
    'steps',
    'cfg_scale',
    'width',
    'height',
    'batch_size',
    'sd_vae',
    'clip_skip',
    'eta_ddim',
    'eta_ancestral',
    'sigma_churn',
    'enable_emphasis',
    'use_old_sampling',
    'do_not_add_watermark',
  ];
},
normalizeGpuForgeSettings(raw = {}, fallback = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  const numericKeys = new Set(['steps', 'cfg_scale', 'width', 'height', 'batch_size', 'clip_skip', 'eta_ddim', 'eta_ancestral', 'sigma_churn']);
  const booleanKeys = new Set(['enable_emphasis', 'use_old_sampling', 'do_not_add_watermark']);
  const merged = {};
  for (const key of this.gpuForgeOptionKeys()) {
    const value = source[key] !== undefined ? source[key] : base[key];
    if (value === undefined) continue;
    if (booleanKeys.has(key)) {
      merged[key] = !!value;
      continue;
    }
    if (numericKeys.has(key)) {
      const num = Number(value);
      if (Number.isFinite(num)) merged[key] = num;
      continue;
    }
    merged[key] = value == null ? null : String(value);
  }
  return merged;
},
gpuForgePreferredQuery(nodeId) {
  return nodeId ? `?preferredNode=${encodeURIComponent(nodeId)}` : '';
},
inferGpuMediatorHost(node = {}) {
  const explicit = String((node.mediator && node.mediator.host) || (node.mediatorSettings && node.mediatorSettings.host) || '').trim();
  if (explicit) return explicit.replace(/^https?:\/\//i, '').split(':')[0];
  const fromName = String(node.name || '').trim();
  if (fromName && !fromName.includes('.')) return fromName;
  try {
    const host = new URL(node.url || '').hostname;
    if (host && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) return host;
    if (fromName) return fromName;
    return host || 'localhost';
  } catch (_e) {
    return fromName || 'localhost';
  }
},
normalizeGpuMediatorSettings(raw = {}, nodeHint = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const host = String(source.host || '').trim() || this.inferGpuMediatorHost(nodeHint);
  const deforumPort = Number(source.deforumPort ?? source.deforum_port ?? 8765);
  const deforumationPort = Number(source.deforumationPort ?? source.deforumation_port ?? 8766);
  return {
    host: host.replace(/^https?:\/\//i, '').split(':')[0],
    deforumPort: Number.isFinite(deforumPort) ? deforumPort : 8765,
    deforumationPort: Number.isFinite(deforumationPort) ? deforumationPort : 8766,
  };
},
mediatorStatusClass(status) {
  if (status === 'healthy') return 'st-healthy';
  if (status === 'unreachable') return 'st-unhealthy';
  return 'st-unknown';
},
async probeGpuForgeMediatorPorts() {
  const modal = this.gpuPool.forgeModal;
  if (!modal.open || !modal.nodeId) return;
  modal.mediator.probing = true;
  modal.status = 'Checking mediator ports…';
  try {
    const { data } = await apiFetch(
      `/api/gpu-pool/nodes/${encodeURIComponent(modal.nodeId)}/mediator-probe`,
      { method: 'POST' },
      'mediator port probe'
    );
    const mediator = data && data.mediator ? data.mediator : null;
    if (mediator) {
      modal.mediator.host = mediator.host || modal.mediator.host;
      modal.mediator.deforumPort = mediator.deforumPort ?? modal.mediator.deforumPort;
      modal.mediator.deforumationPort = mediator.deforumationPort ?? modal.mediator.deforumationPort;
      modal.mediator.deforumStatus = mediator.deforumStatus || '';
      modal.mediator.deforumationStatus = mediator.deforumationStatus || '';
      modal.status = `Deforum ${mediator.deforumPort}: ${mediator.deforumStatus}; Deforumation ${mediator.deforumationPort}: ${mediator.deforumationStatus}`;
    } else {
      modal.status = 'Port check finished.';
    }
    await this.refreshGpuPool(false);
  } catch (err) {
    modal.status = err.message || 'Mediator port check failed.';
  } finally {
    modal.mediator.probing = false;
  }
},
onGpuForgeModalBackdropClick(event) {
  if (event?.target === event?.currentTarget) this.closeGpuForgeModal();
},
closeGpuForgeModal() {
  this.gpuPool.forgeModal = {
    open: false,
    nodeId: '',
    nodeName: '',
    url: '',
    priority: 1,
    model: '',
    currentModel: '',
    available: false,
    loading: false,
    saving: false,
    applying: false,
    status: '',
    samplers: [],
    schedulers: [],
    vaeList: [],
    modelInfo: null,
    options: {},
    mediator: {
      host: '',
      deforumPort: 8765,
      deforumationPort: 8766,
      deforumStatus: '',
      deforumationStatus: '',
      probing: false,
    },
  };
},
async refreshGpuForgeModalOptions() {
  const modal = this.gpuPool.forgeModal;
  if (!modal.open || !modal.nodeId) return;
  const query = this.gpuForgePreferredQuery(modal.nodeId);
  const fallbackNode = (this.gpuPool.nodes || []).find((node) => node && node.id === modal.nodeId) || {};
  modal.loading = true;
  modal.status = 'Loading Forge instance...';
  try {
    const [optRes, sampRes, schedRes, vaeRes, curRes] = await Promise.all([
      fetch(`/api/forge/options${query}`),
      fetch(`/api/forge/samplers${query}`),
      fetch(`/api/forge/schedulers${query}`),
      fetch(`/api/forge/vae${query}`),
      fetch(`/api/sd-models/current${query}`),
    ]);
    const [opt, samp, sched, vae, cur] = await Promise.all([
      optRes.json(),
      sampRes.json(),
      schedRes.json(),
      vaeRes.json(),
      curRes.json(),
    ]);
    if (!this.gpuPool.forgeModal.open || this.gpuPool.forgeModal.nodeId !== modal.nodeId) return;
    const fallbackOptions = this.normalizeGpuForgeSettings(
      fallbackNode.forgeSettings || {},
      this.forge.options || {}
    );
    this.gpuPool.forgeModal.available = !!opt.available;
    this.gpuPool.forgeModal.options = this.normalizeGpuForgeSettings(opt.options || {}, fallbackOptions);
    this.gpuPool.forgeModal.samplers = Array.isArray(samp.samplers) ? samp.samplers : [...(this.forge.samplers || [])];
    this.gpuPool.forgeModal.schedulers = Array.isArray(sched.schedulers) ? sched.schedulers : [...(this.forge.schedulers || [])];
    this.gpuPool.forgeModal.vaeList = Array.isArray(vae.vae) ? vae.vae : [...(this.forge.vaeList || [])];
    const currentModel = cur && cur.model ? (cur.model.model_name || cur.model.title || '') : '';
    this.gpuPool.forgeModal.currentModel = currentModel;
    this.gpuPool.forgeModal.model = fallbackNode.model || currentModel || '';
    this.gpuPool.forgeModal.modelInfo = (cur && cur.model && cur.model.metadata) || null;
    this.gpuPool.forgeModal.status = opt.available ? 'Forge instance ready.' : (opt.error || 'Forge instance unavailable.');
  } catch (err) {
    this.gpuPool.forgeModal.options = this.normalizeGpuForgeSettings(
      fallbackNode.forgeSettings || {},
      this.forge.options || {}
    );
    this.gpuPool.forgeModal.samplers = [...(this.forge.samplers || [])];
    this.gpuPool.forgeModal.schedulers = [...(this.forge.schedulers || [])];
    this.gpuPool.forgeModal.vaeList = [...(this.forge.vaeList || [])];
    this.gpuPool.forgeModal.currentModel = fallbackNode.currentModel || fallbackNode.model || '';
    this.gpuPool.forgeModal.model = fallbackNode.model || fallbackNode.currentModel || '';
    this.gpuPool.forgeModal.modelInfo = null;
    this.gpuPool.forgeModal.available = false;
    this.gpuPool.forgeModal.status = err.message || 'Failed to load Forge instance.';
  } finally {
    if (this.gpuPool.forgeModal.nodeId === modal.nodeId) {
      this.gpuPool.forgeModal.loading = false;
    }
  }
},
async openGpuForgeModal(node) {
  const fallbackOptions = this.normalizeGpuForgeSettings(node && node.forgeSettings || {}, this.forge.options || {});
  const mediatorHint = { name: node.name, url: node.url, mediator: node.mediator, mediatorSettings: node.mediatorSettings };
  const mediatorDefaults = this.normalizeGpuMediatorSettings(node.mediator || node.mediatorSettings || {}, mediatorHint);
  this.gpuPool.editId = null;
  this.gpuPool.forgeModal = {
    open: true,
    nodeId: node.id,
    nodeName: node.name || '',
    url: node.url || '',
    priority: node.priority || 1,
    model: node.model || '',
    currentModel: node.currentModel || node.model || '',
    available: false,
    loading: false,
    saving: false,
    applying: false,
    status: '',
    samplers: [...(this.forge.samplers || [])],
    schedulers: [...(this.forge.schedulers || [])],
    vaeList: [...(this.forge.vaeList || [])],
    modelInfo: null,
    options: fallbackOptions,
    mediator: {
      host: mediatorDefaults.host,
      deforumPort: mediatorDefaults.deforumPort,
      deforumationPort: mediatorDefaults.deforumationPort,
      deforumStatus: (node.mediator && node.mediator.deforumStatus) || '',
      deforumationStatus: (node.mediator && node.mediator.deforumationStatus) || '',
      probing: false,
    },
  };
  await this.refreshGpuForgeModalOptions();
},
async persistGpuForgeModalNode() {
  const modal = this.gpuPool.forgeModal;
  const payload = {
    name: modal.nodeName || modal.url,
    url: modal.url,
    backend: 'sd-forge',
    priority: modal.priority || 1,
    model: modal.model || modal.currentModel || null,
    forgeSettings: this.normalizeGpuForgeSettings(modal.options || {}, this.forge.options || {}),
    mediatorSettings: this.normalizeGpuMediatorSettings(modal.mediator || {}, {
      name: modal.nodeName,
      url: modal.url,
    }),
  };
  const { data } = await apiFetch(`/api/gpu-pool/nodes/${encodeURIComponent(modal.nodeId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 'save forge gpu node');
  const savedNode = data && data.node ? data.node : null;
  if (savedNode) {
    this.gpuPool.forgeModal.nodeId = savedNode.id || modal.nodeId;
    this.gpuPool.forgeModal.nodeName = savedNode.name || modal.nodeName;
    this.gpuPool.forgeModal.url = savedNode.url || modal.url;
    this.gpuPool.forgeModal.priority = savedNode.priority || modal.priority;
    this.gpuPool.forgeModal.model = savedNode.model || modal.model;
  }
  await this.refreshGpuPool(false);
  return savedNode;
},
async saveGpuForgeModal() {
  this.gpuPool.forgeModal.saving = true;
  try {
    await this.persistGpuForgeModalNode();
    this.gpuPool.forgeModal.status = 'Forge instance settings saved.';
    this.gpuPool.status = 'Forge instance settings saved.';
  } catch (err) {
    this.gpuPool.forgeModal.status = err.message;
    this.gpuPool.status = err.message;
  } finally {
    this.gpuPool.forgeModal.saving = false;
  }
},
async applyGpuForgeModalOptions() {
  this.gpuPool.forgeModal.applying = true;
  try {
    const savedNode = await this.persistGpuForgeModalNode();
    const preferredNode = (savedNode && savedNode.id) || this.gpuPool.forgeModal.nodeId;
    await apiFetch(`/api/forge/options${this.gpuForgePreferredQuery(preferredNode)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.normalizeGpuForgeSettings(this.gpuPool.forgeModal.options || {}, this.forge.options || {})),
    }, 'apply forge node options');
    this.gpuPool.forgeModal.status = 'Forge options applied to this instance.';
    this.gpuPool.status = 'Forge options applied to this instance.';
    await this.refreshGpuForgeModalOptions();
  } catch (err) {
    this.gpuPool.forgeModal.status = err.message;
    this.gpuPool.status = err.message;
  } finally {
    this.gpuPool.forgeModal.applying = false;
  }
},
 async saveGpuPoolSettings() {
   try {
     await apiFetch("/api/gpu-pool", {
       method: "PUT",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({
         enabled: this.gpuPool.enabled,
         strategy: this.gpuPool.strategy,
       }),
     }, "gpu pool settings");
     this.gpuPool.status = this.gpuPool.enabled ? "Load balancing enabled" : "Load balancing disabled";
   } catch (err) {
     this.gpuPool.status = err.message;
   }
 },

 async saveDefaultForgeModel({ preload = true } = {}) {
   try {
     this.gpuPool.defaultForgeModelStatus = "Saving default model…";
     const res = await apiFetch(
       "/api/gpu-pool/default-forge-model",
       {
         method: "PUT",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           model: this.gpuPool.defaultForgeModel || "",
           preload: preload === true,
           singleNode: true,
         }),
       },
       "default forge model"
     );
     const results = res.data?.preloadResults;
     if (Array.isArray(results) && results.length) {
       const ok = results.filter((r) => r && r.ok).length;
       const fail = results.filter((r) => r && !r.ok).length;
       this.gpuPool.defaultForgeModelStatus = `Default model saved. Preload: ${ok} ok, ${fail} failed.`;
     } else {
       this.gpuPool.defaultForgeModelStatus = "Default model saved.";
     }
     await this.refreshGpuPool(true);
   } catch (err) {
     this.gpuPool.defaultForgeModelStatus = err.message;
     this.gpuPool.status = err.message;
   }
 },
 async addGpuNode() {
   const url = (this.gpuPool.draft.url || "").trim();
   if (!url) return;
   try {
     await apiFetch("/api/gpu-pool/nodes", {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({
         url,
         name: this.gpuPool.draft.name || url,
         backend: this.gpuPool.draft.backend,
         enabled: false,
         priority: this.gpuPool.draft.priority || 1,
        model: this.gpuPool.draft.backend === 'ollama' ? (this.gpuPool.draft.model || null) : null,
       }),
     }, "add gpu node");
    this.gpuPool.draft = { url: "", name: "", backend: "sd-forge", priority: 1, model: "" };
     await this.refreshGpuPool(false);
     this.gpuPool.status = "Instance added (disabled). Edit if needed, then enable.";
   } catch (err) {
     this.gpuPool.status = err.message;
   }
 },
async startEditGpuNode(n) {
   if (n.enabled) {
     this.gpuPool.status = "Disable the node before editing.";
     return;
   }
  if (n.backend === 'sd-forge') {
    await this.openGpuForgeModal(n);
    return;
  }
   this.gpuPool.editId = n.id;
   this.gpuPool.editDraft = {
     name: n.name,
     url: n.url,
     backend: n.backend,
     priority: n.priority || 1,
    model: n.model || '',
   };
 },
 async saveGpuNodeEdit(n) {
   try {
     await apiFetch(`/api/gpu-pool/nodes/${encodeURIComponent(n.id)}`, {
       method: "PUT",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify(this.gpuPool.editDraft),
     }, "edit gpu node");
     this.gpuPool.editId = null;
     await this.refreshGpuPool(false);
     this.gpuPool.status = "Node updated.";
   } catch (err) {
     this.gpuPool.status = err.message;
   }
 },
 async disableGpuNode(n) {
   try {
     await apiFetch(`/api/gpu-pool/nodes/${encodeURIComponent(n.id)}/disable`, { method: "POST" }, "disable gpu");
     await this.refreshGpuPool(false);
   } catch (err) {
     this.gpuPool.status = err.message;
   }
 },
 async enableGpuNode(n) {
   try {
     await apiFetch(`/api/gpu-pool/nodes/${encodeURIComponent(n.id)}/enable`, { method: "POST" }, "enable gpu");
     await this.refreshGpuPool(true);
     this.gpuPool.status = `${n.name} enabled.`;
   } catch (err) {
     this.gpuPool.status = err.message;
   }
 },
 async removeGpuNode(n) {
   if (!confirm(`Remove GPU instance "${n.name}"?`)) return;
   try {
     await apiFetch(`/api/gpu-pool/nodes/${encodeURIComponent(n.id)}`, { method: "DELETE" }, "remove gpu");
     await this.refreshGpuPool(false);
     this.gpuPool.status = "Node removed.";
   } catch (err) {
     this.gpuPool.status = err.message;
   }
 },
 formatGpuMemory(n) {
   if (n.memoryUsedMb == null && n.memoryTotalMb == null) return "—";
   const used = n.memoryUsedMb != null ? `${n.memoryUsedMb}` : "?";
   const total = n.memoryTotalMb != null ? `${n.memoryTotalMb}` : "?";
   return `${used} / ${total} MB`;
 },
 sendControl(controlType, payload) {
   if (!this.ws || this.ws.readyState !== 1) return;
  if (controlType === "liveParam" && payload && typeof payload === "object") {
    this.syncMotionPadFromPayload(payload);
  }
   const msg = { type: "control", controlType, payload };
   this.ws.send(JSON.stringify(msg));
 },
syncMotionPadFromPayload(payload) {
  if (!payload || typeof payload !== "object") return;
  const x = payload.translation_x ?? payload.panx;
  const y = payload.translation_y ?? payload.pany;
  const z = payload.translation_z;
  const zoom = payload.zoom_2d ?? payload.zoom;
  const angle = payload.angle_2d ?? payload.angle;
  if (x != null && Number.isFinite(Number(x))) {
    this.motionPadValues.translation_x = Number(x);
  }
  if (y != null && Number.isFinite(Number(y))) {
    this.motionPadValues.translation_y = Number(y);
  }
  if (z != null && Number.isFinite(Number(z))) {
    this.motionPadValues.translation_z = Number(z);
  }
  if (zoom != null && Number.isFinite(Number(zoom))) {
    const zv = Number(zoom);
    this.motionPadValues.zoom = zv;
    this.motionPadValues.look_y = this.clampVal(zv, -1, 1);
  }
  if (angle != null && Number.isFinite(Number(angle))) {
    this.motionPadValues.look_x = this.clampVal(Number(angle), -1, 1);
  }
  const tilt = payload.rotation_z ?? payload.tilt;
  if (tilt != null && Number.isFinite(Number(tilt))) {
    this.motionPadValues.rotation_z = Number(tilt);
  }
},
 updateParam(p, evt) {
   if (this.isParamLocked(p.key) && !this.isParamLockedByMe(p.key)) {
     console.warn(`[Defora] Parameter "${p.key}" is locked by ${this.collab.locks[p.key]}`);
     return;
   }
   const meta = this.paramControlMeta(p.key);
   const val = this.clampParamToMeta(evt.target.value, meta);
   if (meta.hud) meta.hud.val = val;
   this.syncHudMotionFromParam(p.key, val);
   this.queueLiveParam(p.key, val);
   if (!this.deforumPlaying) this.schedulePreviewFrame();
 },
 setSource(key, source) {
   this.paramSources[key] = source;
   this.sendControl("paramSource", { key, source });
 },
 clearLiveModSlotForParam(paramKey) {
   if (!paramKey) return;
   const routeKey = this.liveParamCanonicalKey(paramKey);
   this.liveModSlotParamKeys = this.liveModSlotParamKeys.map((k) =>
     (k === routeKey || k === paramKey ? '' : k)
   );
 },
 paramLiveModSlotIndex(paramKey) {
   if (!paramKey) return -1;
   const routeKey = this.liveParamCanonicalKey(paramKey);
   return this.liveModSlotParamKeys.findIndex((k) => k === routeKey || k === paramKey);
 },
 assignParamToLiveModSlot(paramKey, slotIndex) {
   if (!paramKey || slotIndex < 0 || slotIndex > 7) return;
   const routeKey = this.liveParamCanonicalKey(paramKey);
   this.liveModSlotParamKeys = this.liveModSlotParamKeys.map((k, i) => {
     if (i === slotIndex) return routeKey;
     if (k === routeKey || k === paramKey) return '';
     return k;
   });
 },
 paramHasActiveMapping(paramKey) {
   if (!paramKey) return false;
   const routeKey = this.liveParamCanonicalKey(paramKey);
   if (this.paramLiveModSlotIndex(routeKey) >= 0) return true;
   const owners = this.targetOwners[routeKey] || this.targetOwners[paramKey] || [];
   if (owners.length) return true;
   if (this.audioMappings.some((m) => m.param === routeKey || m.param === paramKey)) return true;
   if (this.macrosRack.some((m) => m.on && (m.target === routeKey || m.target === paramKey))) return true;
   const src = this.paramSources[routeKey] || this.paramSources[paramKey];
   return !!(src && src !== 'Manual');
 },
 paramMappingLabels(paramKey) {
   if (!paramKey) return [];
   const routeKey = this.liveParamCanonicalKey(paramKey);
   const labels = [];
   const slotIdx = this.paramLiveModSlotIndex(routeKey);
   if (slotIdx >= 0) {
     const opt = this.liveModSlotPickerOptions.find((o) => o.index === slotIdx);
     labels.push(opt ? opt.label : `Slot ${slotIdx + 1}`);
   }
   const owners = this.targetOwners[routeKey] || this.targetOwners[paramKey] || [];
   owners.forEach((o) => labels.push(o));
   this.audioMappings.forEach((m, idx) => {
     if (m.param !== routeKey && m.param !== paramKey) return;
     labels.push(`Audio ${this.audioBandTabDefs[idx]?.label || idx + 1}`);
   });
   this.macrosRack.forEach((m, idx) => {
     if (!m.on || (m.target !== routeKey && m.target !== paramKey)) return;
     labels.push(`Macro ${idx + 1}`);
   });
   const src = this.paramSources[routeKey] || this.paramSources[paramKey];
   if (src && src !== 'Manual' && !labels.length) labels.push(src);
   return labels;
 },
 openModulationMapPicker(paramKey) {
   if (!paramKey) return;
   this.modulationMapPicker = {
     paramKey: this.liveParamCanonicalKey(paramKey),
     step: 'choose',
   };
 },
 closeModulationMapPicker() {
   this.modulationMapPicker = null;
 },
 onModulationMapPickerBackdropClick(event) {
   if (event.target === event.currentTarget) this.closeModulationMapPicker();
 },
 formatMappingParamValue(key) {
   const v = Number(this.paramControlMeta(key).value);
   if (!Number.isFinite(v)) return '—';
   return Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
 },
 assignModulationMapToSlot(slotIndex) {
   const key = this.modulationMapPicker && this.modulationMapPicker.paramKey;
   if (!key) return;
   this.assignParamToLiveModSlot(key, slotIndex);
   this.closeModulationMapPicker();
 },
 mapModulationParamToLfo(lfoId) {
   const key = this.modulationMapPicker && this.modulationMapPicker.paramKey;
   if (!key) return;
   const lfo = this.lfos.find((l) => l.id === lfoId);
   if (!lfo) return;
   if (!lfo.on) lfo.on = true;
   if (!lfo.targets.includes(key)) this.toggleLfoTarget(lfo, key);
   this.modulationSelectedLfoId = lfo.id;
   this.closeModulationMapPicker();
 },
 onAudioFileDrop(evt) {
   const file = evt && evt.dataTransfer && evt.dataTransfer.files && evt.dataTransfer.files[0];
   if (!file) return;
   if (file.type && !String(file.type).startsWith('audio/')) return;
   this.handleAudioUpload({ target: { files: [file], value: '' } });
 },
 onModulationAudioDragover(event) {
   event?.preventDefault();
 },
 onModulationAudioDrop(event) {
   event?.preventDefault();
   this.onAudioFileDrop(event);
 },
 onLfoRouteButtonClick(id) {
   this.modulationSelectedLfoId = id;
 },
 clearParamMapping(paramKey) {
   if (!paramKey) return;
   const routeKey = this.liveParamCanonicalKey(paramKey);
   this.clearLiveModSlotForParam(routeKey);
   this.lfos.forEach((lfo) => {
     [routeKey, paramKey].forEach((k) => {
       const idx = lfo.targets.indexOf(k);
       if (idx >= 0) lfo.targets.splice(idx, 1);
     });
   });
   this.audioMappings = this.audioMappings.filter(
     (m) => m.param !== routeKey && m.param !== paramKey
   );
   this.macrosRack.forEach((m) => {
     if (m.target === routeKey || m.target === paramKey) m.on = false;
   });
   this.clearMidiBinding(routeKey);
   this.setSource(paramKey, 'Manual');
   if (routeKey !== paramKey) this.setSource(routeKey, 'Manual');
 },
 openModulationMapping(paramKey) {
   if (!paramKey) return;
   const routeKey = this.liveParamCanonicalKey(paramKey);
   this.modulationRouteFocusKey = routeKey;
   let lfo = this.selectedModulationLfo;
   if (!lfo) {
     lfo = this.lfos.find((l) => l.on) || this.lfos[0];
     if (lfo) this.modulationSelectedLfoId = lfo.id;
   }
   if (lfo) {
     if (!lfo.on) lfo.on = true;
     if (!lfo.targets.includes(routeKey)) {
       this.toggleLfoTarget(lfo, routeKey);
     }
   }
   this.switchTab('MODULATION');
   this.currentSubTab.MODULATION = 'LFO';
   try { window.localStorage && window.localStorage.setItem('defora_subtab_MODULATION', 'LFO'); } catch (_e) {}
 },
 setLiveModValue(paramKey, value) {
   if (!paramKey) return;
   const meta = this.paramControlMeta(paramKey);
   const v = this.clampParamToMeta(value, meta);
   const t = this.modulationTargetByKey(paramKey);
   if (t && t.field) {
     this.applyAnimationModulation(t.field, v);
   } else {
     if (meta.hud) {
       meta.hud.val = v;
       this.syncHudMotionFromParam(meta.hud.key, v);
     }
     this.queueLiveParam(paramKey, v);
   }
   if (!this.deforumPlaying) this.schedulePreviewFrame();
 },
 livePadDown(evt, slot) {
   this._livePadDragging = true;
   this.livePadMove(evt, slot);
 },
 livePadMove(evt, slot) {
   if (!this._livePadDragging || !slot) return;
   const el = evt.currentTarget;
   if (!el || !el.getBoundingClientRect) return;
   const rect = el.getBoundingClientRect();
   const point = evt.touches && evt.touches[0] ? evt.touches[0] : evt;
   const nx = (point.clientX - rect.left) / (rect.width || 1);
   const ny = (point.clientY - rect.top) / (rect.height || 1);
   const x = Math.max(0, Math.min(1, nx));
   const y = Math.max(0, Math.min(1, 1 - ny));
   const pxMeta = slot.paramKeyX ? this.paramControlMeta(slot.paramKeyX) : null;
   const pyMeta = slot.paramKeyY ? this.paramControlMeta(slot.paramKeyY) : null;
   if (slot.paramKeyX && pxMeta) {
     const xv = pxMeta.min + x * ((pxMeta.max - pxMeta.min) || 1);
     this.setLiveModValue(slot.paramKeyX, xv);
   }
   if (slot.paramKeyY && pyMeta) {
     const yv = pyMeta.min + y * ((pyMeta.max - pyMeta.min) || 1);
     this.setLiveModValue(slot.paramKeyY, yv);
   }
 },
 livePadUp() {
   this._livePadDragging = false;
 },
 sourceTip(p) {
   const src = this.paramSources[p.key];
   if (src === "Beat") return "Beat/LFO";
   if (src === "MIDI") return "MIDI mapping";
   return "Manual";
 },
applyMotionPresetAndSelect(name) {
  this.motionSelectedPreset = name;
  this.applyMotionPreset(name);
},
loadSelectedMotionPreset() {
  const name = this.motionSelectedPreset;
  if (!name) return;
  if (this.motionPresets[name]) {
    this.applyMotionPreset(name);
    return;
  }
  if (this.motionStylesSaved[name]) {
    this.applySavedMotionStyle(name);
  }
},
motionAxisToLiveKey(axis) {
  if (axis === 'zoom') return 'zoom_2d';
  if (axis === 'angle') return 'angle_2d';
  if (axis === 'rotation_z') return 'rotation_z';
  if (axis === 'translation_x' || axis === 'translation_y' || axis === 'translation_z') return axis;
  return null;
},
motionLiveKeyToScheduleKey(liveKey) {
  const k = String(liveKey || '');
  if (k === 'zoom_2d') return 'zoom';
  if (k === 'angle_2d') return 'angle';
  if (k === 'rotation_z') return 'rotation_3d_z';
  if (k === 'translation_x' || k === 'translation_y' || k === 'translation_z') return k;
  return k;
},
motionSmoothnessStartFrame() {
  if (this.selectedFrameThumb && this.selectedFrameThumb.frame != null && !Number.isNaN(Number(this.selectedFrameThumb.frame))) {
    return Math.max(0, Math.round(Number(this.selectedFrameThumb.frame)));
  }
  const fps = Number(this.deforumSettings && this.deforumSettings.fps) || 24;
  const t = Number(this.jobPlaybackTimeSec) || 0;
  return Math.max(0, Math.round(t * fps));
},
readMotionScheduleValue(liveKey, frame) {
  const scheduleKey = this.motionLiveKeyToScheduleKey(liveKey);
  const raw = this.deforumSettings && this.deforumSettings[scheduleKey];
  return readScheduleValueAtFrame(raw, frame);
},
toggleMotionPadSpringBack() {
  this.motionPadSpringBack = !this.motionPadSpringBack;
  this.saveSessionState();
},
motionSmoothnessActive() {
  const smooth = this.motionSmoothness || {};
  if (!smooth.enabled) return false;
  return Math.max(1, Math.round(Number(smooth.frames) || 1)) > 1;
},
applyMotionParamWithSmoothness(liveKey, targetValue) {
  const num = Number(targetValue);
  if (!Number.isFinite(num)) return;
  if (!this.motionSmoothnessActive()) {
    this.emitMotionLiveParam(liveKey, num);
    if (!this.deforumPlaying) this.schedulePreviewFrame();
    return;
  }
  const frameCount = Math.max(1, Math.round(Number(this.motionSmoothness.frames) || 1));
  const startFrame = this.motionSmoothnessStartFrame();
  const scheduleKey = this.motionLiveKeyToScheduleKey(liveKey);
  const existingRaw = (this.deforumSettings && this.deforumSettings[scheduleKey]) || '';
  const startValue = this.readMotionScheduleValue(liveKey, startFrame);
  const schedule = buildLinearScheduleRamp(startFrame, frameCount, startValue, num, existingRaw);
  this.onDeforumFieldInput(scheduleKey, schedule, 'text');
},
previewMotionAxis(axis, value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return;
  if (axis === 'translation_x') this.motionPadValues.translation_x = num;
  else if (axis === 'translation_y') this.motionPadValues.translation_y = num;
  else if (axis === 'translation_z') this.motionPadValues.translation_z = num;
  else if (axis === 'zoom') {
    this.motionPadValues.zoom = num;
    if (this.isDeforumMotion2d) this.motionPadValues.look_y = this.clampVal(num, -1, 1);
  } else if (axis === 'angle') {
    this.motionPadValues.look_x = this.clampVal(num, -1, 1);
  } else if (axis === 'rotation_z') {
    this.motionPadValues.rotation_z = num;
  }
},
motionAxisTargetValue(axis) {
  if (axis === 'translation_x') return Number(this.motionPadValues.translation_x ?? 0);
  if (axis === 'translation_y') return Number(this.motionPadValues.translation_y ?? 0);
  if (axis === 'translation_z') return Number(this.motionPadValues.translation_z ?? 0);
  if (axis === 'zoom') return Number(this.motionPadValues.zoom ?? 1);
  if (axis === 'angle') return Number(this.motionPadValues.look_x ?? 0);
  if (axis === 'rotation_z') return Number(this.motionPadValues.rotation_z ?? 0);
  return 0;
},
setMotionAxis(axis, value) {
  this.previewMotionAxis(axis, value);
  const liveKey = this.motionAxisToLiveKey(axis);
  if (!liveKey) return;
  const pan = this.liveHudParamByKey('panx');
  const pany = this.liveHudParamByKey('pany');
  if (axis === 'translation_x' && pan && this.motionMovePadRange === 1) pan.val = this.motionPadValues.translation_x;
  if (axis === 'translation_y' && pany && this.motionMovePadRange === 1) pany.val = this.motionPadValues.translation_y;
  this.applyMotionParamWithSmoothness(liveKey, this.motionAxisTargetValue(axis));
},
onMotionSmoothnessFramesChange(raw) {
  const n = Math.round(Number(raw));
  this.motionSmoothness.frames = Number.isFinite(n) ? Math.max(1, Math.min(999, n)) : 1;
  this.saveSessionState();
},
captureMotionPadSnapshot() {
  const padId = this.xyPad.activePad;
  const snap = padId ? this.captureMotionPadSnapshotForPad(padId) : null;
  if (snap) return snap;
  return {
    translation_x: Number(this.motionPadValues.translation_x ?? 0),
    translation_y: Number(this.motionPadValues.translation_y ?? 0),
    look_x: Number(this.motionPadValues.look_x ?? 0),
    look_y: Number(this.motionPadValues.look_y ?? 0),
  };
},
motionXYPadSlotById(padId) {
  return (this.motionXYPadSlots || []).find((slot) => slot.id === padId) || null;
},
motionAxisRangeForKey(axisKey) {
  if (axisKey === 'translation_x' || axisKey === 'translation_y') {
    return this.motionMovePadRange;
  }
  if (axisKey === 'translation_z') return 10;
  if (axisKey === 'rotation_z') return 180;
  return 1;
},
setMotionXYPadAxis(padId, channel, axisKey) {
  const slot = this.motionXYPadSlotById(padId);
  if (!slot || !axisKey) return;
  const otherChannel = channel === 'x' ? 'y' : 'x';
  const otherKey = slot[otherChannel === 'x' ? 'xAxis' : 'yAxis'];
  if (axisKey === otherKey) return;
  if (channel === 'x') slot.xAxis = axisKey;
  else slot.yAxis = axisKey;
  this.saveSessionState();
},
captureMotionPadSnapshotForPad(padId) {
  const slot = this.motionXYPadSlotById(padId);
  if (!slot) return null;
  return {
    padId,
    xAxis: slot.xAxis,
    yAxis: slot.yAxis,
    x: this.motionAxisTargetValue(slot.xAxis),
    y: this.motionAxisTargetValue(slot.yAxis),
  };
},
commitMotionPadDrag(padId) {
  const start = this.xyPad.dragStartValues;
  if (!start) return;
  const slot = this.motionXYPadSlotById(padId);
  if (slot && start.xAxis && start.yAxis) {
    const endX = this.motionAxisTargetValue(slot.xAxis);
    const endY = this.motionAxisTargetValue(slot.yAxis);
    if (start.x !== endX) {
      const liveKey = this.motionAxisToLiveKey(slot.xAxis);
      if (liveKey) this.applyMotionParamWithSmoothness(liveKey, endX);
    }
    if (start.y !== endY) {
      const liveKey = this.motionAxisToLiveKey(slot.yAxis);
      if (liveKey) this.applyMotionParamWithSmoothness(liveKey, endY);
    }
    return;
  }
  if (padId === 'look' || padId === 'move') {
    const end = this.captureMotionPadSnapshot();
    if (padId === 'look') {
      if (start.look_x !== end.look_x) this.applyMotionParamWithSmoothness('angle_2d', end.look_x);
      if (start.look_y !== end.look_y) this.applyMotionParamWithSmoothness('zoom_2d', end.look_y);
      return;
    }
    if (start.translation_x !== end.translation_x) {
      this.applyMotionParamWithSmoothness('translation_x', end.translation_x);
    }
    if (start.translation_y !== end.translation_y) {
      this.applyMotionParamWithSmoothness('translation_y', end.translation_y);
    }
  }
},
resetMotionToDefault() {
  this.motionSelectedPreset = 'Static';
  this.motionPadValues.translation_x = 0;
  this.motionPadValues.translation_y = 0;
  this.motionPadValues.translation_z = 0;
  this.motionPadValues.zoom = 1;
  this.motionPadValues.rotation_z = 0;
  this.motionPadValues.look_x = 0;
  this.motionPadValues.look_y = 0;
  const pan = this.liveHudParamByKey('panx');
  const pany = this.liveHudParamByKey('pany');
  if (pan) pan.val = 0;
  if (pany) pany.val = 0;
  const payload = this.isDeforumMotion2d
    ? {
        translation_x: 0,
        translation_y: 0,
        angle_2d: 0,
        zoom_2d: 0,
      }
    : {
        translation_x: 0,
        translation_y: 0,
        translation_z: 0,
        zoom_2d: 0,
        rotation_z: 0,
        rotation_y: 0,
      };
  this.sendControl('liveParam', payload);
  if (!this.deforumPlaying) this.schedulePreviewFrame();
},
resetMotionToDefault() {
  this.motionSelectedPreset = 'Static';
  this.motionPadValues.translation_x = 0;
  this.motionPadValues.translation_y = 0;
  this.motionPadValues.translation_z = 0;
  this.motionPadValues.zoom = 1;
  this.motionPadValues.rotation_z = 0;
  this.motionPadValues.look_x = 0;
  this.motionPadValues.look_y = 0;
  const pan = this.liveHudParamByKey('panx');
  const pany = this.liveHudParamByKey('pany');
  if (pan) pan.val = 0;
  if (pany) pany.val = 0;
  const payload = this.isDeforumMotion2d
    ? {
        translation_x: 0,
        translation_y: 0,
        angle_2d: 0,
        zoom_2d: 0,
      }
    : {
        translation_x: 0,
        translation_y: 0,
        translation_z: 0,
        zoom_2d: 0,
        rotation_z: 0,
        rotation_y: 0,
      };
  this.sendControl('liveParam', payload);
  if (!this.deforumPlaying) this.schedulePreviewFrame();
},
emitMotionLiveParam(key, val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return;
  const now = this.getNow();
  const last = this.lastParamSent[key] || 0;
  this.liveParamPending[key] = num;
  if (now - last > this.controlDelayMs) {
    this.lastParamSent[key] = now;
    this.sendControl("liveParam", { [key]: num });
    return;
  }
  clearTimeout(this.liveParamTimers[key]);
  this.liveParamTimers[key] = setTimeout(() => {
    const v = this.liveParamPending[key];
    delete this.liveParamPending[key];
    this.lastParamSent[key] = this.getNow();
    this.sendControl("liveParam", { [key]: v });
  }, this.controlDelayMs);
},
 sendPreset(name) {
   const preset = this.motionPresets[name];
   if (!preset) return;
   this.sendControl("liveParam", preset);
   this.syncMotionPadFromPayload(preset);
   console.log(`Applied motion preset: ${name}`, preset);
 },
 resetVibeParams() {
   const defaults = { cfg: 6.0, strength: 0.65, noise: 1.0, cfgscale: 5.0 };
   this.liveVibe.forEach((p) => {
     if (defaults[p.key] !== undefined) {
       p.val = defaults[p.key];
       this.queueLiveParam(p.key, defaults[p.key]);
     }
   });
 },
 resetCameraParams() {
   const defaults = { zoom: 0.8, panx: 0, pany: 0, tilt: 0 };
   this.liveCam.forEach((p) => {
     if (defaults[p.key] !== undefined) {
       p.val = defaults[p.key];
       this.queueLiveParam(p.key, defaults[p.key]);
     }
   });
   this.sendControl("liveParam", this.motionPresets.Static);
 },
 isKeyboardEditableTarget(target) {
   if (!target || typeof target !== 'object') return false;
   if (target.isContentEditable) return true;
   const tag = String(target.tagName || '').toUpperCase();
   return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
 },
 handleKeyboardEscape() {
   if (this.bindingLearnMode) {
     this.bindingLearnMode = false;
     this.bindingTargetKey = null;
     return true;
   }
   if (this.restoreSessionPromptOpen) {
     this.dismissSessionRestore(false);
     return true;
   }
   if (this.modulationMapPicker && this.modulationMapPicker.paramKey) {
     this.closeModulationMapPicker();
     return true;
   }
   if (this.engineModelPickerOpen) {
     this.closeEngineModelPicker();
     return true;
   }
   if (this.gpuPool && this.gpuPool.forgeModal && this.gpuPool.forgeModal.open) {
     this.closeGpuForgeModal();
     return true;
   }
   if (this.systemFiles.fullscreenIndex >= 0) {
     this.closeSystemFileFullscreen();
     return true;
   }
   if (this.libraryWorkspaceOpen) {
     if (typeof document !== 'undefined') {
       const libraryVideoModal = document.querySelector(
         '[data-testid="projects-fullscreen"], [data-testid="videos-fullscreen"]',
       );
       if (libraryVideoModal) return false;
     }
     this.closeLibraryWorkspace();
     return true;
   }
   if (this.loraPickerOpen) {
     this.loraPickerOpen = false;
     return true;
   }
   if (this.loraCrossfaderPickerGroup) {
     this.loraCrossfaderPickerGroup = null;
     return true;
   }
   if (this.systemFiles.cloudConnectOpen) {
     this.systemFiles.cloudConnectOpen = false;
     return true;
   }
   if (this.systemFiles.newFolderOpen) {
     this.systemFiles.newFolderOpen = false;
     return true;
   }
   if (this.videoLayerAddOpen) {
     this.toggleVideoLayerAdd(false);
     return true;
   }
   if (this.motionSequencerSideOpen) {
     this.motionSequencerSideOpen = false;
     this.saveSessionState();
     return true;
   }
   if (this.showEngineDrawerShell && this.liveEngineDrawerOpen) {
     this.liveEngineDrawerOpen = false;
     this.saveSessionState();
     this.$nextTick(() => this.updateSidePanelDockBounds());
     return true;
   }
   if (this.rightPanelOpen) {
     this.rightPanelOpen = false;
     this.saveSessionState();
     return true;
   }
   return false;
 },
 mainTabIds() {
   return (Array.isArray(this.tabs) ? this.tabs : []).map((tab) => tab && tab.id).filter(Boolean);
 },
 navigateMainTab(delta) {
   const ids = this.mainTabIds();
   if (!ids.length || !Number.isFinite(delta)) return;
   const current = this.currentTab === 'AUDIO' ? 'AUDIO' : this.currentTab;
   let idx = ids.indexOf(current);
   if (idx < 0) idx = 0;
   const next = ids[(idx + delta + ids.length) % ids.length];
   this.switchTab(next);
 },
 subTabIdsForCurrentTab() {
   if (this.currentTab === 'PROMPTS') {
     return ['PROMPTS', 'STYLES', 'IMAGE', 'LORA', 'CONTROLNET', 'STORY'];
   }
   if (this.currentTab === 'SETTINGS') {
     return ['ENGINE', 'OUTPUT', 'GPUS', 'RUNS', 'MIDI', 'STYLES', 'PLUGINS', 'COLLAB'];
   }
   if (this.currentTab === 'MODULATION' || this.currentTab === 'AUDIO') {
     return ['LFO', 'AV_SYNC', 'AUDIO_REACTIVE', 'BEAT_MACROS', 'MAPPINGS'];
   }
   if (this.currentTab === 'LIVE') {
     return ['MONITOR', 'DEFORUM_JOB'];
   }
   return [];
 },
 navigateSubTab(delta) {
   const subs = this.subTabIdsForCurrentTab();
   if (subs.length < 2 || !Number.isFinite(delta)) return;
   const onAudio = this.currentTab === 'AUDIO';
   const parentTab = onAudio ? 'MODULATION' : this.currentTab;
   let current = onAudio ? 'AUDIO_REACTIVE' : this.currentSubTab[parentTab];
   if (parentTab === 'SETTINGS' && current === 'SYSTEM') current = 'RUNS';
   let idx = subs.indexOf(current);
   if (idx < 0) idx = 0;
   const next = subs[(idx + delta + subs.length) % subs.length];
   if (next === 'AUDIO_REACTIVE') {
     this.switchTab('AUDIO');
     return;
   }
   if (onAudio || parentTab === 'MODULATION') {
     if (this.currentTab === 'AUDIO') this.switchTab('MODULATION');
     this.switchSubTab('MODULATION', next);
     return;
   }
   this.switchSubTab(parentTab, next);
 },
  setupKeyboardShortcuts() {
    if (typeof document === "undefined") return;
    const self = this;
    this._keyHandler = (e) => {
      if (e.key === 'Escape') {
        if (self.handleKeyboardEscape()) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if (self.isKeyboardEditableTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (self.bindingLearnMode && self.bindingTargetKey) {
        const key = e.key.toLowerCase();
        if (key.length === 1 || ["arrowup", "arrowdown", "arrowleft", "arrowright", "space", "enter", "tab"].includes(key)) {
          self.keyBindings[self.bindingTargetKey] = key;
          self.saveBindings();
          self.status = `Bound "${self.bindingTargetKey}" → ${key}`;
          self.bindingTargetKey = null;
          e.preventDefault();
          return;
        }
      }
      const boundKey = Object.entries(self.keyBindings).find(([, v]) => v === e.key.toLowerCase());
      if (boundKey) {
        const [paramKey] = boundKey;
        const target = self.modulationTargetByKey(paramKey);
        if (target) {
          const current = self.getParamValue(paramKey);
          const step = (target.max - target.min) * 0.05;
          const next = Math.min(target.max, Math.max(target.min, current + step));
          if (target.field) {
            self.applyAnimationModulation(target.field, next);
          } else {
            self.queueLiveParam(paramKey, next);
          }
          e.preventDefault();
          return;
        }
      }
      if (e.key === 'ArrowLeft') {
        self.navigateMainTab(-1);
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowRight') {
        self.navigateMainTab(1);
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowUp') {
        self.navigateSubTab(-1);
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowDown') {
        self.navigateSubTab(1);
        e.preventDefault();
        return;
      }
      const tabNum = parseInt(e.key, 10);
      const tabIds = self.mainTabIds();
      if (tabNum >= 1 && tabNum <= tabIds.length) {
        self.switchTab(tabIds[tabNum - 1]);
        e.preventDefault();
        return;
      }
      switch (e.key) {
        case ' ':
          if (self.currentTab === 'LIVE') {
            self.generatePreviewFrame();
            e.preventDefault();
          } else if (self.showMotionSequencerDock) {
            self.generatePreviewFrame();
            e.preventDefault();
          }
          break;
        case 'r':
          if (self.currentTab === 'LIVE') {
            self.resetVibeParams();
            self.resetCameraParams();
            e.preventDefault();
          }
          break;
        case 'm':
          if (self.currentTab === 'PROMPTS') {
            self.prompts.morphOn = !self.prompts.morphOn;
            self.setMorph(self.prompts.morphOn);
            e.preventDefault();
          }
          break;
        case 'l':
          if (self.currentTab === 'MODULATION') {
            self.lfoOn = !self.lfoOn;
            e.preventDefault();
          }
          break;
        case 'b':
          if (self.currentTab === 'MODULATION') {
            self.switchSubTab('MODULATION', 'BEAT_MACROS');
            self.beatMacroOn = !self.beatMacroOn;
            e.preventDefault();
          }
          break;
        case 'e':
          if (self.showEngineDrawerShell) {
            self.toggleEngineDrawer();
            e.preventDefault();
          }
          break;
        case 'p':
          if (!self.libraryWorkspaceOpen) {
            self.toggleRightPanel();
            e.preventDefault();
          }
          break;
      }
    };
    document.addEventListener("keydown", this._keyHandler);
  },
 midiTarget(key) {
   const k = String(key || "");
   const m = k.match(/^mod_slot_(\d)$/);
   if (m) {
     const idx = Math.max(1, Math.min(6, Number(m[1]) || 1));
     const slots = Array.isArray(this.liveModulationSlots) ? this.liveModulationSlots : [];
     const slot = slots[idx - 1];
     if (!slot) return null;
     if (slot.kind === 'xypad') return null; // XY handled separately
     if (!slot.paramKey) return null;
     return this.modulationTargetByKey(slot.paramKey);
   }
   return this.modulationTargetByKey(k);
 },
 setMorph(on) {
   this.prompts.morphOn = on;
   this.sendControl("prompts", { morphOn: on });
   if (on) {
     this.applyPromptMorphing();
   }
 },
 parseMorphRange(range) {
   const m = String(range || "0–1").match(/([0-9.]+)\s*[–\-]\s*([0-9.]+)/);
   if (!m) return { min: 0, max: 1 };
   const min = Math.min(parseFloat(m[1]), parseFloat(m[2]));
   const max = Math.max(parseFloat(m[1]), parseFloat(m[2]));
   return { min, max };
 },
 morphSlotInRange(slot) {
   const { min, max } = this.parseMorphRange(slot.range);
   const t = this.prompts.morphBlend ?? 0.5;
   return t >= min && t <= max;
 },
 morphBlendInSlotRange(slot) {
   const { min, max } = this.parseMorphRange(slot.range);
   const t = this.prompts.morphBlend ?? 0.5;
   if (max <= min) return t;
   return Math.max(0, Math.min(1, (t - min) / (max - min)));
 },
 morphSlotPreview(slot) {
   if (!slot.on || !this.morphSlotInRange(slot)) return "—";
   const phrase = morphSlotValue(
     { type: "prompt", valueA: slot.a, valueB: slot.b },
     this.morphBlendInSlotRange(slot)
   );
   if (!phrase) return "—";
   const w = slot.weight != null ? slot.weight : 1;
   return w < 0.99 ? `${phrase} ×${w.toFixed(2)}` : phrase;
 },
 onPromptMorphBlendInput() {
  this.applyPromptMorphBlend(this.prompts.morphBlend, { commitBase: true });
 },
 onMorphSlotWeightInput(_slot) {
   this.applyPromptMorphing();
   if (!this.deforumPlaying) this.schedulePreviewFrame();
 },
onMorphSlotPhraseInput(_slot) {
  this.applyPromptMorphing();
  if (!this.deforumPlaying) this.schedulePreviewFrame();
},
applyPromptMorphBlend(value, { commitBase = false, fromModulation = false } = {}) {
  const next = this.clampVal(Number(value) || 0, 0, 1);
  this.prompts.morphBlend = next;
  if (commitBase || !fromModulation) {
    this.prompts.morphBlendLfoBase = next;
  }
  this.applyPromptMorphing();
  if (!fromModulation && !this.deforumPlaying) {
    this.schedulePreviewFrame();
  }
},
setPromptMorphBlendLfoLink(lfoId) {
  const nextId = Number(lfoId || 0);
  const allowed = nextId >= 1 && nextId <= 4 ? nextId : null;
  this.prompts.morphBlendLfoLink = this.prompts.morphBlendLfoLink === allowed ? null : allowed;
  this.prompts.morphBlendLfoBase = this.prompts.morphBlend;
  if (this.prompts.morphBlendLfoLink) {
    const linked = this.lfos.find((lfo) => lfo.id === this.prompts.morphBlendLfoLink);
    if (linked) linked.on = true;
  }
},
setLoraCrossfaderOn(on) {
  this.prompts.loraCrossfaderOn = !!on;
  this.sendControl("prompts", { loraCrossfaderOn: this.prompts.loraCrossfaderOn });
  if (this.loras.groupA.length || this.loras.groupB.length) {
    this.applyLoras();
  }
  this.saveSessionState();
},
applyLoraCrossfader(value, { commitBase = false, fromModulation = false } = {}) {
  const next = this.clampVal(Number(value) || 0, 0, 1);
  this.prompts.crossfaderValue = next;
  this.performance.crossfader = next;
  if (commitBase || !fromModulation) {
    this.prompts.loraCrossfaderLfoBase = next;
  }
  if (!this.prompts.loraCrossfaderOn) {
    if (!fromModulation) {
      this.saveSessionState();
    }
    return;
  }
  if (this.performance.slots.length) {
    this.applyCrossfadeMorph();
  } else if (this.loras.groupA.length || this.loras.groupB.length) {
    this.applyLoras();
  }
  if (!fromModulation) {
    this.saveSessionState();
  }
},
setLoraCrossfaderLfoLink(lfoId) {
  const nextId = Number(lfoId || 0);
  const allowed = nextId >= 1 && nextId <= 6 ? nextId : null;
  this.prompts.loraCrossfaderLfoLink = this.prompts.loraCrossfaderLfoLink === allowed ? null : allowed;
  this.prompts.loraCrossfaderLfoBase = this.performance.crossfader;
  if (this.prompts.loraCrossfaderLfoLink) {
    const linked = this.lfos.find((lfo) => lfo.id === this.prompts.loraCrossfaderLfoLink);
    if (linked) linked.on = true;
  }
},
toggleLoraFamilyCollapse(familyKey) {
  if (!familyKey || !this.loras.familyCollapsed || !(familyKey in this.loras.familyCollapsed)) return;
  this.loras.familyCollapsed[familyKey] = !this.loras.familyCollapsed[familyKey];
},
 applyPromptMorphing() {
   if (!this.prompts.morphOn) return;
   const base = (this.prompts.pos || "").trim();
   const parts = base ? [base] : [];
   for (const slot of this.morphSlots) {
     if (!slot.on || !this.morphSlotInRange(slot)) continue;
     const phrase = morphSlotValue(
       { type: "prompt", valueA: slot.a, valueB: slot.b },
       this.morphBlendInSlotRange(slot)
     );
     if (!phrase) continue;
     const w = Math.max(0, Math.min(1, slot.weight != null ? slot.weight : 1));
     if (w >= 0.99) parts.push(phrase);
     else parts.push(`(${phrase}:${w.toFixed(2)})`);
   }
   const morphedPrompt = parts.join(", ").trim();
   if (!morphedPrompt) return;
   this.prompts.pos = morphedPrompt;
   this.sendControl("prompt", {
     positive: morphedPrompt,
     negative: this.prompts.neg,
     morphBlend: this.prompts.morphBlend,
   });
 },
 sendPrompts() {
   this.sendControl("prompt", { positive: this.prompts.pos, negative: this.prompts.neg });
   if (this.prompts.morphOn) {
     this.applyPromptMorphing();
   }
 },
 addMacro() {
   if (this.macrosRack.length >= 6) return;
   const id = `macro-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
   this.macrosRack.push({ id, on: true, target: "cfg", shape: "Sine", bpm: 120, depth: 0.5, offset: 0.0, show: false });
 },
 removeMacro(index) {
   if (this.macrosRack.length <= 1) return;
   this.macrosRack.splice(index, 1);
 },
 addAudioMapping() {
   this.audioMappings.push({ param: "", band: "mid", freq_min: 250, freq_max: 2000, out_min: 0, out_max: 1 });
   this.audioMappingLevels.push(0);
 },
 setAudioActiveBandTab(tabKey) {
   const allowed = this.audioBandTabDefs.map((tab) => tab.key);
   if (!allowed.includes(tabKey)) return;
   this.audioActiveBandTab = tabKey;
 },
 onAudioSpectrumSelectBand(index) {
   const i = Number(index) || 0;
   this.audioSelectedMappingIndex = i;
   const tab = this.audioBandTabDefs[i];
   if (tab) this.setAudioActiveBandTab(tab.key);
 },
 updateAudioMappingBand({ index, freq_min, freq_max }) {
   const row = this.audioMappings[index];
   if (!row) return;
   row.freq_min = freq_min;
   row.freq_max = freq_max;
   if (this.audioBandPreviewIndex === index) this.updateAudioBandpassFilter(row);
 },
 removeAudioMapping(index) {
   if (this.audioBandPreviewIndex === index) this.stopAudioBandPreview();
   else if (this.audioBandPreviewIndex > index) this.audioBandPreviewIndex -= 1;
   this.audioMappings.splice(index, 1);
   this.audioMappingLevels.splice(index, 1);
   if (this.audioSelectedMappingIndex >= this.audioMappings.length) {
     this.audioSelectedMappingIndex = Math.max(0, this.audioMappings.length - 1);
   }
 },
 applyAudioBandPreset(mapIndex, bandKey) {
   const spec = this.audioBandPresets[bandKey];
   const row = this.audioMappings[mapIndex];
   if (!spec || !row) return;
   row.freq_min = spec.freq_min;
   row.freq_max = spec.freq_max;
   if (this.audioBandPreviewIndex === mapIndex) this.updateAudioBandpassFilter(row);
 },
 toggleAudioBandPreview(mapIndex) {
   if (!this.audio.objectUrl) {
     this.audioStatus = 'Upload audio first';
     return;
   }
   const idx = Number(mapIndex);
   if (!Number.isFinite(idx) || idx < 0) return;
   if (this.audioBandPreviewIndex === idx) {
     this.stopAudioBandPreview();
     this.audioStatus = 'Band preview off';
     return;
   }
   if (!this._liveSpecAnalyser) {
     try { this.setupLiveAudioAnalyser(); } catch (_e) { /* ignore */ }
   }
   void this.playAvSyncAudioForVisualizer();
   this.audioBandPreviewIndex = idx;
   const mapping = this.audioMappings[idx];
   if (mapping) this.updateAudioBandpassFilter(mapping);
   this.syncAudioBandPreviewGains();
   if (mapping) {
     this.audioStatus = `Previewing ${mapping.freq_min}–${mapping.freq_max} Hz`;
   }
 },
 stopAudioBandPreview() {
   this.audioBandPreviewIndex = -1;
   this.syncAudioBandPreviewGains();
 },
 updateAudioBandpassFilter(mapping) {
   const filter = this._liveSpecBandpass;
   if (!filter || !mapping) return;
   const fMin = Math.max(20, Number(mapping.freq_min) || 20);
   const fMax = Math.min(20000, Math.max(fMin + 1, Number(mapping.freq_max) || fMin + 100));
   const fc = Math.sqrt(fMin * fMax);
   const bw = Math.max(1, fMax - fMin);
   filter.type = 'bandpass';
   filter.frequency.value = fc;
   filter.Q.value = Math.max(0.1, Math.min(20, fc / bw));
 },
 syncAudioBandPreviewGains() {
   const previewOn = this.audioBandPreviewIndex >= 0;
   if (this._liveSpecGain) this._liveSpecGain.gain.value = previewOn ? 0 : 1;
   if (this._liveSpecSoloGain) this._liveSpecSoloGain.gain.value = previewOn ? 1 : 0;
 },
readImg2imgAsset(file, { mask = false } = {}) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (mask) {
      this.img2img.maskDataUrl = reader.result;
      this.img2img.status = "Mask loaded (inpaint)";
      return;
    }
    this.img2img.dataUrl = reader.result;
    this.applyInitImageFromUpload(reader.result);
    this.img2img.status = "Input image loaded — set as Deforum init";
  };
  reader.onerror = () => {
    this.img2img.status = mask ? "Could not read mask file" : "Could not read input image";
  };
  reader.readAsDataURL(file);
},
applyInitImageFromUpload(dataUrl) {
  if (!dataUrl) return;
  this.applyDeforumInitFromDataUrl(dataUrl);
  this.syncImg2imgDimensionsFromDataUrl(dataUrl);
  if (this.isWanLayerActive) {
    this.applyWanInitImageDataUrl(dataUrl);
  } else if (this.isSvdLayerActive) {
    this.syncSvdInitResolutionFromDataUrl(dataUrl);
    this.svdEngine = normalizeSvdEngine({ ...this.svdEngine, svd_init_image: dataUrl });
    this.svdStatus = 'Init image linked from upload';
    this.saveSessionState();
  }
},
applyDeforumInitFromDataUrl(dataUrl) {
  if (!dataUrl || !this.deforumSettings) return;
  const strength = Number(this.deforumSettings.strength);
  this.deforumSettings = {
    ...this.deforumSettings,
    init_image: dataUrl,
    use_init: true,
    strength: Number.isFinite(strength) && strength > 0 ? strength : 0.65,
  };
  this.syncDeforumSettingsJson();
  this.saveSessionState();
  this.queueDeforumSettingsSave();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
},
syncImg2imgDimensionsFromDataUrl(dataUrl) {
  if (!dataUrl || typeof Image === 'undefined') return;
  const img = new Image();
  img.onload = () => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return;
    this.img2img.width = w;
    this.img2img.height = h;
    if (!this.isSvdLayerActive) {
      this.syncResolutionAcrossControls(w, h, { syncGpuModal: true });
    }
  };
  img.src = dataUrl;
},
handleImg2imgFile(evt) {
  const f = evt.target.files && evt.target.files[0];
  this.readImg2imgAsset(f);
  if (evt.target) evt.target.value = '';
},
handleImg2imgMask(evt) {
  const f = evt.target.files && evt.target.files[0];
  this.readImg2imgAsset(f, { mask: true });
},
handleImg2imgDrop(evt, kind = 'input') {
  const files = evt && evt.dataTransfer && evt.dataTransfer.files;
  const file = files && files[0];
  if (!file) return;
  this.readImg2imgAsset(file, { mask: kind === 'mask' });
},
clearImg2imgInput() {
  const prev = this.img2img.dataUrl;
  this.img2img.dataUrl = null;
  if (prev && this.deforumSettings && this.deforumSettings.init_image === prev) {
    this.deforumSettings = {
      ...this.deforumSettings,
      init_image: null,
      use_init: false,
    };
    this.syncDeforumSettingsJson();
    this.saveSessionState();
    this.queueDeforumSettingsSave();
  }
  this.img2img.status = "Input image cleared";
},
 clearImg2imgMask() {
   this.img2img.maskDataUrl = null;
   this.img2img.status = "Mask cleared";
 },
 async refreshPlugins() {
   if (typeof fetch !== "function") return;
  this.pluginsLoading = true;
   try {
     const res = await fetch("/api/plugins");
     if (!res.ok) return;
     const j = await res.json();
     this.pluginsRegistry = Array.isArray(j.plugins) ? j.plugins : [];
   } catch (_) {
     this.pluginsRegistry = [];
  } finally {
    this.pluginsLoading = false;
   }
 },
 async submitImg2img() {
   if (!this.img2img.dataUrl) {
    this.img2img.status = "Choose an input image first";
     return;
   }
  this.img2img.loading = true;
   this.img2img.status = "Submitting…";
   try {
     const body = {
       init_image: this.img2img.dataUrl,
       prompt: this.prompts.pos,
       negative_prompt: this.prompts.neg,
       denoising_strength: this.img2img.denoisingStrength,
       width: this.img2img.width,
       height: this.img2img.height,
     };
     if (this.img2img.maskDataUrl) {
       body.mask_image = this.img2img.maskDataUrl;
       body.mask_blur = this.img2img.maskBlur;
       body.inpainting_fill = this.img2img.inpaintingFill;
       body.inpaint_full_res = this.img2img.inpaintFullRes;
     }
     const res = await fetch("/api/img2img", {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify(body),
     });
     const j = await res.json();
     if (!res.ok) throw new Error(j.error || j.detail || res.statusText);
     this.img2img.lastPath = j.path || null;
     this.img2img.status = j.path ? `OK → ${j.path}` : "OK";
   } catch (e) {
     this.img2img.status = String(e.message || e);
  } finally {
    this.img2img.loading = false;
   }
 },
runImg2img() {
  return this.submitImg2img();
},
 addLfo() {
   const nextId = this.lfos.length ? Math.max(...this.lfos.map((l) => l.id)) + 1 : 1;
   this.lfos.push({
     id: nextId,
     on: true,
     targets: [],
     shape: "Sine",
     bpm: this.lfoBpm || 120,
     speed: 1.0,
     depth: 0.2,
     base: null,
     phase: 0,
    renderPhase: 0,
   });
 },
 removeLfo(index) {
   if (this.lfos.length <= 1) return;
   this.lfos.splice(index, 1);
 },
 resetLfo(index) {
   const lfo = this.lfos[index];
   if (!lfo) return;
   lfo.targets = [];
   lfo.shape = "Sine";
   lfo.bpm = this.lfoBpm || 120;
   lfo.speed = 1.0;
   lfo.depth = 0.2;
   lfo.base = null;
   lfo.phase = 0;
  lfo.renderPhase = 0;
   lfo.on = false;
 },
resetLfos() {
  this.lfos.forEach((_, index) => this.resetLfo(index));
},
toggleLfoTarget(lfo, targetKey) {
  if (!lfo || !targetKey) return;
  const idx = lfo.targets.indexOf(targetKey);
  if (idx >= 0) {
    lfo.targets.splice(idx, 1);
  } else {
    lfo.targets.push(targetKey);
    if (lfo.base == null) {
      const target = this.modulationTargetByKey(targetKey);
      if (target) lfo.base = target.default ?? (target.min + target.max) / 2;
    }
  }
  this.modulationSelectedLfoId = lfo.id;
},
 addLfoTarget(lfoIdx) {
   const pick = this.lfoTargetPick[lfoIdx];
   if (!pick) return;
   const lfo = this.lfos[lfoIdx];
   if (!lfo || lfo.targets.includes(pick)) {
     this.$set ? this.$set(this.lfoTargetPick, lfoIdx, "") : (this.lfoTargetPick[lfoIdx] = "");
     return;
   }
   lfo.targets.push(pick);
   if (lfo.base === null) {
     const target = this.modulationTargetByKey(pick);
     if (target) lfo.base = target.default ?? (target.min + target.max) / 2;
   }
   this.lfoTargetPick[lfoIdx] = "";
 },
 removeLfoTarget(lfoIdx, targetIdx) {
   const lfo = this.lfos[lfoIdx];
   if (!lfo) return;
   lfo.targets.splice(targetIdx, 1);
 },
 saveCurrentMotionStyle() {
   const name = prompt("Enter style name:");
   if (!name || !name.trim()) return;
   const style = {
     translation_x: Number(this.motionPadValues.translation_x || 0),
     translation_y: Number(this.motionPadValues.translation_y || 0),
     translation_z: Number(this.motionPadValues.translation_z || 0),
     zoom_2d: Number(this.motionPadValues.zoom ?? 1),
     rotation_z: 0,
     rotation_y: 0,
   };
   const trimmed = name.trim();
   this.motionStylesSaved[trimmed] = style;
   this.motionSelectedPreset = trimmed;
   try {
     if (typeof window !== 'undefined' && window.localStorage) {
       window.localStorage.setItem('defora_motion_styles', JSON.stringify(this.motionStylesSaved));
     }
   } catch(_e) {}
 },
 loadMotionStyles() {
   try {
     if (typeof window !== 'undefined' && window.localStorage) {
       const saved = window.localStorage.getItem('defora_motion_styles');
       if (saved) {
         const parsed = JSON.parse(saved);
         if (parsed && typeof parsed === 'object') {
           this.motionStylesSaved = parsed;
         }
       }
     }
   } catch(_e) {}
 },
 deleteSavedMotionStyle(name) {
   if (!confirm(`Delete saved style "${name}"?`)) return;
   delete this.motionStylesSaved[name];
   try {
     if (typeof window !== 'undefined' && window.localStorage) {
       window.localStorage.setItem('defora_motion_styles', JSON.stringify(this.motionStylesSaved));
     }
   } catch(_e) {}
 },
 applySavedMotionStyle(name) {
   const style = this.motionStylesSaved[name];
   if (!style) return;
   this.motionSelectedPreset = name;
   this.sendControl("liveParam", style);
   this.syncMotionPadFromPayload(style);
 },
 applyMotionPreset(name) {
   const preset = this.motionPresets[name];
   if (!preset) return;
   this.sendControl("liveParam", preset);
  this.syncMotionPadFromPayload(preset);
 },
 queueLiveParam(key, val) {
   const meta = this.paramControlMeta(key);
   const v = this.clampParamToMeta(val, meta);
   const routeKey = meta.routeKey || key;
   const anim = this.animationTargets.find((t) => t.key === routeKey || t.key === key);
   if (anim && anim.field) {
     this.applyAnimationModulation(anim.field, v);
     return;
   }
   if (meta.hud) {
     meta.hud.val = v;
     this.syncHudMotionFromParam(meta.hud.key, v);
   }
   const now = this.getNow();
   const last = this.lastParamSent[routeKey] || 0;
   this.liveParamPending[routeKey] = v;
   const flush = () => {
     const pending = this.liveParamPending[routeKey];
     delete this.liveParamPending[routeKey];
     this.lastParamSent[routeKey] = this.getNow();
     this.sendControl("liveParam", { [routeKey]: pending });
   };
   if (now - last > this.controlDelayMs) {
     flush();
     return;
   }
   clearTimeout(this.liveParamTimers[routeKey]);
   this.liveParamTimers[routeKey] = setTimeout(flush, this.controlDelayMs);
 },
 async refreshFrames() {
   if (typeof fetch !== "function") return;
   try {
   const previousCount = this.frameStripThumbs.length;
   const previousSelectedSrc = this.frameSrcKey(this.selectedFrameThumb ? (this.selectedFrameThumb.src || this.selectedFrameThumb.url || this.selectedFrameThumb.path || '') : '');
    const res = await fetch("/api/frames?limit=48", { cache: "no-store" });
     if (!res.ok) {
      this.framesRefreshBackoffMs = this.nextFramesPollDelay({ failed: true });
       return;
     }
     const json = await res.json();
     if (Array.isArray(json.items)) {
      const merged = this.mergeFrameThumbs(json.items, { keepCachedOnEmpty: true });
      this.thumbs = merged.length ? merged : this.thumbs;
      this.saveCachedFrameThumbs(this.thumbs);
      if (this.frameStripThumbs.length > previousCount) {
        this.applyNewGeneratedFrames(previousCount);
      } else {
        this.updateFrameSelection(previousSelectedSrc);
      }
     }
    this.framesRefreshBackoffMs = this.nextFramesPollDelay();
    this.syncDeforumBackdropToWebGL();
   } catch (e) {
     console.warn("frames fetch failed", e);
    this.framesRefreshBackoffMs = this.nextFramesPollDelay({ failed: true });
   }
 },
 parseFrameNumber(name) {
   if (!name) return null;
   const match = String(name).match(/(\d{3,})/);
   return match ? parseInt(match.pop(), 10) : null;
 },
 async runAudioMod() {
   if (!this.audio.track) {
     this.audioStatus = "Set audio file first";
     return;
   }
   const mappings = this.audioMappings
     .filter((m) => m.param && !Number.isNaN(m.freq_min) && !Number.isNaN(m.freq_max))
     .map((m) => ({
       param: m.param,
       freq_min: m.freq_min,
       freq_max: m.freq_max,
       out_min: m.out_min ?? 0,
       out_max: m.out_max ?? 1,
     }));
   if (!mappings.length) {
     this.audioStatus = "Add at least one mapping";
     return;
   }
   try {
     const res = await fetch("/api/audio-map", {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({
         audioPath: this.audio.track,
         fps: this.masterFps,
         mappings,
         live: true,
       }),
     });
     const json = await res.json();
     if (!res.ok || json.error) {
       this.audioStatus = json.error || "Audio processing failed";
     } else {
       this.audioStatus = json.ok ? "Audio sent to mediator" : "Audio processing finished with errors";
     }
   } catch (err) {
     this.audioStatus = String(err);
   }
 },
startAudioStream() {
  return this.runAudioMod();
},
 frameLabel(t) {
   if (!t) return "?";
   if (t.frame != null && !isNaN(t.frame)) return t.frame;
   if (t.name) return t.name.replace(/\.[^.]+$/, "");
   return t.src || "?";
 },
 scrollSelectedFrameIntoView(index = this.selectedFrameIndex) {
  if (typeof window === "undefined") return;
  const rail = (this.$refs && this.$refs.frameRail)
    || (typeof document !== "undefined" && document.querySelector('[data-testid="runs-browser-frames-rail"]'));
  if (!rail || typeof rail.querySelector !== "function") return;
  const item = rail.querySelector(`[data-frame-index="${index}"]`);
  if (item && typeof item.scrollIntoView === "function") {
    item.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }
},
selectFrame(index, { scroll = true, userInitiated = false } = {}) {
  if (!this.frameStripThumbs.length) {
    this.selectedFrameIndex = -1;
    return;
  }
  const clamped = Math.min(this.frameStripThumbs.length - 1, Math.max(0, Number(index) || 0));
  if (userInitiated && this.deforumPlaying) {
    this.frameRailFollowLatest = clamped >= this.frameStripThumbs.length - 1;
  }
  this.selectedFrameIndex = clamped;
  const thumb = this.frameStripThumbs[clamped];
  if (thumb) {
    const fps = Math.max(1, Number(this.deforumSettings.fps || this.sequencer?.fps || 24) || 24);
    const firstFrame = Number(this.frameStripThumbs[0] && this.frameStripThumbs[0].frame);
    const currentFrame = Number(thumb.frame);
    if (Number.isFinite(firstFrame) && Number.isFinite(currentFrame)) {
      this.timecode = this.formatPlaybackTime((currentFrame - firstFrame) / fps);
    }
  }
  if (scroll) this.$nextTick(() => this.scrollSelectedFrameIntoView(clamped));
},
stepFrameSelection(direction) {
  if (!this.frameStripThumbs.length) return;
  const current = Number.isFinite(Number(this.selectedFrameIndex))
    ? Number(this.selectedFrameIndex)
    : this.frameStripThumbs.length - 1;
  this.selectFrame(current + Number(direction || 0));
},
frameIndexForTime(seconds) {
  if (!this.frameStripThumbs.length) return -1;
  const fps = Math.max(1, Number(this.deforumSettings.fps || this.sequencer?.fps || 24) || 24);
  const baseFrame = Number(this.frameStripThumbs[0] && this.frameStripThumbs[0].frame);
  if (!Number.isFinite(baseFrame)) return -1;
  const targetFrame = baseFrame + Math.round(Math.max(0, Number(seconds) || 0) * fps);
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  this.frameStripThumbs.forEach((thumb, idx) => {
    const frame = Number(thumb && thumb.frame);
    if (!Number.isFinite(frame)) return;
    const distance = Math.abs(frame - targetFrame);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = idx;
    }
  });
  return bestIndex;
},
syncFrameSelectionFromPlayback(seconds) {
  const index = this.frameIndexForTime(seconds);
  if (index >= 0) this.selectFrame(index, { scroll: false });
},
updateFrameSelection(preferredSrc = '') {
  if (!this.frameStripThumbs.length) {
    this.selectedFrameIndex = -1;
    return;
  }
  if (this.deforumPlaying && this.frameRailFollowLatest) {
    this.followLatestGeneratedFrame();
    return;
  }
  if (preferredSrc) {
    const existingIndex = this.frameStripThumbs.findIndex((thumb) => this.frameSrcKey(thumb.src || thumb.url || thumb.path || '') === this.frameSrcKey(preferredSrc));
    if (existingIndex >= 0) {
      this.selectFrame(existingIndex, { scroll: false });
      return;
    }
  }
  if (this.deforumPlaying && this.playerEl && Number.isFinite(Number(this.playerEl.currentTime))) {
    const playbackIndex = this.frameIndexForTime(this.playerEl.currentTime);
    if (playbackIndex >= 0) {
      this.selectFrame(playbackIndex, { scroll: false });
      return;
    }
  }
  if (this.selectedFrameIndex >= 0 && this.selectedFrameIndex < this.frameStripThumbs.length) return;
  this.selectFrame(this.frameStripThumbs.length - 1, { scroll: false });
},
audioBandWindowStyle(mapping) {
  const minHz = 20;
  const maxHz = 16000;
  const toPct = (value) => {
    const clamped = Math.min(maxHz, Math.max(minHz, Number(value) || minHz));
    const ratio = (Math.log(clamped) - Math.log(minHz)) / (Math.log(maxHz) - Math.log(minHz));
    return Math.min(100, Math.max(0, ratio * 100));
  };
  const left = toPct(mapping && mapping.freq_min);
  const right = toPct(mapping && mapping.freq_max);
  return {
    left: `${Math.min(left, right)}%`,
    width: `${Math.max(1.5, Math.abs(right - left))}%`,
  };
},
 async scanMidi() {
   if (!navigator.requestMIDIAccess) {
     this.midi.supported = false;
     return;
   }
   try {
     const access = await navigator.requestMIDIAccess({ sysex: false });
     const devices = [];
     access.inputs.forEach((input) => {
       devices.push({ id: input.id, name: input.name });
       input.onmidimessage = (msg) => this.handleMidi(input, msg);
     });
     this.midi.devices = devices;
     if (!this.midi.selected && devices.length) this.midi.selected = devices[0].id;
     this.loadMidiMappings();
   } catch (e) {
     this.midiStatus = "MIDI not available";
   }
 },
 loadMidiMappings() {
   const storage = (typeof window !== 'undefined' && window.localStorage) || 
                  (typeof global !== 'undefined' && global.window && global.window.localStorage);
   if (!storage) return;
   try {
     const stored = storage.getItem("defora_midi_mappings");
     if (stored) {
       const mappings = JSON.parse(stored);
       if (Array.isArray(mappings) && mappings.length > 0) {
         this.midi.mappings = mappings;
         console.log("Loaded MIDI mappings from localStorage", mappings);
       }
     }
   } catch (e) {
     console.error("Failed to load MIDI mappings", e);
   }
 },
 saveMidiMappings() {
   const storage = (typeof window !== 'undefined' && window.localStorage) || 
                  (typeof global !== 'undefined' && global.window && global.window.localStorage);
   if (!storage) return false;
   try {
     storage.setItem("defora_midi_mappings", JSON.stringify(this.midi.mappings));
     console.log("Saved MIDI mappings to localStorage", this.midi.mappings);
     return true;
   } catch (e) {
     console.error("Failed to save MIDI mappings", e);
     return false;
   }
 },
 addMidiMapping() {
   this.midi.mappings.push({ control: "New Mapping", cc: 0, key: "" });
   this.saveMidiMappings();
 },
 deleteMidiMapping(index) {
   this.midi.mappings.splice(index, 1);
   this.saveMidiMappings();
 },
 updateMidiMapping(map) {
   this.saveMidiMappings();
   return map;
 },
 loadBindings() {
   try {
     const storage = (typeof window !== 'undefined' && window.localStorage) || null;
     if (!storage) return;
     const saved = storage.getItem("defora_key_bindings");
     if (saved) {
       const parsed = JSON.parse(saved);
       if (parsed && typeof parsed === "object") {
         this.keyBindings = { ...this.keyBindings, ...parsed };
       }
     }
   } catch(_e) {}
 },
 saveBindings() {
   try {
     const storage = (typeof window !== 'undefined' && window.localStorage) || null;
     if (!storage) return;
     storage.setItem("defora_key_bindings", JSON.stringify(this.keyBindings));
   } catch(_e) {}
 },
 toggleBindingLearn() {
   this.bindingLearnMode = !this.bindingLearnMode;
   this.bindingTargetKey = null;
   if (!this.bindingLearnMode) {
     this.status = "Learn mode disabled";
   } else {
     this.status = "Learn mode: press key or move MIDI CC, then click a parameter";
   }
 },
 resetBindings() {
   if (!confirm("Reset all bindings to defaults?")) return;
   this.keyBindings = {
     "translation_z": "w",
     "translation_x": "a",
     "translation_y": "s",
     "rotation_y": "d",
     "rotation_z": "q",
     "fov": "f",
     "cfg": "z",
     "strength": "x",
     "noise_multiplier": "c",
   };
   this.saveBindings();
   this.status = "Bindings reset to defaults";
 },
 getKeyBinding(key) {
   return this.keyBindings[key] || null;
 },
 clearKeyBinding(key) {
   delete this.keyBindings[key];
   this.saveBindings();
 },
 getMidiBinding(key) {
   const m = this.midi.mappings.find(m => m.key === key);
   return m ? m.cc : null;
 },
 clearMidiBinding(key) {
   const idx = this.midi.mappings.findIndex(m => m.key === key);
   if (idx >= 0) {
     this.midi.mappings.splice(idx, 1);
     this.saveMidiMappings();
   }
 },
 getParamValue(key) {
   const routeKey = this.liveParamCanonicalKey(key);
   const hud = this.liveHudParamByKey(key)
     || this.liveHudParamByKey(
       Object.entries(this.liveParamAliases).find(([, route]) => route === key || route === routeKey)?.[0]
     );
   if (hud) return hud.val;
   const anim = this.animationTargets.find((t) => t.key === key || t.key === routeKey);
   if (anim && anim.field && this.defaultAnimation) {
     const val = Number(this.defaultAnimation[anim.field]);
     return Number.isFinite(val) ? val : (anim.default ?? 0);
   }
   if (routeKey === 'translation_x') return Number(this.motionPadValues.translation_x ?? 0);
   if (routeKey === 'translation_y') return Number(this.motionPadValues.translation_y ?? 0);
   if (routeKey === 'translation_z') return Number(this.motionPadValues.translation_z ?? 0);
   if (routeKey === 'zoom_2d') return Number(this.motionPadValues.zoom ?? 1);
   const target = this.modulationTargetByKey(routeKey);
   return target ? (target.default ?? 0) : 0;
 },
 // Preset management methods
 async refreshPresets() {
  this.presetsLoading = true;
   try {
     const { data } = await apiFetch("/api/presets", {}, "presets list");
     this.availablePresets = data.presets || [];
  } catch (_) {
  } finally {
    this.presetsLoading = false;
  }
 },
 async loadPreset(name) {
   try {
     const res = await fetch(`/api/presets/${name}`);
     const data = await res.json();
     if (data.preset) {
       // Apply preset to current state
       if (data.preset.liveVibe) this.liveVibe = data.preset.liveVibe;
       if (data.preset.liveCam) this.liveCam = data.preset.liveCam;
       if (data.preset.audio) Object.assign(this.audio, data.preset.audio);
       if (data.preset.cn) Object.assign(this.cn, data.preset.cn);
       if (data.preset.lfos) this.lfos = data.preset.lfos;
       if (data.preset.macrosRack) this.macrosRack = data.preset.macrosRack;
       if (data.preset.loras) {
        this.loras.common = data.preset.loras.common || [];
         this.loras.groupA = data.preset.loras.groupA || [];
         this.loras.groupB = data.preset.loras.groupB || [];
         // Sync selection state without fetching (data already restored)
         await this.refreshLoras();
       }
       if (data.preset.prompts) {
         Object.assign(this.prompts, data.preset.prompts);
       }
       this.currentPreset = name;
       this.presetStatus = `Loaded preset: ${name}`;
       setTimeout(() => { this.presetStatus = ""; }, 3000);
     }
   } catch (err) {
     console.error("Failed to load preset", err);
     this.presetStatus = `Error loading preset: ${err.message}`;
   }
 },
 async saveCurrentPreset() {
   const name = this.newPresetName || "untitled";
   const preset = {
     liveVibe: this.liveVibe,
     liveCam: this.liveCam,
     audio: { bpm: this.audio.bpm, track: this.audio.track },
     cn: { slots: this.cn.slots, active: this.cn.active },
     loras: {
      common: this.loras.common,
       groupA: this.loras.groupA,
       groupB: this.loras.groupB,
     },
     prompts: {
       pos: this.prompts.pos,
       neg: this.prompts.neg,
       morphOn: this.prompts.morphOn,
       loraCrossfaderOn: this.prompts.loraCrossfaderOn,
       crossfaderValue: this.prompts.crossfaderValue,
       loraCrossfaderLfoLink: this.prompts.loraCrossfaderLfoLink,
       loraCrossfaderLfoBase: this.prompts.loraCrossfaderLfoBase,
       morphBlend: this.prompts.morphBlend,
       morphBlendLfoLink: this.prompts.morphBlendLfoLink,
       morphBlendLfoBase: this.prompts.morphBlendLfoBase,
     },
     lfos: this.lfos,
     macrosRack: this.macrosRack,
     paramSources: this.paramSources,
   };
   try {
     const res = await fetch(`/api/presets/${name}`, {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify(preset),
     });
     const data = await res.json();
     if (data.ok) {
       this.currentPreset = name;
       this.presetStatus = `Saved preset: ${name}`;
       this.newPresetName = "";
       await this.refreshPresets();
       setTimeout(() => { this.presetStatus = ""; }, 3000);
     }
   } catch (err) {
     console.error("Failed to save preset", err);
     this.presetStatus = `Error saving preset: ${err.message}`;
   }
 },
 async deletePreset(name) {
   if (!confirm(`Delete preset "${name}"?`)) return;
   try {
     await fetch(`/api/presets/${name}`, { method: "DELETE" });
     this.currentPreset = null;
     this.presetStatus = `Deleted preset: ${name}`;
     await this.refreshPresets();
     setTimeout(() => { this.presetStatus = ""; }, 3000);
   } catch (err) {
     console.error("Failed to delete preset", err);
     this.presetStatus = `Error deleting preset: ${err.message}`;
   }
 },
 captureEngineSettingsSnapshot() {
   return buildEngineSettingsSnapshot({
     activeVideoLayerId: this.activeVideoLayerId,
     videoLayerOpacity: Object.fromEntries(
       (this.videoLayers || [])
         .filter((layer) => layer && layer.builtin)
         .map((layer) => [layer.id, this.readVideoLayerOpacity(layer)]),
     ),
     videoLayerPreviewVisible: Object.fromEntries(
       (this.videoLayers || [])
         .filter((layer) => layer && layer.builtin)
         .map((layer) => [layer.id, this.isVideoLayerPreviewVisible(layer)]),
     ),
     currentPreset: this.currentPreset,
     defaultAnimation: this.normalizeDefaultAnimationSettings(this.defaultAnimation),
     deforumSettings: this.normalizedDeforumSettings(),
     lcmEngine: this.lcmEngine ? { ...this.lcmEngine } : {},
     wanEngine: normalizeWanEngine(this.wanEngine),
     animateLcmEngine: normalizeAnimateLcmEngine(this.animateLcmEngine),
     svdEngine: normalizeSvdEngine(this.svdEngine),
   });
 },
 applyEngineSettingsSnapshot(snapshot) {
   const snap = normalizeEngineSettingsSlot(snapshot);
   if (!snap) return;
   if (snap.activeVideoLayerId) this.activeVideoLayerId = snap.activeVideoLayerId;
   (this.videoLayers || []).forEach((layer) => {
     if (!layer || !layer.builtin) return;
     if (Object.prototype.hasOwnProperty.call(snap.videoLayerPreviewVisible, layer.id)) {
       layer.previewVisible = snap.videoLayerPreviewVisible[layer.id] !== false;
     }
     if (Object.prototype.hasOwnProperty.call(snap.videoLayerOpacity, layer.id)) {
       this.setVideoLayerOpacity(layer.id, snap.videoLayerOpacity[layer.id]);
     }
   });
   if (snap.defaultAnimation && typeof snap.defaultAnimation === 'object') {
     this.defaultAnimation = this.normalizeDefaultAnimationSettings(snap.defaultAnimation);
   }
   if (snap.deforumSettings && typeof snap.deforumSettings === 'object' && Object.keys(snap.deforumSettings).length) {
     this.deforumSettings = mergeDeforumSettings({ ...DEFORUM_DEFAULT_SETTINGS }, snap.deforumSettings);
     this.deforumSettings = this.normalizedDeforumSettings();
     this.syncResolutionAcrossControls(this.deforumSettings.W, this.deforumSettings.H, { syncGpuModal: false });
     this.syncStepsAcrossControls(this.deforumSettings.steps, { syncGpuModal: false });
     this.syncDeforumSettingsJson();
   }
   if (snap.lcmEngine && typeof snap.lcmEngine === 'object' && Object.keys(snap.lcmEngine).length) {
     this.lcmEngine = {
       enabled: !!snap.lcmEngine.enabled,
       steps: Math.max(1, Math.round(Number(snap.lcmEngine.steps) || DEFAULT_LCM_ENGINE.steps)),
       loraTag: String(snap.lcmEngine.loraTag || DEFAULT_LCM_LORA_TAG).trim() || DEFAULT_LCM_LORA_TAG,
     };
     if (this.lcmEngine.enabled) this.applyLcmEngineToDeforum({ saveSession: false });
   }
   if (snap.wanEngine && typeof snap.wanEngine === 'object' && Object.keys(snap.wanEngine).length) {
     this.wanEngine = normalizeWanEngine(snap.wanEngine);
   }
   if (snap.animateLcmEngine && typeof snap.animateLcmEngine === 'object' && Object.keys(snap.animateLcmEngine).length) {
     this.animateLcmEngine = normalizeAnimateLcmEngine(snap.animateLcmEngine);
   }
   if (snap.svdEngine && typeof snap.svdEngine === 'object' && Object.keys(snap.svdEngine).length) {
     this.svdEngine = normalizeSvdEngine(snap.svdEngine);
   }
   this.currentPreset = snap.currentPreset || null;
   this.onDefaultAnimationInput();
   if (this.deforumPlaying) this.scheduleDeforumPreview();
 },
 onEngineSettingsSlotClick(index, event) {
   const i = Number(index);
   if (!Number.isFinite(i) || i < 0 || i >= ENGINE_SETTINGS_SLOT_COUNT) return;
   const filled = !!this.engineSettingsSlots[i];
   const overwrite = !!(event && event.shiftKey);
   if (!filled || overwrite) {
     this.saveEngineSettingsToSlot(i, overwrite);
   } else {
     this.loadEngineSettingsFromSlot(i);
   }
 },
 saveEngineSettingsToSlot(index, overwrite = false) {
   const snap = this.captureEngineSettingsSnapshot();
   this.engineSettingsSlots.splice(index, 1, snap);
   this.engineSettingsSlotStatus = overwrite
     ? `Overwrote slot ${index + 1}`
     : `Saved to slot ${index + 1}`;
   this.flashEngineSettingsSlotStatus();
   this.saveSessionState();
 },
 loadEngineSettingsFromSlot(index) {
   const snap = this.engineSettingsSlots[index];
   if (!snap) return;
   this.applyEngineSettingsSnapshot(snap);
   this.engineSettingsSlotStatus = `Loaded slot ${index + 1}`;
   this.flashEngineSettingsSlotStatus();
   this.saveSessionState();
 },
 flashEngineSettingsSlotStatus() {
   if (this._engineSettingsSlotStatusTimer) clearTimeout(this._engineSettingsSlotStatusTimer);
   this._engineSettingsSlotStatusTimer = setTimeout(() => {
     this.engineSettingsSlotStatus = '';
   }, 2500);
 },
 invalidateAudioSpectrogram() {
   this._spectrogramGen = (this._spectrogramGen || 0) + 1;
   this.audioSpectrogramDataUrl = null;
    this.audioSpectrogramStatus = "";
  },
  buildSpectrogramRgba(audioBuffer, opts) {
    const sampleRate = audioBuffer.sampleRate;
    const channels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const channelData = audioBuffer.getChannelData(0);
    
    // Adaptive FFT size based on audio length
    const fftSize = length >= 8192 ? 1024 : Math.max(256, Math.pow(2, Math.floor(Math.log2(length / 4))));
    const hopSize = fftSize / 2;
    const numFrames = Math.max(1, Math.floor((length - fftSize) / hopSize) + 1);
    const numBins = fftSize / 2;
    
    const width = Math.max(64, numFrames);
    const height = Math.max(32, Math.min(numBins, 128));
    const data = new Uint8ClampedArray(width * height * 4);
    
    // Step frame positions evenly across the audio
    const step = Math.max(1, numFrames / width);
    
    for (let x = 0; x < width; x++) {
      const frameStart = Math.floor(x * step);
      const offset = frameStart * hopSize;
      
      // Apply Hann window and compute DFT for each frequency bin
      for (let y = 0; y < height; y++) {
        let real = 0;
        let imag = 0;
        
        for (let n = 0; n < fftSize; n++) {
          const idx = offset + n;
          if (idx >= length) break;
          
          const window = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (fftSize - 1)));
          const sample = channelData[idx] * window;
          
          const angle = (2 * Math.PI * y * n) / fftSize;
          real += sample * Math.cos(angle);
          imag -= sample * Math.sin(angle);
        }
        
        const magnitude = Math.sqrt(real * real + imag * imag) / fftSize;
        const intensity = Math.min(1, magnitude * 10); // Scale up for visibility
        
        // Convert to color (blue -> cyan -> green -> yellow -> red)
        const idx4 = (y * width + x) * 4;
        if (intensity < 0.25) {
          data[idx4] = 0;
          data[idx4 + 1] = Math.floor(intensity * 4 * 255);
          data[idx4 + 2] = 255;
        } else if (intensity < 0.5) {
          data[idx4] = 0;
          data[idx4 + 1] = 255;
          data[idx4 + 2] = Math.floor((1 - (intensity - 0.25) * 4) * 255);
        } else if (intensity < 0.75) {
          data[idx4] = Math.floor((intensity - 0.5) * 4 * 255);
          data[idx4 + 1] = 255;
          data[idx4 + 2] = 0;
        } else {
          data[idx4] = 255;
          data[idx4 + 1] = Math.floor((1 - (intensity - 0.75) * 4) * 255);
          data[idx4 + 2] = 0;
        }
        data[idx4 + 3] = 255; // Alpha
      }
    }
    
    return { width, height, data };
  },
  spectrogramRgbaToDataUrl(rgba) {
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(rgba.width, rgba.height);
      const ctx = canvas.getContext("2d");
      const imageData = ctx.createImageData(rgba.width, rgba.height);
      imageData.data.set(rgba.data);
      ctx.putImageData(imageData, 0, 0);
      return canvas.toDataURL("image/png");
    }
    
    // Fallback for environments without OffscreenCanvas
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = rgba.width;
      canvas.height = rgba.height;
      const ctx = canvas.getContext("2d");
      const imageData = ctx.createImageData(rgba.width, rgba.height);
      imageData.data.set(rgba.data);
      ctx.putImageData(imageData, 0, 0);
      return canvas.toDataURL("image/png");
    }
    
    return null;
  },
  scheduleAudioSpectrogramDecode(expectedGen) {
   if (typeof setTimeout !== "function") return;
   setTimeout(() => {
     this.runAudioSpectrogramFromObjectUrl(expectedGen).catch(() => {});
   }, 0);
 },
 async runAudioSpectrogramFromObjectUrl(expectedGen) {
   const AC = typeof AudioContext !== "undefined" ? AudioContext : typeof webkitAudioContext !== "undefined" ? webkitAudioContext : null;
   if (!AC || !this.audio.objectUrl || typeof fetch !== "function") {
     if (expectedGen === this._spectrogramGen) this.audioSpectrogramStatus = "";
     return;
   }
   if (expectedGen !== this._spectrogramGen) return;
   let ctx = null;
   try {
     const res = await fetch(this.audio.objectUrl);
     const ab = await res.arrayBuffer();
     if (expectedGen !== this._spectrogramGen) return;
     ctx = new AC();
     const audioBuf = await ctx.decodeAudioData(ab.slice(0));
     if (expectedGen !== this._spectrogramGen) return;
      const rgba = this.buildSpectrogramRgba(audioBuf, {});
     if (!rgba) {
       this.audioSpectrogramStatus = "";
       return;
     }
      const dataUrl = this.spectrogramRgbaToDataUrl(rgba);
     if (expectedGen !== this._spectrogramGen) return;
     this.audioSpectrogramDataUrl = dataUrl;
     this.audioSpectrogramStatus = dataUrl ? "" : "";
   } catch (_e) {
     if (expectedGen === this._spectrogramGen) this.audioSpectrogramStatus = "";
   } finally {
     try {
       if (ctx && typeof ctx.close === "function") await ctx.close();
     } catch (_e2) {
       /* ignore */
     }
   }
 },
  spectrogramFromAudioBuffer(audioBuffer, opts) {
    return this.buildSpectrogramRgba(audioBuffer, opts || {});
  },
 disposeLiveAudioAnalyser() {
   if (this._liveSpecRaf != null && typeof cancelAnimationFrame === "function") {
     cancelAnimationFrame(this._liveSpecRaf);
   }
   this._liveSpecRaf = null;
   const el = this.$refs && this.$refs.avSyncAudio;
   if (el && this._liveSpecMediaHandlers) {
     const h = this._liveSpecMediaHandlers;
     if (h.play) el.removeEventListener("play", h.play);
     if (h.pause) el.removeEventListener("pause", h.pause);
     this._liveSpecMediaHandlers = null;
   }
   try {
     if (this._liveSpecSource && typeof this._liveSpecSource.disconnect === "function") this._liveSpecSource.disconnect();
   } catch (_e) {
     /* ignore */
   }
   try {
     if (this._liveSpecAnalyser && typeof this._liveSpecAnalyser.disconnect === "function") this._liveSpecAnalyser.disconnect();
   } catch (_e2) {
     /* ignore */
   }
   try {
     if (this._liveSpecGain && typeof this._liveSpecGain.disconnect === "function") this._liveSpecGain.disconnect();
   } catch (_e3) {
     /* ignore */
   }
   try {
     if (this._liveSpecBandpass && typeof this._liveSpecBandpass.disconnect === "function") this._liveSpecBandpass.disconnect();
   } catch (_e4) {
     /* ignore */
   }
   try {
     if (this._liveSpecSoloGain && typeof this._liveSpecSoloGain.disconnect === "function") this._liveSpecSoloGain.disconnect();
   } catch (_e5) {
     /* ignore */
   }
   const ctx = this._liveSpecCtx;
   this._liveSpecCtx = null;
   this._liveSpecSource = null;
   this._liveSpecAnalyser = null;
   this._liveSpecGain = null;
   this._liveSpecBandpass = null;
   this._liveSpecSoloGain = null;
   this._liveSpecFreqBuf = null;
   this.audioBandPreviewIndex = -1;
   if (ctx && typeof ctx.close === "function") {
     try {
       void ctx.close();
     } catch (_e6) {
       /* ignore */
     }
   }
 },
 setupLiveAudioAnalyser() {
   const AC = typeof AudioContext !== "undefined" ? AudioContext : typeof webkitAudioContext !== "undefined" ? webkitAudioContext : null;
   if (!AC) return;
   this.disposeLiveAudioAnalyser();
   const el = this.$refs && this.$refs.avSyncAudio;
   if (!el || !this.audio.objectUrl) return;
   try {
     const ctx = new AC();
     const source = ctx.createMediaElementSource(el);
     const analyser = ctx.createAnalyser();
     analyser.fftSize = 1024;
     analyser.smoothingTimeConstant = 0.78;
     const gain = ctx.createGain();
     gain.gain.value = 1;
     const bandpass = ctx.createBiquadFilter();
     bandpass.type = 'bandpass';
     const soloGain = ctx.createGain();
     soloGain.gain.value = 0;
     source.connect(analyser);
     analyser.connect(gain);
     gain.connect(ctx.destination);
     source.connect(bandpass);
     bandpass.connect(soloGain);
     soloGain.connect(ctx.destination);
     this._liveSpecCtx = ctx;
     this._liveSpecSource = source;
     this._liveSpecAnalyser = analyser;
     this._liveSpecGain = gain;
     this._liveSpecBandpass = bandpass;
     this._liveSpecSoloGain = soloGain;
     this._liveSpecFreqBuf = new Uint8Array(analyser.frequencyBinCount);
     this.syncAudioBandPreviewGains();
     if (this.audioBandPreviewIndex >= 0) {
       const mapping = this.audioMappings[this.audioBandPreviewIndex];
       if (mapping) this.updateAudioBandpassFilter(mapping);
     }
     const onPlay = () => this.onLiveAudioPlay();
     const onPause = () => this.onLiveAudioPause();
     el.addEventListener("play", onPlay);
     el.addEventListener("pause", onPause);
     this._liveSpecMediaHandlers = { play: onPlay, pause: onPause };
     if (!el.paused) this.onLiveAudioPlay();
   } catch (_e) {
     this.disposeLiveAudioAnalyser();
   }
 },
 onLiveAudioPlay() {
   try {
     if (this._liveSpecCtx && this._liveSpecCtx.state === "suspended" && typeof this._liveSpecCtx.resume === "function") {
       void this._liveSpecCtx.resume();
     }
   } catch (_e) {
     /* ignore */
   }
   this.scheduleLiveSpectrumFrame();
 },
 onLiveAudioPause() {
   if (this._liveSpecRaf != null && typeof cancelAnimationFrame === "function") {
     cancelAnimationFrame(this._liveSpecRaf);
   }
   this._liveSpecRaf = null;
   this.paintLiveSpectrumCanvases(null);
 },
 scheduleLiveSpectrumFrame() {
   if (this._liveSpecRaf != null) return;
   if (typeof requestAnimationFrame !== "function") return;
   this._liveSpecRaf = requestAnimationFrame(() => {
     this._liveSpecRaf = null;
     const el = this.$refs && this.$refs.avSyncAudio;
     const analyser = this._liveSpecAnalyser;
     const buf = this._liveSpecFreqBuf;
     if (!analyser || !buf) return;
     if (el && !el.paused && !el.ended) {
       analyser.getByteFrequencyData(buf);
       this.paintLiveSpectrumCanvases(buf);
       this.scheduleLiveSpectrumFrame();
     } else {
       this.paintLiveSpectrumCanvases(null);
     }
   });
 },
 paintLiveSpectrumCanvases(freqBytes) {
   const canvases = [this.$refs.liveSpectrumCanvas, this.$refs.liveSpectrumCanvasStrip].filter(Boolean);
   for (const c of canvases) {
     if (!c || !c.getContext) continue;
     const ctx2 = c.getContext("2d");
     if (!ctx2) continue;
     const w = c.width || 280;
     const h = c.height || 56;
     if (!freqBytes || !freqBytes.length) {
      ctx2.fillStyle = this.themeColor('--bg-0', 'rgb(8, 9, 13)');
       ctx2.fillRect(0, 0, w, h);
       continue;
     }
     paintSpectrumBars(ctx2, freqBytes, w, h, {
       bgColor: this.themeColor('--bg-0', 'rgb(8, 9, 13)'),
       barColor: 'rgba(80, 250, 123, 0.9)',
     });
   }
 },
 // Audio file upload methods
 async handleAudioUpload(evt) {
   const file = evt.target.files[0];
   if (!file) return;
   this.disposeLiveAudioAnalyser();
   this.invalidateAudioSpectrogram();
   const maxSizeBytes = 50 * 1024 * 1024; // 50MB
   if (file.size != null && file.size > maxSizeBytes) {
     this.audioStatus = "Audio file is too large. Maximum supported size is 50MB.";
     if (evt && evt.target) {
       evt.target.value = "";
     }
     return;
   }
   if (this.audio.objectUrl) {
     try {
       URL.revokeObjectURL(this.audio.objectUrl);
     } catch (_e) {}
     this.audio.objectUrl = null;
   }
   if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function" && typeof Blob !== "undefined" && file instanceof Blob) {
     try {
       this.audio.objectUrl = URL.createObjectURL(file);
      this.audioBeatMacrosCollapsed = true;
     } catch (_e) {
       this.audio.objectUrl = null;
     }
   }
   this.audioStatus = "Uploading audio…";
   try {
     const data = await new Promise((resolve, reject) => {
       const reader = new FileReader();
       reader.onload = () => resolve(reader.result);
       reader.onerror = () => reject(reader.error || new Error("Failed to read audio file. Ensure the file is under 50MB and try again."));
       reader.readAsDataURL(file);
     });
     const res = await fetch("/api/audio-upload", {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({ name: file.name, data }),
     });
     const json = await res.json();
     if (!res.ok || json.error) {
       throw new Error(json.error || "Upload failed");
     }
     this.audio.uploadedFile = file.name;
     this.audio.track = json.path || file.name;
     this.audioStatus = "Audio uploaded";
     const gen = this._spectrogramGen;
     if (this.audio.objectUrl) {
       this.audioSpectrogramStatus = "Analyzing…";
       this.scheduleAudioSpectrogramDecode(gen);
     }
     const scheduleSetup = () => {
       try {
         this.setupLiveAudioAnalyser();
       } catch (_e) {
         /* ignore */
       }
     };
     if (typeof this.$nextTick === "function") this.$nextTick(scheduleSetup);
     else setTimeout(scheduleSetup, 0);
     this.audioSpectrumBins = [];
   } catch (err) {
     if (this.audio.objectUrl) {
       try {
         URL.revokeObjectURL(this.audio.objectUrl);
       } catch (_e2) {}
       this.audio.objectUrl = null;
     }
     this.audioStatus = String(err && err.message ? err.message : err);
     console.error("Audio upload failed:", err);
     this.invalidateAudioSpectrogram();
     this.disposeLiveAudioAnalyser();
   }
 },
onAudioUpload(evt) {
  return this.handleAudioUpload(evt);
},
 clearAudioFile() {
   this.stopAudioBandPreview();
   this.disposeLiveAudioAnalyser();
   this.invalidateAudioSpectrogram();
   this.audio.uploadedFile = null;
   this.audio.track = "";
   if (this.audio.objectUrl) {
     try {
       URL.revokeObjectURL(this.audio.objectUrl);
     } catch (_e) {}
     this.audio.objectUrl = null;
   }
  this.audioBeatMacrosCollapsed = true;
   this.avSyncEnabled = false;
   this.audioSpectrumBins = [];
   const a = this.$refs.avSyncAudio;
   if (a) {
     try {
       if (typeof a.pause === "function") a.pause();
     } catch (_e) {
       /* jsdom / headless may not implement media pause */
     }
   }
   this.audioStatus = "Idle";
   if (this.$refs.audioFileInput) {
     this.$refs.audioFileInput.value = "";
   }
 },
 // ControlNet methods
 async loadControlNetModels() {
   this.cnLoading = true;
   try {
     const { data } = await apiFetch("/api/controlnet/models", {}, "controlnet models");
     this.cn.availableModels = data.models || [];
     this.cn.source = data.source || "unknown";
   } catch (_) {
   } finally {
     this.cnLoading = false;
   }
 },
 async loadControlNetModules() {
   try {
     const { data } = await apiFetch("/api/controlnet/modules", {}, "controlnet modules");
     this.cnModules = data.modules || [];
     this.cnModulesSource = data.source || "unknown";
   } catch (_) {
     this.cnModules = [];
     this.cnModulesSource = "unknown";
   }
 },
 getDeforumCnField(unit, field) {
   const p = cnPrefix(unit);
   const key = String(field || "").startsWith("cn_") ? field : `${p}${field}`;
   return this.deforumSettings?.[key];
 },
 onDeforumCnField(unit, field, raw, kind) {
   const p = cnPrefix(unit);
   const key = String(field || "").startsWith("cn_") ? field : `${p}${field}`;
   let value = raw;
   if (kind === "number") {
     const n = parseFloat(raw);
     value = Number.isFinite(n) ? n : 0;
   } else if (kind === "bool") {
     value = !!raw;
   }
   this.deforumSettings = { ...(this.deforumSettings || {}), [key]: value };
   this.syncDeforumCnSlotFromUnit(unit);
   this.syncDeforumSettingsJson();
   this.saveSessionState();
   this.queueDeforumSettingsSave();
 },
 setDeforumCnEnabled(unit, enabled) {
   const p = cnPrefix(unit);
   this.deforumSettings = { ...(this.deforumSettings || {}), [`${p}enabled`]: !!enabled };
   this.ensureDeforumCnFieldsEnabled(unit, !!enabled);
   this.syncDeforumCnSlotFromUnit(unit);
   this.syncDeforumSettingsJson();
   this.saveSessionState();
   this.queueDeforumSettingsSave();
 },
 setDeforumCnModulePreset(unit, presetId) {
   this.deforumSettings = applyModulePresetToSettings(this.deforumSettings, unit, presetId);
   if (presetId && presetId !== "none") {
     this.ensureDeforumCnFieldsEnabled(unit, true);
   }
   this.syncDeforumCnSlotFromUnit(unit);
   this.syncDeforumSettingsJson();
   this.saveSessionState();
   this.queueDeforumSettingsSave();
 },
 setDeforumCnScalar(unit, field, raw) {
   const p = cnPrefix(unit);
   const key = `${p}${field}`;
   this.deforumSettings = {
     ...(this.deforumSettings || {}),
     [key]: scheduleFromScalar(raw, field === "weight" ? 1 : field === "guidance_end" ? 1 : 0),
   };
   this.syncDeforumCnSlotFromUnit(unit);
   this.syncDeforumSettingsJson();
   this.saveSessionState();
   this.queueDeforumSettingsSave();
 },
 getDeforumCnScalar(unit, field, fallback = null) {
   const p = cnPrefix(unit);
   return scalarFromSchedule(this.deforumSettings?.[`${p}${field}`], fallback);
 },
 inferDeforumCnPresetId(unit) {
   return inferModulePresetId(this.deforumSettings, unit);
 },
 deforumCnModelChoices(unit) {
   const module = this.getDeforumCnField(unit, "module");
   return filterModelsForModule(this.cn.availableModels, module);
 },
 isDeforumCnUnitEnabled(unit) {
   return !!this.getDeforumCnField(unit, "enabled");
 },
 ensureDeforumCnFieldsEnabled(unit, enabled) {
   const p = cnPrefix(unit);
   const next = createDeforumFieldEnabledMap(this.deforumFieldEnabled);
   DEFORUM_FIELD_KEYS.forEach((key) => {
     if (String(key).startsWith(p)) next[key] = enabled !== false;
   });
   this.deforumFieldEnabled = next;
 },
 syncDeforumCnSlotFromUnit(unit) {
   const slotId = `CN${unit}`;
   const idx = this.cn.slots.findIndex((s) => s.id === slotId);
   if (idx < 0) return;
   const synced = syncCnSlotFromDeforumUnit(this.deforumSettings, unit, this.cn.slots[idx]);
   this.cn.slots.splice(idx, 1, { ...this.cn.slots[idx], ...synced });
 },
 syncDeforumCnSlotsFromSettings() {
   for (let unit = 1; unit <= DEFORUM_CN_SLOT_COUNT; unit += 1) {
     this.syncDeforumCnSlotFromUnit(unit);
   }
 },
 pushDeforumCnUnitToMediator(unit) {
   this.syncDeforumCnSlotFromUnit(unit);
   const slot = this.cn.slots.find((s) => s.id === `CN${unit}`);
   if (slot) this.updateControlNet(slot);
 },
 applyDeforumControlNetForRun() {
   for (let unit = 1; unit <= DEFORUM_CN_SLOT_COUNT; unit += 1) {
     const enabled = this.isDeforumCnUnitEnabled(unit);
     this.ensureDeforumCnFieldsEnabled(unit, enabled);
     this.syncDeforumCnSlotFromUnit(unit);
     if (enabled) {
       const slot = this.cn.slots.find((s) => s.id === `CN${unit}`);
       if (slot) {
         const payload = {
           controlnet_slot: slot.id,
           controlnet_model: slot.model,
           controlnet_weight: slot.weight,
           controlnet_start: slot.start,
           controlnet_end: slot.end,
           controlnet_enabled: slot.enabled,
         };
         this.sendControl("controlNet", payload);
       }
     }
   }
   this.queueDeforumSettingsSave();
 },
 async uploadDeforumCnGuideImage(unit, file) {
   if (!file) return;
   const slotId = `CN${unit}`;
   const formData = new FormData();
   formData.append("image", file);
   formData.append("slot", slotId);
   try {
     const res = await fetch("/api/controlnet/upload-image", { method: "POST", body: formData });
     const data = await res.json();
     if (data.error) {
       console.error("Deforum ControlNet upload:", data.error);
       return;
     }
     this.pushDeforumCnUnitToMediator(unit);
   } catch (err) {
     console.error("Deforum ControlNet upload failed", err);
   }
 },
 updateControlNet(slot) {
   const unit = cnUnitFromSlotId(slot?.id);
   if (unit) {
     this.deforumSettings = syncDeforumUnitFromCnSlot(this.deforumSettings, unit, {
       ...slot,
       modulePreset: slot.modulePreset || inferModulePresetId(this.deforumSettings, unit),
     });
     this.queueDeforumSettingsSave();
   }
   const payload = {
     controlnet_slot: slot.id,
     controlnet_model: slot.model,
     controlnet_weight: slot.weight,
     controlnet_start: slot.start,
     controlnet_end: slot.end,
     controlnet_enabled: slot.enabled,
   };
   this.sendControl("controlNet", payload);
 },
 uploadControlNetImage(slot) {
   this.cn.active = slot.id;
   const input = this.$refs.cnImageInput;
   if (input) input.click();
 },
 onControlNetFileSelected(evt) {
   const file = evt.target.files && evt.target.files[0];
   if (!file) return;
   const formData = new FormData();
   formData.append("image", file);
   formData.append("slot", this.cn.active);
   fetch("/api/controlnet/upload-image", { method: "POST", body: formData })
     .then((r) => r.json())
     .then((data) => {
       if (data.error) console.error("ControlNet upload:", data.error);
     })
     .catch((err) => console.error("ControlNet upload failed", err));
   evt.target.value = "";
 },
 async toggleWebcam() {
   if (this.cn.webcamActive) this.stopWebcam();
   else await this.startWebcam();
 },
 async startWebcam() {
   try {
     const stream = await navigator.mediaDevices.getUserMedia({
       video: { width: 512, height: 512, facingMode: "user" },
     });
     this.cn.webcamStream = stream;
     this.cn.webcamActive = true;
     const videoEl = this.$refs.webcamVideo;
     if (videoEl) {
       videoEl.srcObject = stream;
       videoEl.style.display = "block";
       this.cn.webcamVideo = videoEl;
     }
     const canvasEl = this.$refs.webcamCanvas;
     if (canvasEl) {
       this.cn.webcamCanvas = canvasEl;
       canvasEl.width = 512;
       canvasEl.height = 512;
     }
     this.cn.webcamCaptureInterval = setInterval(() => this.captureWebcamFrame(), this.webcamCaptureRate);
   } catch (err) {
     console.error("Failed to start webcam:", err);
     alert("Could not access webcam. Check browser permissions.");
   }
 },
 stopWebcam() {
   if (this.cn.webcamCaptureInterval) {
     clearInterval(this.cn.webcamCaptureInterval);
     this.cn.webcamCaptureInterval = null;
   }
   if (this.cn.webcamStream) {
     this.cn.webcamStream.getTracks().forEach((t) => t.stop());
     this.cn.webcamStream = null;
   }
   const videoEl = this.$refs.webcamVideo;
   if (videoEl) {
     videoEl.style.display = "none";
     videoEl.srcObject = null;
   }
   this.cn.webcamActive = false;
 },
 captureWebcamFrame() {
   const video = this.cn.webcamVideo;
   const canvas = this.cn.webcamCanvas;
   if (!video || !canvas || video.readyState < 2) return;
   const ctx = canvas.getContext("2d");
   ctx.drawImage(video, 0, 0, 512, 512);
   canvas.toBlob(async (blob) => {
     if (!blob) return;
     const activeSlot = this.cn.slots.find((s) => s.id === this.cn.active);
     if (!activeSlot || activeSlot.imageSource !== "webcam") return;
     const formData = new FormData();
     formData.append("image", blob, "webcam_frame.png");
     formData.append("slot", this.cn.active);
     try {
       await fetch("/api/controlnet/upload-image", { method: "POST", body: formData });
     } catch (err) {
       console.error("Webcam frame upload failed:", err);
     }
   }, "image/png");
 },
 async startScreenCapture() {
   try {
     const stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: 512, height: 512 } });
     const video = document.createElement("video");
     video.srcObject = stream;
     video.autoplay = true;
     video.playsInline = true;
     const canvas = document.createElement("canvas");
     canvas.width = 512;
     canvas.height = 512;
     const captureInterval = setInterval(() => {
       if (video.readyState < 2) return;
       canvas.getContext("2d").drawImage(video, 0, 0, 512, 512);
       canvas.toBlob(async (blob) => {
         if (!blob) return;
         const activeSlot = this.cn.slots.find((s) => s.id === this.cn.active);
         if (!activeSlot || activeSlot.imageSource !== "screen") return;
         const formData = new FormData();
         formData.append("image", blob, "screen_capture.png");
         formData.append("slot", this.cn.active);
         try {
           await fetch("/api/controlnet/upload-image", { method: "POST", body: formData });
         } catch (err) {
           console.error("Screen capture upload failed:", err);
         }
       }, "image/png");
     }, this.webcamCaptureRate);
     stream.getVideoTracks()[0].onended = () => clearInterval(captureInterval);
   } catch (err) {
     console.error("Failed to start screen capture:", err);
     alert("Could not start screen capture. Check browser permissions.");
   }
 },
 handleMidi(input, msg) {
   const [status, cc, value] = msg.data;
   const isCC = (status & 0xf0) === 0xb0;
   if (!isCC) return;
   const mapping = this.midi.mappings.find((m) => m.cc === cc);
   const norm = value / 127;
   if (mapping && mapping.key) {
     const k = String(mapping.key || "");
     const modSlot = k.match(/^mod_slot_(\d)$/);
     if (modSlot) {
       const idx = Math.max(1, Math.min(6, Number(modSlot[1]) || 1));
       const slots = Array.isArray(this.liveModulationSlots) ? this.liveModulationSlots : [];
       const slot = slots[idx - 1];
       if (slot) {
         if (slot.kind === 'xypad') {
           // For XY slots we drive X only (Y is mod_slot_(idx+1) or map separately)
           const px = this.modulationTargetByKey(slot.paramKeyX);
           if (px) {
             const scaled = px.min + norm * (px.max - px.min);
             const payload = {};
             const cnUpdates = {};
             this.routeModulationValue(px.key, scaled, payload, cnUpdates);
             if (Object.keys(payload).length) this.sendControl('liveParam', payload);
             Object.values(cnUpdates).forEach((slot) => this.updateControlNet(slot));
           }
         } else if (slot.paramKey) {
           const target = this.modulationTargetByKey(slot.paramKey);
           if (target) {
             const scaled = target.min + norm * (target.max - target.min);
             const payload = {};
             const cnUpdates = {};
             this.routeModulationValue(target.key, scaled, payload, cnUpdates);
             if (Object.keys(payload).length) this.sendControl('liveParam', payload);
             Object.values(cnUpdates).forEach((slot) => this.updateControlNet(slot));
           } else {
             this.sendControl("liveParam", { [slot.paramKey]: norm });
           }
         }
       }
       return;
     }

     const target = this.midiTarget(k);
     if (target) {
       const scaled = target.min + norm * (target.max - target.min);
       const payload = {};
       const cnUpdates = {};
       this.routeModulationValue(target.key, scaled, payload, cnUpdates);
       if (Object.keys(payload).length) this.sendControl('liveParam', payload);
       Object.values(cnUpdates).forEach((slot) => this.updateControlNet(slot));
     } else {
       this.sendControl("liveParam", { [k]: norm });
     }
   }
 },
 sortedKeyframes(tr) {
   return [...(tr.keyframes || [])].sort((a, b) => a.t - b.t);
 },
 setKeyframeEasing(kf, mode) {
   if (!kf) return;
   kf.easing = mode === "linear" ? undefined : mode;
 },
 sequencerEaseT(u, mode) {
   const uu = Math.min(1, Math.max(0, u));
   const m = mode || "linear";
   if (m === "easeIn") return uu * uu * uu;
   if (m === "easeOut") return 1 - (1 - uu) ** 3;
   if (m === "easeInOut") {
     if (uu < 0.5) return 4 * uu * uu * uu;
     return 1 - (-2 * uu + 2) ** 3 / 2;
   }
   return uu;
 },
 sequencerPayload() {
   const markers = Array.isArray(this.sequencer.markers)
     ? [...this.sequencer.markers]
         .map((m) => ({ t: Number(m.t), name: String(m.name || "").trim(), action: m.action || "jump", target: m.target || "" }))
         .filter((m) => m.name && Number.isFinite(m.t))
         .sort((a, b) => a.t - b.t)
     : [];
   return {
     version: 1,
     durationSec: Number(this.sequencer.durationSec),
     fps: Number(this.sequencer.fps),
     loop: !!this.sequencer.loop,
     markers,
     sourceVideo: this.sequencer.sourceVideo && typeof this.sequencer.sourceVideo === 'object'
       ? { ...this.sequencer.sourceVideo }
       : null,
     clips: this.normalizeSequencerClipsForSave(this.sequencer.clips),
     tracks: this.sequencer.tracks.map((tr) => ({
       id: tr.id,
       param: tr.param,
       keyframes: [...tr.keyframes].sort((a, b) => a.t - b.t),
     })),
   };
 },
 normalizeSequencerClipsForSave(clips) {
   const allowed = new Set(['prompt', 'lora', 'controlnet', 'video']);
   const d = Number(this.sequencer.durationSec) || 0;
   if (!Array.isArray(clips)) return [];
   return clips
     .filter((c) => c && allowed.has(c.type) && Number.isFinite(Number(c.t)))
     .map((c) => {
       const t = Math.min(Math.max(0, Number(c.t)), d);
       let endT = c.endT == null || c.endT === '' ? null : Number(c.endT);
       if (endT != null && Number.isFinite(endT)) {
         endT = Math.min(Math.max(t, endT), d);
       } else {
         endT = null;
       }
       return {
         id: String(c.id || `clip-${Date.now()}`),
         type: c.type,
         t,
         endT,
         label: String(c.label || c.type).slice(0, 48),
         payload: c.payload && typeof c.payload === 'object' ? c.payload : {},
       };
     })
     .sort((a, b) => a.t - b.t);
 },
 clampSequencerClips() {
   const d = Number(this.sequencer.durationSec) || 0;
   const arr = this.sequencer.clips;
   if (!Array.isArray(arr)) return;
   for (const c of arr) {
     if (!c || typeof c.t !== 'number') continue;
     if (c.t < 0) c.t = 0;
     if (c.t > d) c.t = d;
     if (c.endT != null && typeof c.endT === 'number') {
       if (c.endT < c.t) c.endT = c.t;
       if (c.endT > d) c.endT = d;
     }
   }
 },
 snapshotSequencerPromptPayload() {
   return {
     pos: String(this.prompts.pos || ''),
     neg: String(this.prompts.neg || ''),
   };
 },
 snapshotSequencerLoraPayload() {
   const pick = (list) => (list || []).map((l) => ({
     id: l.id,
     name: l.name,
     path: l.path,
     strength: Number(l.strength) || 0,
   }));
   return {
     common: pick(this.loras.common),
     groupA: pick(this.loras.groupA),
     groupB: pick(this.loras.groupB),
     crossfaderValue: Number(this.prompts.crossfaderValue) || 0,
     loraCrossfaderOn: !!this.prompts.loraCrossfaderOn,
   };
 },
 snapshotSequencerControlNetPayload() {
   return {
     slots: (this.cn.slots || []).map((s) => ({
       id: s.id,
       model: s.model,
       weight: Number(s.weight) || 0,
       start: Number(s.start) || 0,
       end: Number(s.end) ?? 1,
       enabled: !!s.enabled,
     })),
   };
 },
 addSequencerClip(type) {
   const allowed = new Set(['prompt', 'lora', 'controlnet', 'video']);
   if (!allowed.has(type)) return;
   this.clampSequencerPlayhead();
   const d = Math.max(0, Number(this.sequencer.durationSec) || 0);
   if (d < 0.1) {
     this.sequencerStatus = 'Set timeline duration above 0s first';
     return;
   }
   const existing = Array.isArray(this.sequencer.clips) ? this.sequencer.clips : [];
   if (existing.length >= 96) {
     this.sequencerStatus = 'Maximum 96 timeline clips';
     return;
   }
   const t = Math.min(Math.max(0, this.sequencerPlayhead), d);
   const span = Math.max(0.1, Number(this.sequencerClipDurationSec) || 2);
   const endT = Math.min(d, t + span);
   const count = existing.filter((c) => c.type === type).length + 1;
   const labels = { prompt: 'Prompt', lora: 'LoRA', controlnet: 'ControlNet' };
   let payload = {};
   if (type === 'prompt') payload = this.snapshotSequencerPromptPayload();
   else if (type === 'lora') payload = this.snapshotSequencerLoraPayload();
   else payload = this.snapshotSequencerControlNetPayload();
   const id = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
   const clip = {
     id,
     type,
     t,
     endT: endT > t ? endT : null,
     label: `${labels[type]} ${count}`,
     payload,
   };
   this.sequencer.clips = [...existing, clip];
   this.sequencerSelectedClipId = id;
   this.sequencerStatus = `Added ${clip.label} at ${t.toFixed(2)}s`;
   this.saveSessionState();
   this.$nextTick(() => this.drawTimeline());
   try {
     this.applySequencerClip(clip);
   } catch (err) {
     console.warn('[sequencer] apply clip failed', err);
   }
 },
 removeSequencerClip(clipId) {
   if (!Array.isArray(this.sequencer.clips)) return;
   const ix = this.sequencer.clips.findIndex((c) => c.id === clipId);
   if (ix < 0) return;
   this.sequencer.clips.splice(ix, 1);
   if (this.sequencerSelectedClipId === clipId) this.sequencerSelectedClipId = null;
 },
 jumpToSequencerClip(clip) {
   if (!clip || typeof clip.t !== 'number') return;
   const d = Number(this.sequencer.durationSec) || 0;
   this.sequencerPlayhead = Math.min(Math.max(0, clip.t), d);
   this.sequencerSelectedClipId = clip.id;
   this.previewSequencerFrame();
 },
 selectSequencerClip(clipId) {
   this.sequencerSelectedClipId = clipId;
 },
 activeSequencerClipAt(tSec, type) {
   const t = Number(tSec) || 0;
   const matches = (this.sequencer.clips || [])
     .filter((c) => c && c.type === type && Number.isFinite(Number(c.t)) && t >= Number(c.t))
     .filter((c) => c.endT == null || t < Number(c.endT));
   if (!matches.length) return null;
   return matches.reduce((best, c) => (Number(c.t) >= Number(best.t) ? c : best), matches[0]);
 },
 applySequencerClip(clip) {
   if (!clip || !clip.payload) return;
   if (clip.type === 'prompt') {
     if (clip.payload.pos != null) this.prompts.pos = String(clip.payload.pos);
     if (clip.payload.neg != null) this.prompts.neg = String(clip.payload.neg);
     this.sendPrompts();
     return;
   }
   if (clip.type === 'lora') {
     const restore = (entries, groupKey) => {
       this.loras[groupKey] = (entries || []).map((e) => ({
         id: e.id || e.path,
         name: e.name || e.path,
         path: e.path,
         strength: Number(e.strength) || 1,
       }));
     };
     restore(clip.payload.common, 'common');
     restore(clip.payload.groupA, 'groupA');
     restore(clip.payload.groupB, 'groupB');
     if (clip.payload.crossfaderValue != null) {
       this.prompts.crossfaderValue = Number(clip.payload.crossfaderValue) || 0;
     }
     if (clip.payload.loraCrossfaderOn != null) {
       this.prompts.loraCrossfaderOn = !!clip.payload.loraCrossfaderOn;
     }
     this.applyLoras();
     return;
   }
   if (clip.type === 'controlnet' && Array.isArray(clip.payload.slots)) {
     for (const snap of clip.payload.slots) {
       const slot = this.cn.slots.find((s) => s.id === snap.id);
       if (!slot) continue;
       if (snap.model != null) slot.model = snap.model;
       if (snap.weight != null) slot.weight = snap.weight;
       if (snap.start != null) slot.start = snap.start;
       if (snap.end != null) slot.end = snap.end;
       if (snap.enabled != null) slot.enabled = snap.enabled;
       this.updateControlNet(slot);
     }
     return;
   }
   if (clip.type === 'video' && clip.payload?.url) {
     this.sequencer.sourceVideo = { ...clip.payload };
     this.applyLibraryVideoAsSource(
       {
         videoPath: clip.payload.path,
         rootId: clip.payload.rootId,
         videoUrl: clip.payload.url,
         title: clip.payload.label,
       },
       { closeLibrary: false },
     );
   }
 },
 applySequencerClipsAt(tSec) {
   for (const type of ['prompt', 'lora', 'controlnet', 'video']) {
     const clip = this.activeSequencerClipAt(tSec, type);
     if (clip) this.applySequencerClip(clip);
   }
 },
 clipTypeLabel(type) {
   if (type === 'prompt') return 'Prompt';
   if (type === 'lora') return 'LoRA';
   if (type === 'controlnet') return 'ControlNet';
   if (type === 'video') return 'Video';
   return type;
 },
 clipSummaryText(clip) {
   if (!clip) return '';
   if (clip.type === 'prompt') {
     const text = String(clip.payload?.pos || '').trim();
     return text.length > 48 ? `${text.slice(0, 48)}…` : text || 'Empty prompt';
   }
   if (clip.type === 'lora') {
     const n = (clip.payload?.common?.length || 0)
       + (clip.payload?.groupA?.length || 0)
       + (clip.payload?.groupB?.length || 0);
     return `${n} LoRA${n === 1 ? '' : 's'}`;
   }
   if (clip.type === 'controlnet') {
     const enabled = (clip.payload?.slots || []).filter((s) => s.enabled).length;
     return `${enabled} slot${enabled === 1 ? '' : 's'} on`;
   }
   if (clip.type === 'video') {
     return String(clip.payload?.label || clip.label || 'Library video');
   }
   return '';
 },
 clampSequencerMarkers() {
   const d = Number(this.sequencer.durationSec) || 0;
   const arr = this.sequencer.markers;
   if (!Array.isArray(arr)) return;
   for (const m of arr) {
     if (!m || typeof m.t !== "number") continue;
     if (m.t < 0) m.t = 0;
     if (m.t > d) m.t = d;
   }
   this.clampSequencerClips();
 },
 clampSequencerPlayhead() {
   const d = Number(this.sequencer.durationSec) || 0;
   if (this.sequencerPlayhead < 0) this.sequencerPlayhead = 0;
   if (this.sequencerPlayhead > d) this.sequencerPlayhead = d;
   this.clampSequencerMarkers();
 },
 addSequencerMarker() {
   this.clampSequencerPlayhead();
   const d = Number(this.sequencer.durationSec) || 0;
   let name = (this.sequencerMarkerName || "").trim() || "Scene";
   if (name.length > 48) name = name.slice(0, 48);
   if (!/^[a-zA-Z0-9_ \-.]+$/.test(name)) {
     this.sequencerStatus = "Marker label: letters, digits, space, underscore, hyphen, dot only";
     return;
   }
   if (!Array.isArray(this.sequencer.markers)) this.sequencer.markers = [];
   if (this.sequencer.markers.length >= 64) {
     this.sequencerStatus = "Maximum 64 markers";
     return;
   }
   const t = Math.min(Math.max(0, this.sequencerPlayhead), d);
   this.sequencer.markers.push({ t, name, action: "jump", target: "" });
   this.sequencerStatus = "";
 },
 removeSequencerMarker(sortedIdx) {
   const sorted = this.sortedSequencerMarkers;
   const victim = sorted[sortedIdx];
   if (!victim || !Array.isArray(this.sequencer.markers)) return;
   const ix = this.sequencer.markers.indexOf(victim);
   if (ix >= 0) this.sequencer.markers.splice(ix, 1);
 },
 jumpToSequencerMarker(m) {
   if (!m || typeof m.t !== "number") return;
   const d = Number(this.sequencer.durationSec) || 0;
   this.sequencerPlayhead = Math.min(Math.max(0, m.t), d);
   this.previewSequencerFrame();
 },
 setMarkerAction(m, action) {
   if (!m) return;
   m.action = action;
   if (action === "jump" || action === "generate" || action === "pause") {
     m.target = "";
   }
 },
 setMarkerTarget(m, target) {
   if (!m) return;
   m.target = target;
 },
 markerActionPlaceholder(action) {
   switch (action) {
     case "preset": return "Preset name";
     case "morph": return "Slot #";
     case "param": return '{"param": value}';
     default: return "";
   }
 },
 markerActionTitle(action) {
   switch (action) {
     case "preset": return "Name of a motion preset (e.g. Orbit, Zoom)";
     case "morph": return "Morph slot number to toggle (1, 2, 3...)";
     case "param": return 'JSON object of params to apply (e.g. {"zoom": 1.5})';
     default: return "";
   }
 },
 interpolateTrack(tr, tSec) {
   const dur = Number(this.sequencer.durationSec) || 0;
   const t = Math.min(Math.max(0, tSec), dur);
   const kf = this.sortedKeyframes(tr);
   if (!kf.length) return null;
   if (t <= kf[0].t) return kf[0].v;
   if (t >= kf[kf.length - 1].t) return kf[kf.length - 1].v;
   let i = 0;
   while (i < kf.length - 1 && kf[i + 1].t < t) i += 1;
   const a = kf[i];
   const b = kf[i + 1];
   if (!b) return a.v;
   const span = b.t - a.t;
   if (span <= 0) return a.v;
   const u = (t - a.t) / span;
   if (a.hIn !== undefined || a.hOut !== undefined || b.hIn !== undefined || b.hOut !== undefined) {
     const hOut = a.hOut != null ? a.hOut : 0.33;
     const hIn = b.hIn != null ? b.hIn : 0.67;
     const vOut = a.hOutV != null ? a.hOutV : a.v + (b.v - a.v) * 0.33;
     const vIn = b.hInV != null ? b.hInV : a.v + (b.v - a.v) * 0.67;
     return this.cubicBezier(u, a.v, vOut, vIn, b.v);
   }
   const ease = a.easing || "linear";
   const w = this.sequencerEaseT(u, ease);
   return a.v + w * (b.v - a.v);
 },
 cubicBezier(t, p0, p1, p2, p3) {
   const mt = 1 - t;
   return mt*mt*mt*p0 + 3*mt*mt*t*p1 + 3*mt*t*t*p2 + t*t*t*p3;
 },
 applySequencerAt(tSec) {
   const payload = {};
   const cnUpdates = {};
   for (const tr of this.sequencer.tracks) {
     const v = this.interpolateTrack(tr, tSec);
     if (v === null || !Number.isFinite(v)) continue;
     const meta = this.modulationTargetByKey(tr.param);
     let routed = v;
     if (meta) {
       routed = this.clampVal(v, meta.min, meta.max);
     } else if (tr.param.startsWith('cn_')) {
       if (tr.param.endsWith('_weight')) routed = Math.min(2, Math.max(0, v));
       else routed = Math.min(1, Math.max(0, v));
     }
     this.routeModulationValue(tr.param, routed, payload, cnUpdates);
   }
   if (Object.keys(payload).length) this.sendControl("liveParam", payload);
   Object.values(cnUpdates).forEach(slot => this.updateControlNet(slot));
   this.applySequencerClipsAt(tSec);
   this.syncSequencerSourceVideo(tSec);
 },
 previewSequencerFrame() {
   this.clampSequencerPlayhead();
   this.jobPlaybackTimeSec = Number(this.sequencerPlayhead) || 0;
   this.applySequencerAt(this.sequencerPlayhead);
   const wsLive = this.ws && this.ws.readyState === 1;
   if (!wsLive && this.sequencer.tracks.some((tr) => tr.keyframes && tr.keyframes.length)) {
     this.sequencerStatus = 'Preview applied locally — connect live control for engine output';
   } else if (wsLive) {
     this.sequencerStatus = '';
   }
 },
 tickSequencer() {
   const dur = Number(this.sequencer.durationSec) || 0;
   const dt = 1 / Math.max(1, Number(this.sequencer.fps) || 24);
   let next = this.sequencerPlayhead + dt;
   const prev = this.sequencerPlayhead;
   if (next >= dur - 1e-9) {
     if (this.sequencer.loop) next = 0;
     else {
       this.sequencerPlayhead = dur;
       this.applySequencerAt(this.sequencerPlayhead);
       this.stopSequencerPlayback();
       return;
     }
   }
   this.sequencerPlayhead = next;
   this.applySequencerAt(this.sequencerPlayhead);
   const markers = (this.sequencer.markers || []);
   for (const m of markers) {
     if (m.t > prev && m.t <= next) {
       this.triggerMarkerAction(m);
     }
   }
 },
 triggerMarkerAction(m) {
   if (!m || !m.action) return;
   switch (m.action) {
     case "jump":
       this.sequencerPlayhead = m.t;
       this.previewSequencerFrame();
       break;
     case "preset":
       if (m.target && this.motionPresets[m.target]) {
         this.sendPreset(m.target);
         this.sequencerStatus = `Marker: applied preset "${m.target}"`;
       }
       break;
     case "generate":
       this.generateStory();
       this.sequencerStatus = `Marker: triggered generation`;
       break;
     case "morph":
       if (m.target) {
         const slotIdx = parseInt(m.target) - 1;
         if (slotIdx >= 0 && slotIdx < this.morphSlots.length) {
           this.morphSlots[slotIdx].on = !this.morphSlots[slotIdx].on;
           this.applyPromptMorphing();
           this.sequencerStatus = `Marker: toggled morph slot ${m.target}`;
         }
       }
       break;
     case "param":
       try {
         const params = JSON.parse(m.target || "{}");
         this.sendControl("liveParam", params);
         this.sequencerStatus = `Marker: applied params`;
       } catch (_e) {
         this.sequencerStatus = `Marker: invalid param JSON`;
       }
       break;
     case "pause":
       this.stopSequencerPlayback();
       this.sequencerStatus = `Marker: paused at "${m.name}"`;
       break;
   }
 },
 toggleSequencerPlayback() {
   if (this.sequencerPlaying) {
     this.stopSequencerPlayback();
     return;
   }
   if (!this.sequencer.tracks.length) {
     this.sequencerStatus = "Add a track (+ Track) then keyframes (+ Keyframe)";
     return;
   }
   const hasKf = this.sequencer.tracks.some((tr) => tr.keyframes && tr.keyframes.length);
   if (!hasKf) {
     this.sequencerStatus = "Add keyframes to play";
     return;
   }
   const wsLive = this.ws && this.ws.readyState === 1;
   this.sequencerPlaying = true;
   this.sequencerStatus = wsLive ? '' : 'Playing locally — connect live control for engine output';
   const ms = Math.max(16, Math.round(1000 / Math.max(1, Number(this.sequencer.fps) || 24)));
   this.sequencerTimer = setInterval(() => this.tickSequencer(), ms);
 },
 stopSequencerPlayback() {
   this.sequencerPlaying = false;
   if (this.sequencerTimer) {
     clearInterval(this.sequencerTimer);
     this.sequencerTimer = null;
   }
 },
 addSequencerTrack() {
   const param = this.sequencerNewParam;
   if (this.sequencer.tracks.some((x) => x.param === param)) {
     this.sequencerStatus = "Track already exists for " + param;
     return;
   }
   const id = "tr-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
   this.sequencer.tracks.push({ id, param, keyframes: [] });
   this.sequencerSelectedTrackId = id;
   this.sequencerStatus = "";
 },
 removeSequencerTrack(id) {
   this.sequencer.tracks = this.sequencer.tracks.filter((x) => x.id !== id);
   if (this.sequencerSelectedTrackId === id) this.sequencerSelectedTrackId = null;
 },
 addSequencerKeyframe() {
   const tid = this.sequencerSelectedTrackId || (this.sequencer.tracks[0] && this.sequencer.tracks[0].id);
   const tr = this.sequencer.tracks.find((x) => x.id === tid);
   if (!tr) {
     this.sequencerStatus = "Add a track first";
     return;
   }
   this.clampSequencerPlayhead();
   const t = Math.min(Math.max(0, this.sequencerPlayhead), Number(this.sequencer.durationSec) || 0);
   const v = Number(this.sequencerKeyframeVal);
   if (Number.isNaN(v)) {
     this.sequencerStatus = "Invalid keyframe value";
     return;
   }
   tr.keyframes.push({ t, v });
   this.sequencerStatus = "";
 },
 removeSequencerKeyframe(trackId, sortedIdx) {
   const tr = this.sequencer.tracks.find((x) => x.id === trackId);
   if (!tr) return;
   const sorted = this.sortedKeyframes(tr);
   const victim = sorted[sortedIdx];
   if (!victim) return;
   const ix = tr.keyframes.indexOf(victim);
   if (ix >= 0) tr.keyframes.splice(ix, 1);
 },
 async refreshSequencerList() {
   if (typeof fetch !== "function") return;
   try {
     const res = await fetch("/api/sequencer");
     const j = await res.json();
     if (Array.isArray(j.timelines)) this.sequencerList = j.timelines;
   } catch (_e) {}
 },
 async saveSequencerTimeline() {
   const raw = (this.sequencerSaveName || "timeline").trim();
   const name = raw.replace(/[^a-zA-Z0-9_-]/g, "");
   if (!name) {
     this.sequencerStatus = "Invalid save name";
     return;
   }
   try {
     const res = await fetch("/api/sequencer/" + encodeURIComponent(name), {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify(this.sequencerPayload()),
     });
     const j = await res.json();
     if (!res.ok) throw new Error(j.error || res.statusText);
     this.sequencerStatus = "Saved " + name;
     await this.refreshSequencerList();
   } catch (e) {
     this.sequencerStatus = String(e.message || e);
   }
 },
 async loadSequencerTimeline() {
   const name = this.sequencerLoadPick;
   if (!name) return;
   try {
     const res = await fetch("/api/sequencer/" + encodeURIComponent(name));
     const j = await res.json();
     if (!res.ok || !j.timeline) throw new Error(j.error || "load failed");
     const tl = j.timeline;
     if (tl.durationSec != null) this.sequencer.durationSec = tl.durationSec;
     if (tl.fps != null) this.sequencer.fps = tl.fps;
     this.sequencer.loop = tl.loop !== false;
     this.sequencer.markers = Array.isArray(tl.markers)
       ? tl.markers
           .map((m) => ({ t: Number(m.t), name: String(m.name || "").trim(), action: m.action || "jump", target: m.target || "" }))
           .filter((m) => m.name && Number.isFinite(m.t))
       : [];
     this.sequencer.tracks = Array.isArray(tl.tracks)
       ? tl.tracks.map((tr) => ({
           id: tr.id || "tr-" + Math.random().toString(36).slice(2),
           param: tr.param,
           keyframes: Array.isArray(tr.keyframes) ? tr.keyframes.slice() : [],
         }))
       : [];
     this.sequencer.clips = this.normalizeSequencerClipsForSave(tl.clips || []);
     const videoClip = this.sequencer.clips.find((c) => c && c.type === 'video');
     this.sequencer.sourceVideo = tl.sourceVideo && typeof tl.sourceVideo === 'object'
       ? tl.sourceVideo
       : (videoClip?.payload || null);
     this.sequencerSelectedClipId = this.sequencer.clips[0] ? this.sequencer.clips[0].id : null;
     this.sequencerSaveName = name;
     this.sequencerSelectedTrackId = this.sequencer.tracks[0] ? this.sequencer.tracks[0].id : null;
     this.clampSequencerPlayhead();
     this.sequencerStatus = "Loaded " + name;
   } catch (e) {
     this.sequencerStatus = String(e.message || e);
   }
 },
 exportSequencerDownload() {
   const json = JSON.stringify(this.sequencerPayload(), null, 2);
   const blob = new Blob([json], { type: "application/json" });
   const base = (this.sequencerSaveName || "sequencer").replace(/[^a-zA-Z0-9_-]/g, "") || "sequencer";
   const a = document.createElement("a");
   a.href = URL.createObjectURL(blob);
   a.download = base + ".json";
   a.click();
   URL.revokeObjectURL(a.href);
 },
async applySequencerToDeforumSettings() {
  const fps = Math.max(1, Number(this.sequencer.fps) || 24);
  const durationSec = Math.max(0.1, Number(this.sequencer.durationSec) || 1);
  const totalFrames = Math.ceil(durationSec * fps);
  const scheduleUpdates = {};
  for (const tr of this.sequencer.tracks) {
    const meta = this.modulationTargets.find((m) => m.key === tr.param);
    const deforumKey = meta?.deforumKey || tr.param;
    if (!tr.keyframes.length) continue;
    const sorted = [...tr.keyframes].sort((a, b) => a.t - b.t);
    const parts = sorted.map((kf) => {
      const frame = Math.round(Math.min(totalFrames, Math.max(0, kf.t * fps)));
      const val = Number.isFinite(kf.v) ? kf.v : 0;
      return `${frame}:(${val.toFixed(4)})`;
    });
    scheduleUpdates[deforumKey] = parts.join(', ');
  }
  if (!Object.keys(scheduleUpdates).length) {
    this.sequencerStatus = 'No keyframed tracks — add tracks/keyframes or Apply a Story first';
    return;
  }
  try {
    const currentSettings = this.deforumSettings || {};
    const merged = { ...currentSettings, ...scheduleUpdates };
    const res = await fetch('/api/deforum/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: merged }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    this.sequencerStatus = `Applied ${Object.keys(scheduleUpdates).length} schedule(s) to Deforum settings`;
    this.loadDeforumSettings({ syncServerModel: false });
  } catch (err) {
    this.sequencerStatus = 'Apply failed: ' + err.message;
  }
},
selectSequencerTrack(trackId) {
  this.sequencerSelectedTrackId = trackId;
},
 sequencerTimeFromJobFrame(frameNumber) {
   const fps = this.sequencerJobFps;
   const total = this.sequencerJobTotalFrames;
   const frame = Math.min(total, Math.max(1, Math.floor(Number(frameNumber) || 1)));
   return (frame - 1) / fps;
 },
 seekSequencerToJobFrame(frameNumber) {
   const dur = Number(this.sequencer.durationSec) || 0;
   const t = Math.min(dur, Math.max(0, this.sequencerTimeFromJobFrame(frameNumber)));
   this.seekSequencer(t);
 },
 seekSequencer(t) {
  this.sequencerPlayhead = Math.min(Math.max(0, Number(t) || 0), Math.max(0.01, Number(this.sequencer.durationSec) || 0.01));
  this.jobPlaybackTimeSec = this.sequencerPlayhead;
  this.previewSequencerFrame();
},
updateSequencerKeyframe({ trackId, keyframe, t, v }) {
  const track = this.sequencer.tracks.find((item) => item.id === trackId);
  if (!track || !keyframe) return;
  keyframe.t = Math.min(Math.max(0, Number(t) || 0), Math.max(0.01, Number(this.sequencer.durationSec) || 0.01));
  keyframe.v = Number(v);
},
 getTrackValueAt(tr, t) {
   const kfs = this.sortedKeyframes(tr);
   if (!kfs.length) return 0;
   if (t <= kfs[0].t) return kfs[0].v;
   if (t >= kfs[kfs.length - 1].t) return kfs[kfs.length - 1].v;
   for (let i = 0; i < kfs.length - 1; i++) {
     if (t >= kfs[i].t && t <= kfs[i + 1].t) {
       const dur = kfs[i + 1].t - kfs[i].t;
       const u = dur > 0 ? (t - kfs[i].t) / dur : 0;
       const a = kfs[i];
       const b = kfs[i + 1];
       if (a.hIn !== undefined || a.hOut !== undefined || b.hIn !== undefined || b.hOut !== undefined) {
         const hOut = a.hOut != null ? a.hOut : 0.33;
         const hIn = b.hIn != null ? b.hIn : 0.67;
         const vOut = a.hOutV != null ? a.hOutV : a.v + (b.v - a.v) * 0.33;
         const vIn = b.hInV != null ? b.hInV : a.v + (b.v - a.v) * 0.67;
         return this.cubicBezier(u, a.v, vOut, vIn, b.v);
       }
       const eased = this.sequencerEaseT(u, a.easing);
       return a.v + (b.v - a.v) * eased;
     }
   }
   return kfs[kfs.length - 1].v;
 },
 drawTimeline() {
   const canvas = this.$refs.timelineCanvas;
   if (!canvas || !this.sequencer.tracks.length) return;
   const ctx = canvas.getContext("2d");
   const dpr = window.devicePixelRatio || 1;
   const rect = canvas.getBoundingClientRect();
   canvas.width = rect.width * dpr;
   canvas.height = Math.max(120, this.sequencer.tracks.length * 40 + 20) * dpr;
   ctx.scale(dpr, dpr);
   const w = rect.width;
   const h = rect.height;
   const dur = Math.max(0.01, Number(this.sequencer.durationSec) || 8);
   const laneH = (h - 20) / Math.max(1, this.sequencer.tracks.length);
   const trackColors = TIMELINE_TRACK_COLORS;
   ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = this.themeColor('--bg-0', 'rgb(8, 9, 13)');
   ctx.fillRect(0, 0, w, h);
   this.sequencer.tracks.forEach((tr, idx) => {
     const y = 20 + idx * laneH;
     const kfs = this.sortedKeyframes(tr);
     if (!kfs.length) {
       ctx.strokeStyle = TIMELINE_GRID_EMPTY;
       ctx.lineWidth = 1;
       ctx.setLineDash([4, 4]);
       ctx.beginPath();
       ctx.moveTo(0, y + laneH / 2);
       ctx.lineTo(w, y + laneH / 2);
       ctx.stroke();
       ctx.setLineDash([]);
       ctx.fillStyle = TIMELINE_GRID_LABEL;
       ctx.font = "10px monospace";
       ctx.fillText(tr.param + " (no keyframes)", 6, y + laneH / 2 + 3);
       return;
     }
     let minV = Math.min(...kfs.map(k => k.v));
     let maxV = Math.max(...kfs.map(k => k.v));
     const range = maxV - minV || 1;
     minV -= range * 0.15;
     maxV += range * 0.15;
     const color = trackColors[idx % trackColors.length];
     ctx.strokeStyle = TIMELINE_GRID_BORDER;
     ctx.lineWidth = 1;
     ctx.strokeRect(0, y, w, laneH);
     ctx.fillStyle = color + "20";
     ctx.fillRect(0, y, w, laneH);
     ctx.strokeStyle = color;
     ctx.lineWidth = 2;
     ctx.beginPath();
     const steps = Math.max(w, 100);
     for (let i = 0; i <= steps; i++) {
       const t = (i / steps) * dur;
       const v = this.getTrackValueAt(tr, t);
       const px = (t / dur) * w;
       const py = y + laneH - ((v - minV) / (maxV - minV)) * laneH;
       if (i === 0) ctx.moveTo(px, py);
       else ctx.lineTo(px, py);
     }
     ctx.stroke();
     kfs.forEach((kf, ki) => {
       const px = (kf.t / dur) * w;
       const v = kf.v;
       const py = y + laneH - ((v - minV) / (maxV - minV)) * laneH;
       if (ki < kfs.length - 1) {
         const next = kfs[ki + 1];
         const hOut = kf.hOut != null ? kf.hOut : 0.33;
         const hIn = next.hIn != null ? next.hIn : 0.67;
         const vOut = kf.hOutV != null ? kf.hOutV : v + (next.v - v) * 0.33;
         const vIn = next.hInV != null ? next.hInV : v + (next.v - v) * 0.67;
         const hasHandles = kf.hIn !== undefined || kf.hOut !== undefined || next.hIn !== undefined || next.hOut !== undefined;
         if (hasHandles) {
           const hOutPx = (kf.t + hOut * (next.t - kf.t)) / dur * w;
           const hOutPy = y + laneH - ((vOut - minV) / (maxV - minV)) * laneH;
           const hInPx = (next.t - (1 - hIn) * (next.t - kf.t)) / dur * w;
           const hInPy = y + laneH - ((vIn - minV) / (maxV - minV)) * laneH;
           ctx.strokeStyle = color + "60";
           ctx.lineWidth = 1;
           ctx.setLineDash([2, 2]);
           ctx.beginPath();
           ctx.moveTo(px, py);
           ctx.lineTo(hOutPx, hOutPy);
           ctx.stroke();
           ctx.beginPath();
           ctx.moveTo((next.t / dur) * w, y + laneH - ((next.v - minV) / (maxV - minV)) * laneH);
           ctx.lineTo(hInPx, hInPy);
           ctx.stroke();
           ctx.setLineDash([]);
          ctx.fillStyle = this.themeColor('--media-text', 'rgb(255, 255, 255)');
           ctx.beginPath();
           ctx.arc(hOutPx, hOutPy, 3, 0, Math.PI * 2);
           ctx.fill();
           ctx.beginPath();
           ctx.arc(hInPx, hInPy, 3, 0, Math.PI * 2);
           ctx.fill();
         }
       }
       ctx.fillStyle = color;
       ctx.beginPath();
       ctx.arc(px, py, 4, 0, Math.PI * 2);
       ctx.fill();
      ctx.fillStyle = this.themeColor('--media-text', 'rgb(255, 255, 255)');
       ctx.beginPath();
       ctx.arc(px, py, 2, 0, Math.PI * 2);
       ctx.fill();
     });
     ctx.fillStyle = TIMELINE_GRID_TEXT;
     ctx.font = "9px monospace";
     ctx.fillText(tr.param, 4, y + 11);
   });
   const markers = (this.sequencer.markers || []);
   markers.forEach(m => {
     const px = (m.t / dur) * w;
    const markerColor = this.themeColor('--error', 'rgb(226, 75, 74)');
     ctx.strokeStyle = markerColor + '80';
     ctx.lineWidth = 1;
     ctx.setLineDash([2, 3]);
     ctx.beginPath();
     ctx.moveTo(px, 20);
     ctx.lineTo(px, h);
     ctx.stroke();
     ctx.setLineDash([]);
     ctx.fillStyle = markerColor;
     ctx.font = "8px monospace";
     ctx.fillText(m.name, px + 3, 14);
   });
   const playX = (this.sequencerPlayhead / dur) * w;
  ctx.strokeStyle = this.themeColor('--media-text', 'rgb(255, 255, 255)');
   ctx.lineWidth = 2;
   ctx.beginPath();
   ctx.moveTo(playX, 20);
   ctx.lineTo(playX, h);
   ctx.stroke();
  ctx.fillStyle = this.themeColor('--media-text', 'rgb(255, 255, 255)');
   ctx.beginPath();
   ctx.moveTo(playX - 5, 20);
   ctx.lineTo(playX + 5, 20);
   ctx.lineTo(playX, 26);
   ctx.closePath();
   ctx.fill();
   for (let i = 0; i <= 4; i++) {
     const t = (dur / 4) * i;
     const px = (t / dur) * w;
     ctx.fillStyle = TIMELINE_GRID_LABEL;
     ctx.font = "8px monospace";
     ctx.fillText(t.toFixed(1) + "s", px + 2, h - 2);
   }
 },
 seekTimeline(event) {
   const canvas = this.$refs.timelineCanvas;
   if (!canvas) return;
   const rect = canvas.getBoundingClientRect();
   const x = event.clientX - rect.left;
   const dur = Math.max(0.01, Number(this.sequencer.durationSec) || 8);
   this.sequencerPlayhead = Math.max(0, Math.min(dur, (x / rect.width) * dur));
   this.drawTimeline();
 },
 hoverTimeline(event) {
   const canvas = this.$refs.timelineCanvas;
   if (!canvas) return;
   const rect = canvas.getBoundingClientRect();
   const x = event.clientX - rect.left;
   const dur = Math.max(0.01, Number(this.sequencer.durationSec) || 8);
   this.timelineHoverTime = Math.max(0, Math.min(dur, (x / rect.width) * dur));
   this.timelineHoverPercent = (x / rect.width) * 100;
 },
 motionPadPuckStyleFor(padKind) {
   const range = padKind === 'look' ? 1 : this.motionMovePadRange;
   const xVal = padKind === 'look'
     ? Number(this.motionPadValues.look_x ?? 0)
     : Number(this.motionPadValues.translation_x || 0);
   const yVal = padKind === 'look'
     ? Number(this.motionPadValues.look_y ?? 0)
     : Number(this.motionPadValues.translation_y || 0);
   const xPct = ((xVal + range) / (range * 2)) * 100;
   const yPct = (1 - ((yVal + range) / (range * 2))) * 100;
   return {
     left: `${Math.min(100, Math.max(0, xPct))}%`,
     top: `${Math.min(100, Math.max(0, yPct))}%`,
   };
 },
 motionPadMouseDown(evt, padKind) {
   this.motionPadDragStart(padKind);
   this.updateMotionPad(evt, padKind, { previewOnly: this.motionSmoothnessActive() });
   evt.preventDefault();
 },
 motionPadDragStart(padId) {
   this.xyPad.dragging = true;
   this.xyPad.activePad = padId;
   this.xyPad.dragStartValues = this.captureMotionPadSnapshotForPad(padId)
     || this.captureMotionPadSnapshot();
 },
 motionPadMouseMove(evt, padKind) {
   if (!this.xyPad.dragging || this.xyPad.activePad !== padKind) return;
   this.updateMotionPad(evt, padKind);
   evt.preventDefault();
 },
 motionPadMouseUp(padKind) {
   const activePad = padKind || this.xyPad.activePad;
   if (this.xyPad.dragging && activePad) {
     const slot = this.motionXYPadSlotById(activePad);
     if (slot && !this.motionPadSpringBack) {
       this.applyMotionPadAxisValues(
         slot.xAxis,
         slot.yAxis,
         this.motionAxisTargetValue(slot.xAxis),
         this.motionAxisTargetValue(slot.yAxis),
         { previewOnly: false },
       );
     } else if (this.motionSmoothnessActive()) {
       this.commitMotionPadDrag(activePad);
     }
   }
   this.xyPad.dragging = false;
   this.xyPad.activePad = null;
   this.xyPad.dragStartValues = null;
 },
 applyMotionPadAxisValues(xAxis, yAxis, x, y, opts = {}) {
   const previewOnly = !!opts.previewOnly;
   this.previewMotionAxis(xAxis, Number(x) || 0);
   this.previewMotionAxis(yAxis, Number(y) || 0);
   const pan = this.liveHudParamByKey('panx');
   const pany = this.liveHudParamByKey('pany');
   if (xAxis === 'translation_x' && pan && this.motionMovePadRange === 1) {
     pan.val = this.motionPadValues.translation_x;
   }
   if (yAxis === 'translation_y' && pany && this.motionMovePadRange === 1) {
     pany.val = this.motionPadValues.translation_y;
   }
   if (!previewOnly) {
     const liveX = this.motionAxisToLiveKey(xAxis);
     const liveY = this.motionAxisToLiveKey(yAxis);
     if (liveX) this.emitMotionLiveParam(liveX, this.motionAxisTargetValue(xAxis));
     if (liveY) this.emitMotionLiveParam(liveY, this.motionAxisTargetValue(yAxis));
   }
   if (!previewOnly && !this.deforumPlaying) this.schedulePreviewFrame();
 },
 applyMotionPadValues(padKind, x, y, opts = {}) {
   const previewOnly = !!opts.previewOnly;
   if (padKind === 'look') {
     this.applyMotionPadAxisValues('angle', 'zoom', x, y, { previewOnly });
     return;
   }
   this.applyMotionPadAxisValues('translation_x', 'translation_y', x, y, { previewOnly });
 },
 xyPadMouseDown(evt) {
   this.motionPadMouseDown(evt, 'move');
 },
 xyPadMouseMove(evt) {
   this.motionPadMouseMove(evt, 'move');
 },
 xyPadMouseUp() {
   this.motionPadMouseUp();
 },
 updateMotionPad(evt, padKind, opts = {}) {
   const pad = evt.currentTarget;
   const rect = pad.getBoundingClientRect();
   let clientX;
   let clientY;
   if (evt.touches && evt.touches.length > 0) {
     clientX = evt.touches[0].clientX;
     clientY = evt.touches[0].clientY;
   } else {
     clientX = evt.clientX;
     clientY = evt.clientY;
   }
   const width = rect.width || this.xyPad.padSize || 1;
   const height = rect.height || this.xyPad.padSize || 1;
   const x = Math.max(0, Math.min(width, clientX - rect.left));
   const y = Math.max(0, Math.min(height, clientY - rect.top));
   const normX = this.clampVal((x / width) * 2 - 1, -1, 1);
   const normY = this.clampVal(1 - (y / height) * 2, -1, 1);
   const previewOnly = !!opts.previewOnly;
   if (padKind === 'look') {
     this.applyMotionPadValues('look', normX, normY, { previewOnly });
   } else {
     const range = this.motionMovePadRange;
     this.applyMotionPadValues('move', normX * range, normY * range, { previewOnly });
   }
 },
 // LoRA management methods
 async refreshLoras() {
  this.lorasLoading = true;
   try {
     const { data } = await apiFetch("/api/loras", {}, "loras list");
     if (data.loras) {
       this.loras.available = data.loras.map((lora) => ({
         id: lora.id || lora.name,
         name: lora.name,
         path: lora.path || "",
         thumbnail: lora.thumbnail || null,
         metadata: lora.metadata || null,
         family: this.detectLoraFamily(lora),
         strength: lora.strength || 1.0,
         selected: false,
         group: null,
       }));
       this.loras.source = data.source || "unknown";
       // Restore selected loras from groups using Map for O(1) lookup
       const loraMap = new Map(this.loras.available.map(l => [l.id, l]));
      this.loras.common.forEach((savedLora) => {
        const found = loraMap.get(savedLora.id);
        if (found) {
          found.selected = true;
          found.group = "COMMON";
          found.strength = savedLora.strength;
        }
      });
      this.loras.groupA.forEach((savedLora) => {
         const found = loraMap.get(savedLora.id);
         if (found) {
           found.selected = true;
           found.group = "A";
           found.strength = savedLora.strength;
         }
       });
       this.loras.groupB.forEach((savedLora) => {
         const found = loraMap.get(savedLora.id);
         if (found) {
           found.selected = true;
           found.group = "B";
           found.strength = savedLora.strength;
         }
       });
     }
   } catch (err) {
     console.error("Failed to load LoRAs", err);
  } finally {
    this.lorasLoading = false;
   }
 },
 toggleLoraSelection(lora) {
   if (lora.selected) {
     this.removeLoraSelection(lora);
   } else {
     lora.selected = true;
    lora.group = "COMMON";
    this.assignLoraToGroup(lora, "COMMON");
   }
 },
 assignLoraToGroup(lora, group) {
  if (group !== "A" && group !== "B" && group !== "COMMON") return;
   
  // Keep each LoRA assigned to exactly one group.
  this.loras.common = this.loras.common.filter((l) => l.id !== lora.id);
   this.loras.groupA = this.loras.groupA.filter((l) => l.id !== lora.id);
   this.loras.groupB = this.loras.groupB.filter((l) => l.id !== lora.id);
   
   // Add to target group
   lora.group = group;
   lora.selected = true;
   const loraData = {
     id: lora.id,
     name: lora.name,
     path: lora.path,
     strength: lora.strength,
     thumbnail: lora.thumbnail,
   };
   
  if (group === "COMMON") {
    this.loras.common.push(loraData);
  } else if (group === "A") {
     this.loras.groupA.push(loraData);
   } else {
     this.loras.groupB.push(loraData);
   }
 },
 removeLoraSelection(lora) {
   lora.selected = false;
   lora.group = null;
  this.loras.common = this.loras.common.filter((l) => l.id !== lora.id);
   this.loras.groupA = this.loras.groupA.filter((l) => l.id !== lora.id);
   this.loras.groupB = this.loras.groupB.filter((l) => l.id !== lora.id);
 },
unassignLora(lora) {
  const available = this.loras.available.find((entry) => entry.id === lora.id);
  if (available) {
    available.selected = false;
    available.group = null;
  }
  this.loras.common = this.loras.common.filter((entry) => entry.id !== lora.id);
  this.loras.groupA = this.loras.groupA.filter((entry) => entry.id !== lora.id);
  this.loras.groupB = this.loras.groupB.filter((entry) => entry.id !== lora.id);
},
 updateLoraStrength(lora) {
   // Update strength in groups as well
  const commonLora = this.loras.common.find((entry) => entry.id === lora.id);
  if (commonLora) {
    commonLora.strength = lora.strength;
  }
   const groupALora = this.loras.groupA.find((l) => l.id === lora.id);
   if (groupALora) {
     groupALora.strength = lora.strength;
   }
   const groupBLora = this.loras.groupB.find((l) => l.id === lora.id);
   if (groupBLora) {
     groupBLora.strength = lora.strength;
   }
 },
updateGroupedLoraStrength(group, lora, value) {
  const next = parseFloat(value);
  if (!Number.isFinite(next)) return;
  const list = group === "COMMON"
    ? this.loras.common
    : group === "B"
      ? this.loras.groupB
      : this.loras.groupA;
  const target = list.find((entry) => entry.id === lora.id);
  if (target) target.strength = next;
  const available = this.loras.available.find((entry) => entry.id === lora.id);
  if (available) {
    available.strength = next;
    available.selected = true;
    available.group = group;
  }
},
 updateCrossfader() {
   const blend = this.loraCrossfaderBlending;
   const t = this.prompts.crossfaderValue;
   this.sendControl("crossfader", {
     value: t,
     loraCrossfaderOn: this.prompts.loraCrossfaderOn,
    common: this.loras.common.map((l) => ({
      ...l,
      effectiveStrength: l.strength,
    })),
     groupA: this.loras.groupA.map((l) => ({
       ...l,
       effectiveStrength: blend ? l.strength * (1 - t) : l.strength,
     })),
     groupB: this.loras.groupB.map((l) => ({
       ...l,
       effectiveStrength: blend ? l.strength * t : l.strength,
     })),
   });
 },
 applyLoras() {
   const blend = this.loraCrossfaderBlending;
   const t = this.prompts.crossfaderValue;
   const payload = {
    common: this.loras.common.map((l) => ({
      name: l.name,
      path: l.path,
      strength: l.strength,
    })),
     groupA: this.loras.groupA.map((l) => ({
       name: l.name,
       path: l.path,
       strength: blend ? l.strength * (1 - t) : l.strength,
     })),
     groupB: this.loras.groupB.map((l) => ({
       name: l.name,
       path: l.path,
       strength: blend ? l.strength * t : l.strength,
     })),
     crossfaderValue: t,
     loraCrossfaderOn: this.prompts.loraCrossfaderOn,
   };
   this.sendControl("loras", payload);
   console.log("Applied LoRAs with crossfader", payload);
 },
 clearAllLoras() {
   this.loras.available.forEach((lora) => {
     lora.selected = false;
     lora.group = null;
   });
  this.loras.common = [];
   this.loras.groupA = [];
   this.loras.groupB = [];
  this.sendControl("loras", { common: [], groupA: [], groupB: [], crossfaderValue: this.prompts.crossfaderValue });
 },

 // ─── Story Generator ─────────────────────────────────────────────────
 _genRnd(arr) {
   return arr[Math.floor(Math.random() * arr.length)];
 },
generatorRequestBody() {
  const style = this.generator.stylePreset === 'custom'
    ? (this.generator.customStyle.trim() || 'Masterpiece, Realistic')
    : this.generator.stylePreset;
  const width = Number(this.deforumSettings && this.deforumSettings.W) || Number((this.generator.resolution || '1024x576').split('x')[0]) || 1024;
  const height = Number(this.deforumSettings && this.deforumSettings.H) || Number((this.generator.resolution || '1024x576').split('x')[1]) || 576;
  const fps = Number(this.sequencer && this.sequencer.fps) || Number(this.framesync && this.framesync.fps) || Number(this.generator.fps) || 24;
  const totalFrames = Number(this.deforumSettings && this.deforumSettings.max_frames) || Number(this.framesync && this.framesync.frameCount) || Number(this.generator.totalFrames) || 96;
  const numScenes = Math.max(2, Number(this.generator.numScenes) || 4);
  return normalizeStoryClientRequest({
    theme: this.generator.theme.trim() || this._genRnd(this.genData.defaultThemes),
    style,
    width,
    height,
    fps,
    totalFrames,
    numScenes,
  });
},
storyMotionDeforumKeyMap() {
  return {
    Zoom: 'zoom',
    'Translation X': 'translation_x',
    'Translation Y': 'translation_y',
    'Transform Center X': 'transform_center_x',
    'Transform Center Y': 'transform_center_y',
    'Rotation 3D X': 'rotation_3d_x',
    'Rotation 3D Y': 'rotation_3d_y',
    'Rotation 3D Z': 'rotation_3d_z',
  };
},
sequencerParamForDeforumKey(deforumKey) {
  if (!deforumKey) return null;
  const target = this.modulationTargets.find((t) => t.deforumKey === deforumKey || t.key === deforumKey);
  return target ? target.key : deforumKey;
},
parseMotionScheduleToKeyframes(schedule, fps) {
  const text = String(schedule || '').trim();
  if (!text) return [];
  const rate = Math.max(1, Number(fps) || 24);
  const keyframes = [];
  for (const part of text.split(',')) {
    const chunk = part.trim();
    if (!chunk) continue;
    const m = chunk.match(/^(\d+)\s*:\s*\(([^)]+)\)\s*$/);
    if (!m) continue;
    const frame = Number(m[1]);
    const expr = m[2].trim();
    let v = Number(expr);
    if (!Number.isFinite(v)) {
      const simple = expr.match(/^-?\d+(?:\.\d+)?/);
      v = simple ? Number(simple[0]) : NaN;
    }
    if (!Number.isFinite(frame) || !Number.isFinite(v)) continue;
    keyframes.push({ t: frame / rate, v });
  }
  return keyframes.sort((a, b) => a.t - b.t);
},
importStoryMotionToSequencer(motion) {
  if (!motion || typeof motion !== 'object') return 0;
  const fps = Math.max(1, Number(this.sequencer.fps) || 24);
  const map = this.storyMotionDeforumKeyMap();
  let count = 0;
  for (const [storyKey, schedule] of Object.entries(motion)) {
    const deforumKey = map[storyKey];
    if (!deforumKey) continue;
    const param = this.sequencerParamForDeforumKey(deforumKey);
    const keyframes = this.parseMotionScheduleToKeyframes(schedule, fps);
    if (!keyframes.length) continue;
    let tr = this.sequencer.tracks.find((t) => t.param === param);
    if (!tr) {
      tr = { id: `tr-story-${param}-${Date.now()}`, param, keyframes: [] };
      this.sequencer.tracks.push(tr);
    }
    tr.keyframes = keyframes;
    count += 1;
  }
  if (count) {
    this.sequencerSelectedTrackId = this.sequencer.tracks[0]?.id || null;
    this.sequencerStatus = `Imported ${count} motion track(s) from story`;
    this.saveSessionState();
  }
  return count;
},
async applyStoryMotionToDeforumSettings(motion) {
  if (!motion || typeof motion !== 'object' || typeof fetch !== 'function') return;
  const map = this.storyMotionDeforumKeyMap();
  const scheduleUpdates = {};
  for (const [storyKey, schedule] of Object.entries(motion)) {
    const deforumKey = map[storyKey];
    if (deforumKey && schedule) scheduleUpdates[deforumKey] = String(schedule);
  }
  if (!Object.keys(scheduleUpdates).length) return;
  try {
    const merged = { ...(this.deforumSettings || {}), ...scheduleUpdates };
    const res = await fetch('/api/deforum/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: merged }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    this.loadDeforumSettings({ syncServerModel: false });
  } catch (err) {
    console.warn('[story] apply motion to deforum failed', err);
  }
},
async generateStory() {
  const g = this.generator;
  g.isGenerating = true;
  g.status = 'Generating story…';
  g.result = null;
  try {
    const payload = this.generatorRequestBody();
    try {
      const { data } = await apiFetch('/api/story/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, 'generate story');
      if (data && data.llmLog) this.applyStoryLlmRequestLog(data.llmLog);
      g.result = data;
      const source = data && data.source && data.source.model ? ` via ${data.source.model}` : '';
      g.status = `Story ready${source} — review and apply below.`;
    } catch (err) {
      await this.persistStoryLlmRequestLog(payload);
      g.result = null;
      g.status = `Story generation failed: ${err.message}`;
    }
  } catch (err) {
    g.status = `Error: ${err.message}`;
  } finally {
    g.isGenerating = false;
  }
 },
 approveStory() {
   if (!this.generator.result) return;
   const { scenes, motion } = this.generator.result;
   this.prompts.pos = JSON.stringify(scenes, null, 2);
   this.sendPrompts();
   this.sendControl('motionSettings', motion);
   void this.applyStoryMotionToDeforumSettings(motion);
   const imported = this.importStoryMotionToSequencer(motion);
   this.generator.result = null;
   this.generator.status = imported
     ? `Applied prompts and ${imported} motion track(s) to sequencer`
     : 'Applied prompts and motion to Deforum';
   this.currentTab = 'PROMPTS';
   setTimeout(() => { this.generator.status = ''; }, 4000);
 },
 rejectStory() {
   this.generator.result = null;
   this.generator.status = 'Discarded.';
   setTimeout(() => { this.generator.status = ''; }, 2000);
 },
 async refreshGeneratorPresets() {
   try {
     const res = await fetch('/api/presets');
     const data = await res.json();
     this.generatorPresets = (data.presets || []).filter(p => p.startsWith('gen-'));
   } catch (err) {
     console.error('Failed to load generator presets', err);
   }
 },
 async loadGeneratorPreset(name) {
   try {
     const res = await fetch(`/api/presets/${name}`);
     const data = await res.json();
     if (data.preset && data.preset.generator) {
       Object.assign(this.generator, data.preset.generator);
       this.generator.result = null;
       this.currentGeneratorPreset = name;
       this.generatorPresetStatus = `Loaded: ${name}`;
       setTimeout(() => { this.generatorPresetStatus = ''; }, 3000);
     }
   } catch (err) {
     this.generatorPresetStatus = `Error: ${err.message}`;
   }
 },
 async saveGeneratorPreset() {
   const raw = (this.newGeneratorPresetName || 'default').replace(/[^a-zA-Z0-9_-]/g, '-');
   const name = `gen-${raw}`;
   const preset = {
     generator: {
       theme: this.generator.theme,
       stylePreset: this.generator.stylePreset,
       customStyle: this.generator.customStyle,
       fps: this.generator.fps,
       resolution: this.generator.resolution,
       totalFrames: this.generator.totalFrames,
       numScenes: this.generator.numScenes,
     },
   };
   try {
     const res = await fetch(`/api/presets/${name}`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(preset),
     });
     const data = await res.json();
     if (data.ok) {
       this.currentGeneratorPreset = name;
       this.newGeneratorPresetName = '';
       this.generatorPresetStatus = `Saved: ${name}`;
       await this.refreshGeneratorPresets();
       setTimeout(() => { this.generatorPresetStatus = ''; }, 3000);
     }
   } catch (err) {
     this.generatorPresetStatus = `Error: ${err.message}`;
   }
 },
 async deleteGeneratorPreset(name) {
   if (!confirm(`Delete preset "${name}"?`)) return;
   try {
     await fetch(`/api/presets/${name}`, { method: 'DELETE' });
     this.currentGeneratorPreset = null;
     this.generatorPresetStatus = `Deleted: ${name}`;
     await this.refreshGeneratorPresets();
     setTimeout(() => { this.generatorPresetStatus = ''; }, 3000);
   } catch (err) {
     this.generatorPresetStatus = `Error: ${err.message}`;
   }
 },

 // ─── Performance deck (crossfader, preview, session) ─────────────────
 sessionStorageKey() {
   return `defora_session_${this.session || 'default'}`;
 },
sessionStorageTouchedKey() {
  return `${this.sessionStorageKey()}__touchedAt`;
},
sessionRestoreDeclinedKey() {
  return `${this.sessionStorageKey()}__restoreDeclinedAt`;
},
hasSessionRestoreDeclined({ now = Date.now(), maxAgeMs = 24 * 60 * 60 * 1000 } = {}) {
  try {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    const raw = storage.getItem(this.sessionRestoreDeclinedKey());
    const declinedAt = raw != null ? Number(raw) : NaN;
    return Number.isFinite(declinedAt) && declinedAt > 0 && (now - declinedAt) <= maxAgeMs;
  } catch (_e) {
    return false;
  }
},
markSessionRestoreDeclined() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(this.sessionRestoreDeclinedKey(), String(Date.now()));
    }
  } catch (_e) {}
},
clearSessionRestoreDeclined() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(this.sessionRestoreDeclinedKey());
    }
  } catch (_e) {}
},
hasRecentSessionResumeToken({ now = Date.now(), maxAgeMs = 24 * 60 * 60 * 1000 } = {}) {
  try {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    const touchedRaw = storage.getItem(this.sessionStorageTouchedKey());
    const touchedAt = touchedRaw != null ? Number(touchedRaw) : NaN;
    const fresh = Number.isFinite(touchedAt) && touchedAt > 0 && (now - touchedAt) <= maxAgeMs;
    if (!fresh) return false;

    // "cookie or similar": accept either an actual cookie or our localStorage touch marker.
    // If a cookie exists, great; if not, the touch marker still counts as "similar".
    try {
      const cookie = (typeof document !== 'undefined' && document.cookie) ? String(document.cookie) : '';
      if (!cookie) return true;
      const sessionName = String(this.session || 'default');
      return cookie.includes('defora_session=') || cookie.includes(`defora_session_${sessionName}=`) || cookie.includes('defora=');
    } catch (_e) {
      return true;
    }
  } catch (_e) {
    return false;
  }
},
 loadSessionState() {
   try {
     const raw = window.localStorage && window.localStorage.getItem(this.sessionStorageKey());
    const sourceRaw = this.pendingSessionStateRaw || raw;
    if (!sourceRaw) return;
    const s = JSON.parse(sourceRaw);
    this.pendingSessionStateRaw = '';
    this.sessionDeforumSettingsLoaded = false;
     if (typeof s.crossfader === 'number') this.performance.crossfader = s.crossfader;
     if (typeof s.genericPrompt === 'string') this.performance.genericPrompt = s.genericPrompt;
     if (Array.isArray(s.slots)) this.performance.slots = s.slots;
     if (typeof s.runsBrowserTab === 'string' && (s.runsBrowserTab === 'active' || s.runsBrowserTab === 'past' || s.runsBrowserTab === 'frames')) {
       this.runsBrowserTab = s.runsBrowserTab;
     } else if (s.showFrames === true) {
       this.runsBrowserTab = 'frames';
     }
     if (typeof s.showFrames === 'boolean') this.showFrames = s.showFrames;
     if (typeof s.rightPanelOpen === 'boolean') {
       this.rightPanelOpen = s.rightPanelOpen;
     } else if (typeof s.liveDrawerOpen === 'boolean') {
       // Legacy session key from pre-rename drawer state
       this.rightPanelOpen = s.liveDrawerOpen;
     }
     if (s.sidePanelDock === 'auto' || s.sidePanelDock === 'edge' || s.sidePanelDock === 'video') {
       this.sidePanelDock = s.sidePanelDock;
     }
     if (typeof s.liveEngineDrawerOpen === 'boolean') this.liveEngineDrawerOpen = s.liveEngineDrawerOpen;
    if (typeof s.layersSidebarOpen === 'boolean') this.layersSidebarOpen = s.layersSidebarOpen;
    if (typeof s.liveBottomDrawerOpen === 'boolean') this.liveBottomDrawerOpen = s.liveBottomDrawerOpen;
    if (typeof s.liveBottomDrawerTab === 'string' && (s.liveBottomDrawerTab === 'MODULATION' || s.liveBottomDrawerTab === 'CROSSFADER' || s.liveBottomDrawerTab === 'SYSTEM')) {
      this.liveBottomDrawerTab = s.liveBottomDrawerTab;
    }
    if (s.currentSubTab && s.currentSubTab.LIVE) {
      this.currentSubTab.LIVE = this.normalizeLiveSubTab(s.currentSubTab.LIVE);
    }
    if (s.currentSubTab && s.currentSubTab.MOTION) {
      this.currentSubTab.MOTION = this.normalizeMotionSubTab(s.currentSubTab.MOTION);
    }
    if (Array.isArray(s.liveSources)) this.liveSources = s.liveSources;
    if (s.liveSourcePanel === 'library' || s.liveSourcePanel === 'cloud') this.liveSourcePanel = s.liveSourcePanel;
    if (typeof s.activeVideoLayerId === 'string') this.activeVideoLayerId = s.activeVideoLayerId;
    if (typeof s.videoLayerAddOpen === 'boolean') this.videoLayerAddOpen = s.videoLayerAddOpen;
    if (typeof s.inputLayerPlaybackUrl === 'string') this.inputLayerPlaybackUrl = s.inputLayerPlaybackUrl;
    if (typeof s.inputLayerLabel === 'string') this.inputLayerLabel = s.inputLayerLabel;
    if (s.videoStageSize === 'small' || s.videoStageSize === 'medium' || s.videoStageSize === 'full') {
      this.videoStageSize = s.videoStageSize;
    }
     if (typeof s.liveAnimationBoxOpen === 'boolean') {
       this.liveAnimationBoxOpen = s.liveAnimationBoxOpen;
       this.enginePanelDetailsOpen = s.liveAnimationBoxOpen;
     }
     if (typeof s.enginePanelDetailsOpen === 'boolean') {
       this.enginePanelDetailsOpen = s.enginePanelDetailsOpen;
       this.liveAnimationBoxOpen = s.enginePanelDetailsOpen;
     }
     if (s.enginePanelDetailsTab === 'ENGINE' || s.enginePanelDetailsTab === 'JOB') {
       this.enginePanelDetailsTab = s.enginePanelDetailsTab;
     }
     if (s.videoLayerPreviewVisible && typeof s.videoLayerPreviewVisible === 'object') {
       const map = s.videoLayerPreviewVisible;
       (this.videoLayers || []).forEach((layer) => {
         if (layer && Object.prototype.hasOwnProperty.call(map, layer.id)) {
           layer.previewVisible = map[layer.id] !== false;
         }
       });
     }
     if (s.videoLayerOpacity && typeof s.videoLayerOpacity === 'object') {
       const map = s.videoLayerOpacity;
       (this.videoLayers || []).forEach((layer) => {
         if (layer && Object.prototype.hasOwnProperty.call(map, layer.id)) {
           const raw = Number(map[layer.id]);
           if (Number.isFinite(raw)) layer.opacity = Math.max(0, Math.min(1, raw));
         }
       });
     }
    if (s.cloudDriveDraft && typeof s.cloudDriveDraft === 'object') {
      this.cloudDriveDraft = {
        url: String(s.cloudDriveDraft.url || ''),
        provider: String(s.cloudDriveDraft.provider || 'google_drive'),
      };
    }
    if (s.systemFiles && typeof s.systemFiles === 'object') {
      const sf = s.systemFiles;
      this.systemFiles = {
        ...this.systemFiles,
        rootId: typeof sf.rootId === 'string' ? sf.rootId : this.systemFiles.rootId,
        recursive: typeof sf.recursive === 'boolean' ? sf.recursive : this.systemFiles.recursive,
        viewMode: sf.viewMode === 'videos-only' ? 'videos-only' : 'browse',
        showFilenames: typeof sf.showFilenames === 'boolean' ? sf.showFilenames : this.systemFiles.showFilenames,
        sortKey: typeof sf.sortKey === 'string' ? sf.sortKey : this.systemFiles.sortKey,
        zoomLevel: Number.isFinite(Number(sf.zoomLevel)) ? sf.zoomLevel : this.systemFiles.zoomLevel,
        roots: [],
        currentPath: '',
        parent: '',
        folders: [],
        videos: [],
        folderCount: null,
        videoCount: null,
        loading: false,
        status: '',
        selectedPaths: Array.isArray(sf.selectedPaths) ? sf.selectedPaths : [],
        fullscreenIndex: -1,
        _rootsLoaded: false,
      };
    }
    if (typeof s.hlsWatchEnabled === 'boolean') {
      this.hlsWatchEnabled = s.hlsWatchEnabled;
      if (this.hlsWatchEnabled) {
        this.$nextTick(() => this.attachPlayer());
      }
    }
    if (typeof s.libraryFullscreen === 'boolean') this.libraryFullscreen = s.libraryFullscreen;
    if (typeof s.libraryWorkspaceOpen === 'boolean') {
      this.libraryWorkspaceOpen = s.libraryWorkspaceOpen;
      if (s.libraryWorkspacePane === 'editor' || s.libraryWorkspacePane === 'browser') {
        this.libraryWorkspacePane = s.libraryWorkspacePane;
      }
    } else if (typeof s.libraryEditorOpen === 'boolean' && s.libraryEditorOpen) {
      this.libraryWorkspaceOpen = true;
      this.libraryWorkspacePane = 'editor';
    }
    if (s.librarySubTab === 'RUNS' || s.librarySubTab === 'BROWSER') {
      this.librarySubTab = s.librarySubTab === 'RUNS' ? 'BROWSER' : s.librarySubTab;
    }
    if (typeof s.editorFreecutRoute === 'string') this.editorFreecutRoute = s.editorFreecutRoute;
    if (typeof s.editorPendingImportPath === 'string') this.editorPendingImportPath = s.editorPendingImportPath;
    if (typeof s.editorPendingImportRootId === 'string') this.editorPendingImportRootId = s.editorPendingImportRootId;
    if (typeof s.editorPendingImportUrl === 'string') this.editorPendingImportUrl = s.editorPendingImportUrl;
    if (typeof s.runsAutoRefresh === 'boolean') this.runsAutoRefresh = s.runsAutoRefresh;
    if (Number.isFinite(Number(s.runsPollIntervalSec))) {
      this.runsPollIntervalSec = Math.max(2, Math.min(60, Number(s.runsPollIntervalSec)));
    }
     if (typeof s.paramPanelOpen === 'boolean') this.paramPanelOpen = s.paramPanelOpen;
     if (typeof s.deforumPanelOpen === 'boolean') this.deforumPanelOpen = s.deforumPanelOpen;
    if (typeof s.deforumActiveTab === 'string') {
      const layerIds = DEFORUM_LAYER_FIELD_GROUPS.map((g) => g.id);
      this.deforumActiveTab = layerIds.includes(s.deforumActiveTab)
        ? s.deforumActiveTab
        : (s.deforumActiveTab === 'sampling' ? 'canvas' : 'canvas');
    }
    if (typeof s.deforumControlTab === 'string' && ['settings', 'controlnet', 'motion', 'macros'].includes(s.deforumControlTab)) {
      this.deforumControlTab = s.deforumControlTab;
    }
    if (Number.isFinite(Number(s.deforumActiveCnUnit))) {
      const unit = Math.round(Number(s.deforumActiveCnUnit));
      if (unit >= 1 && unit <= DEFORUM_CN_SLOT_COUNT) this.deforumActiveCnUnit = unit;
    }
     if (typeof s.generateDockExpanded === 'boolean') this.generateDockExpanded = s.generateDockExpanded;
    if (typeof s.motionSequencerSideOpen === 'boolean') this.motionSequencerSideOpen = s.motionSequencerSideOpen;
    if (s.deforumFieldEnabled && typeof s.deforumFieldEnabled === 'object') {
      this.deforumFieldEnabled = createDeforumFieldEnabledMap(s.deforumFieldEnabled);
    } else {
      this.deforumFieldEnabled = createDeforumFieldEnabledMap();
    }
    if (typeof s.collabEnabled === 'boolean') {
      this.collabEnabled = s.collabEnabled;
      this.wsStatus = s.collabEnabled ? this.wsStatus : 'offline';
    }
    if (s.defaultAnimation && typeof s.defaultAnimation === 'object') {
      this.defaultAnimation = this.normalizeDefaultAnimationSettings(s.defaultAnimation);
    }
     if (s.deforumSettings && typeof s.deforumSettings === 'object') {
       this.deforumSettings = mergeDeforumSettings({ ...DEFORUM_DEFAULT_SETTINGS }, s.deforumSettings);
       this.deforumSettings = this.normalizedDeforumSettings();
       this.syncResolutionAcrossControls(this.deforumSettings.W, this.deforumSettings.H, { syncGpuModal: false });
       this.syncStepsAcrossControls(this.deforumSettings.steps, { syncGpuModal: false });
       this.syncDeforumSettingsJson();
      this.sessionDeforumSettingsLoaded = true;
     }
    if (Array.isArray(s.deforumContinuationCheckpoints)) {
      this.deforumContinuationCheckpoints = s.deforumContinuationCheckpoints
        .map((entry) => normalizeContinuationCheckpoint(entry))
        .filter(Boolean);
    }
     if (s.lastModel) {
       this.forge.lastModel = s.lastModel;
       this.forge.selectedModel = s.lastModel;
     }
     if (s.streaming && typeof s.streaming === 'object') {
       if (Array.isArray(s.streaming.destinations) && s.streaming.destinations.length) {
         this.streaming.destinations = s.streaming.destinations.map((dest, index) =>
           this.normalizeStreamDestination(dest, index)
         );
       }
       if (typeof s.streaming.activeDestinationId === 'string' || s.streaming.activeDestinationId === null) {
         this.streaming.activeDestinationId = s.streaming.activeDestinationId;
       }
       if (typeof s.streaming.status === 'string') {
         this.streaming.status = s.streaming.status;
       }
     }
     if (s.prompts) Object.assign(this.prompts, s.prompts);
    if (typeof s.activePromptStyleId === 'string' || s.activePromptStyleId === null) {
      this.activePromptStyleId = s.activePromptStyleId;
    }
    if (typeof s.promptStyleAutoExample === 'boolean') {
      this.promptStyleAutoExample = s.promptStyleAutoExample;
    }
    if (s.lcmEngine && typeof s.lcmEngine === 'object') {
      this.lcmEngine = {
        enabled: !!s.lcmEngine.enabled,
        steps: Math.max(1, Math.round(Number(s.lcmEngine.steps) || DEFAULT_LCM_ENGINE.steps)),
        loraTag: String(s.lcmEngine.loraTag || DEFAULT_LCM_LORA_TAG).trim() || DEFAULT_LCM_LORA_TAG,
      };
      if (this.lcmEngine.enabled) this.applyLcmEngineToDeforum({ saveSession: false });
    }
    if (s.wanEngine && typeof s.wanEngine === 'object') {
      this.wanEngine = normalizeWanEngine(s.wanEngine);
    }
    if (s.animateLcmEngine && typeof s.animateLcmEngine === 'object') {
      this.animateLcmEngine = normalizeAnimateLcmEngine(s.animateLcmEngine);
    }
    if (s.svdEngine && typeof s.svdEngine === 'object') {
      this.svdEngine = normalizeSvdEngine(s.svdEngine);
    }
    if (Array.isArray(s.engineSettingsSlots)) {
      this.engineSettingsSlots = normalizeEngineSettingsSlots(s.engineSettingsSlots);
    }
    if (s.motionSmoothness && typeof s.motionSmoothness === 'object') {
      this.motionSmoothness.enabled = !!s.motionSmoothness.enabled;
      const frames = Math.round(Number(s.motionSmoothness.frames));
      this.motionSmoothness.frames = Number.isFinite(frames) ? Math.max(1, Math.min(999, frames)) : 1;
    }
    if (typeof s.motionPadSpringBack === 'boolean') {
      this.motionPadSpringBack = s.motionPadSpringBack;
    }
    if (Number.isFinite(Number(s.seedFixedBackup)) && Number(s.seedFixedBackup) >= 0) {
      this.seedFixedBackup = Number(s.seedFixedBackup);
    }
   } catch (_e) { /* ignore */ }
 },
 saveSessionState() {
   try {
     if (!window.localStorage) return;
     const blob = {
       crossfader: this.performance.crossfader,
       genericPrompt: this.performance.genericPrompt,
       slots: this.performance.slots,
      showFrames: this.showFrames,
      runsBrowserTab: this.runsBrowserTab,
      rightPanelOpen: this.rightPanelOpen,
      sidePanelDock: this.sidePanelDock,
      liveEngineDrawerOpen: this.liveEngineDrawerOpen,
      layersSidebarOpen: this.layersSidebarOpen,
      liveBottomDrawerOpen: this.liveBottomDrawerOpen,
      liveBottomDrawerTab: this.liveBottomDrawerTab,
      currentSubTab: { ...this.currentSubTab },
      liveSources: this.liveSources,
      liveSourcePanel: this.liveSourcePanel,
      activeVideoLayerId: this.activeVideoLayerId,
      videoLayerAddOpen: this.videoLayerAddOpen,
      inputLayerPlaybackUrl: this.inputLayerPlaybackUrl,
      inputLayerLabel: this.inputLayerLabel,
      videoStageSize: this.videoStageSize,
      liveAnimationBoxOpen: this.liveAnimationBoxOpen,
      enginePanelDetailsOpen: this.enginePanelDetailsOpen,
      enginePanelDetailsTab: this.enginePanelDetailsTab,
      videoLayerPreviewVisible: Object.fromEntries(
        (this.videoLayers || [])
          .filter((layer) => layer && layer.builtin)
          .map((layer) => [layer.id, layer.previewVisible !== false]),
      ),
      videoLayerOpacity: Object.fromEntries(
        (this.videoLayers || [])
          .filter((layer) => layer && layer.builtin)
          .map((layer) => [layer.id, this.readVideoLayerOpacity(layer)]),
      ),
      cloudDriveDraft: { ...this.cloudDriveDraft },
      systemFiles: {
        rootId: this.systemFiles.rootId,
        recursive: this.systemFiles.recursive,
        viewMode: this.systemFiles.viewMode,
        showFilenames: this.systemFiles.showFilenames,
        sortKey: this.systemFiles.sortKey,
        zoomLevel: this.systemFiles.zoomLevel,
      },
      libraryFullscreen: this.libraryFullscreen,
      libraryWorkspaceOpen: this.libraryWorkspaceOpen,
      libraryWorkspacePane: this.libraryWorkspacePane,
      libraryEditorOpen: this.libraryEditorOpen,
      librarySubTab: this.librarySubTab,
      editorFreecutRoute: this.editorFreecutRoute,
      editorPendingImportPath: this.editorPendingImportPath,
      editorPendingImportRootId: this.editorPendingImportRootId,
      editorPendingImportUrl: this.editorPendingImportUrl,
      runsAutoRefresh: this.runsAutoRefresh,
      runsPollIntervalSec: this.runsPollIntervalSec,
       paramPanelOpen: this.paramPanelOpen,
       deforumPanelOpen: this.deforumPanelOpen,
      deforumActiveTab: this.deforumActiveTab,
      deforumControlTab: this.deforumControlTab,
      deforumActiveCnUnit: this.deforumActiveCnUnit,
      deforumFieldEnabled: createDeforumFieldEnabledMap(this.deforumFieldEnabled),
      generateDockExpanded: this.generateDockExpanded,
      motionSequencerSideOpen: this.motionSequencerSideOpen,
      collabEnabled: this.collabEnabled,
      hlsWatchEnabled: !!this.hlsWatchEnabled,
      streaming: {
        destinations: this.streaming.destinations,
        activeDestinationId: this.streaming.activeDestinationId,
        status: this.streaming.status,
      },
      defaultAnimation: this.normalizeDefaultAnimationSettings(this.defaultAnimation),
      deforumSettings: this.normalizedDeforumSettings(),
       lastModel: this.forge.lastModel || this.forge.currentModel || this.forge.selectedModel,
       prompts: { pos: this.prompts.pos, neg: this.prompts.neg },
      activePromptStyleId: this.activePromptStyleId,
      promptStyleAutoExample: this.promptStyleAutoExample,
      lcmEngine: {
        enabled: !!(this.lcmEngine && this.lcmEngine.enabled),
        steps: Math.max(1, Math.round(Number(this.lcmEngine && this.lcmEngine.steps) || 1)),
        loraTag: String((this.lcmEngine && this.lcmEngine.loraTag) || DEFAULT_LCM_LORA_TAG).trim() || DEFAULT_LCM_LORA_TAG,
      },
      wanEngine: normalizeWanEngine(this.wanEngine),
      animateLcmEngine: normalizeAnimateLcmEngine(this.animateLcmEngine),
      svdEngine: normalizeSvdEngine(this.svdEngine),
      engineSettingsSlots: normalizeEngineSettingsSlots(this.engineSettingsSlots),
      motionSmoothness: {
        enabled: !!(this.motionSmoothness && this.motionSmoothness.enabled),
        frames: Math.max(1, Math.round(Number(this.motionSmoothness && this.motionSmoothness.frames) || 1)),
      },
      motionPadSpringBack: !!this.motionPadSpringBack,
      seedFixedBackup: Number.isFinite(Number(this.seedFixedBackup)) && this.seedFixedBackup >= 0
        ? this.seedFixedBackup
        : null,
      deforumContinuationCheckpoints: Array.isArray(this.deforumContinuationCheckpoints)
        ? this.deforumContinuationCheckpoints
        : [],
     };
     window.localStorage.setItem(this.sessionStorageKey(), JSON.stringify(blob));
    window.localStorage.setItem(this.sessionStorageTouchedKey(), String(Date.now()));
   } catch (_e) { /* ignore */ }
 },
getCurrentSessionSnapshotRaw() {
  try {
    if (typeof window === 'undefined') return '';
    if (!window.localStorage) return '';
    // mirror saveSessionState payload
    const blob = {
      crossfader: this.performance.crossfader,
      genericPrompt: this.performance.genericPrompt,
      slots: this.performance.slots,
      showFrames: this.showFrames,
      runsBrowserTab: this.runsBrowserTab,
      rightPanelOpen: this.rightPanelOpen,
      sidePanelDock: this.sidePanelDock,
      liveEngineDrawerOpen: this.liveEngineDrawerOpen,
      currentSubTab: { ...this.currentSubTab },
      liveSources: this.liveSources,
      liveSourcePanel: this.liveSourcePanel,
      activeVideoLayerId: this.activeVideoLayerId,
      videoLayerAddOpen: this.videoLayerAddOpen,
      inputLayerPlaybackUrl: this.inputLayerPlaybackUrl,
      inputLayerLabel: this.inputLayerLabel,
      videoStageSize: this.videoStageSize,
      liveAnimationBoxOpen: this.liveAnimationBoxOpen,
      enginePanelDetailsOpen: this.enginePanelDetailsOpen,
      enginePanelDetailsTab: this.enginePanelDetailsTab,
      videoLayerPreviewVisible: Object.fromEntries(
        (this.videoLayers || [])
          .filter((layer) => layer && layer.builtin)
          .map((layer) => [layer.id, layer.previewVisible !== false]),
      ),
      videoLayerOpacity: Object.fromEntries(
        (this.videoLayers || [])
          .filter((layer) => layer && layer.builtin)
          .map((layer) => [layer.id, this.readVideoLayerOpacity(layer)]),
      ),
      cloudDriveDraft: { ...this.cloudDriveDraft },
      systemFiles: {
        rootId: this.systemFiles.rootId,
        recursive: this.systemFiles.recursive,
        viewMode: this.systemFiles.viewMode,
        showFilenames: this.systemFiles.showFilenames,
        sortKey: this.systemFiles.sortKey,
        zoomLevel: this.systemFiles.zoomLevel,
      },
      libraryFullscreen: this.libraryFullscreen,
      libraryWorkspaceOpen: this.libraryWorkspaceOpen,
      libraryWorkspacePane: this.libraryWorkspacePane,
      libraryEditorOpen: this.libraryEditorOpen,
      librarySubTab: this.librarySubTab,
      editorFreecutRoute: this.editorFreecutRoute,
      editorPendingImportPath: this.editorPendingImportPath,
      editorPendingImportRootId: this.editorPendingImportRootId,
      editorPendingImportUrl: this.editorPendingImportUrl,
      paramPanelOpen: this.paramPanelOpen,
      deforumPanelOpen: this.deforumPanelOpen,
      deforumActiveTab: this.deforumActiveTab,
      deforumControlTab: this.deforumControlTab,
      deforumActiveCnUnit: this.deforumActiveCnUnit,
      deforumFieldEnabled: createDeforumFieldEnabledMap(this.deforumFieldEnabled),
      generateDockExpanded: this.generateDockExpanded,
      motionSequencerSideOpen: this.motionSequencerSideOpen,
      collabEnabled: this.collabEnabled,
      hlsWatchEnabled: !!this.hlsWatchEnabled,
      streaming: {
        destinations: this.streaming.destinations,
        activeDestinationId: this.streaming.activeDestinationId,
        status: this.streaming.status,
      },
      defaultAnimation: this.normalizeDefaultAnimationSettings(this.defaultAnimation),
      deforumSettings: this.normalizedDeforumSettings(),
      lastModel: this.forge.lastModel || this.forge.currentModel || this.forge.selectedModel,
      prompts: { pos: this.prompts.pos, neg: this.prompts.neg },
      activePromptStyleId: this.activePromptStyleId,
      promptStyleAutoExample: this.promptStyleAutoExample,
      lcmEngine: {
        enabled: !!(this.lcmEngine && this.lcmEngine.enabled),
        steps: Math.max(1, Math.round(Number(this.lcmEngine && this.lcmEngine.steps) || 1)),
        loraTag: String((this.lcmEngine && this.lcmEngine.loraTag) || DEFAULT_LCM_LORA_TAG).trim() || DEFAULT_LCM_LORA_TAG,
      },
      wanEngine: normalizeWanEngine(this.wanEngine),
      animateLcmEngine: normalizeAnimateLcmEngine(this.animateLcmEngine),
      svdEngine: normalizeSvdEngine(this.svdEngine),
      engineSettingsSlots: normalizeEngineSettingsSlots(this.engineSettingsSlots),
      motionSmoothness: {
        enabled: !!(this.motionSmoothness && this.motionSmoothness.enabled),
        frames: Math.max(1, Math.round(Number(this.motionSmoothness && this.motionSmoothness.frames) || 1)),
      },
      deforumContinuationCheckpoints: Array.isArray(this.deforumContinuationCheckpoints)
        ? this.deforumContinuationCheckpoints
        : [],
    };
    return JSON.stringify(blob);
  } catch (_e) {
    return '';
  }
},
checkAndPromptSessionRestore() {
  try {
    if (typeof window === 'undefined') return false;
    const storage = window.localStorage;
    if (!storage) return false;
    const savedRaw = storage.getItem(this.sessionStorageKey());
    if (!savedRaw) return false;

    // Only offer session continuation if we have a recent "resume token" (cookie or similar)
    // and the saved session is not older than 24h.
    if (!this.hasRecentSessionResumeToken()) {
      // Stale or no token: don't restore, don't prompt.
      try {
        storage.removeItem(this.sessionStorageKey());
        storage.removeItem(this.sessionStorageTouchedKey());
        storage.removeItem(this.sessionRestoreDeclinedKey());
      } catch (_e) {}
      return true;
    }

    if (this.hasSessionRestoreDeclined()) {
      return false;
    }

    const currentRaw = this.getCurrentSessionSnapshotRaw();
    if (!currentRaw) return false;
    // If it differs, prompt instead of auto-restoring.
    if (savedRaw !== currentRaw) {
      this.pendingSessionStateRaw = savedRaw;
      this.restoreSessionPromptOpen = true;
      return true;
    }
    return false;
  } catch (_e) {
    return false;
  }
},
onRestoreSessionBackdropClick(event) {
  if (event && event.target === event.currentTarget) {
    this.dismissSessionRestore(false);
  }
},
dismissSessionRestore(shouldRestore) {
  try {
    this.restoreSessionPromptOpen = false;
    if (shouldRestore) {
      this.clearSessionRestoreDeclined();
      // Apply saved state
      this.loadSessionState();
    } else {
      // Remember decline so we don't prompt again for this session window.
      this.markSessionRestoreDeclined();
      // Overwrite saved state with current, so we won't prompt again.
      this.saveSessionState();
    }
  } catch (_e) {
    this.restoreSessionPromptOpen = false;
  }
},
normalizedDeforumSettings() {
  const merged = mergeDeforumSettings({ ...DEFORUM_DEFAULT_SETTINGS }, this.deforumSettings || {});
  if (!String(merged.init_image || '').trim()) {
    merged.use_init = false;
  }
  return merged;
},
deforumContinuationStartFrameValue() {
  return deforumContinuationStartFrame(this.frameStripThumbs, {
    fallback: 0,
    initImage: this.deforumSettings && this.deforumSettings.init_image,
  });
},
persistDeforumContinuationFromLatest({ queueSave = true, saveSession = true, checkpoint = false } = {}) {
  const thumb = lastGeneratedThumb(this.frameStripThumbs);
  if (!thumb) return false;
  return this.persistDeforumContinuationFromThumb(thumb, { queueSave, saveSession, checkpoint });
},
persistDeforumContinuationFromThumb(thumb, { queueSave = true, saveSession = true, checkpoint = false } = {}) {
  const patch = buildDeforumContinuationPatch(thumb);
  if (!patch || !this.deforumSettings) return false;
  this.deforumSettings = { ...this.deforumSettings, ...patch };
  this.syncDeforumSettingsJson();
  if (checkpoint) this.recordDeforumContinuationCheckpoint(thumb);
  if (saveSession) this.saveSessionState();
  if (queueSave) this.queueDeforumSettingsSave();
  return true;
},
recordDeforumContinuationCheckpoint(thumb = null) {
  const entry = continuationCheckpointFromThumb(
    thumb || lastGeneratedThumb(this.frameStripThumbs),
    this.frameStripThumbs.length,
  );
  if (!entry) return false;
  this.deforumContinuationCheckpoints = pushContinuationCheckpoint(
    this.deforumContinuationCheckpoints,
    entry,
  );
  return true;
},
undoDeforumContinuationSegment() {
  if (this.deforumPlaying) {
    this.performance.status = 'Pause animation before undoing a segment';
    return false;
  }
  const { stack, restored } = popContinuationForUndo(this.deforumContinuationCheckpoints);
  if (!restored) {
    this.deforumSettingsStatus = 'Nothing to undo';
    return false;
  }
  this.deforumContinuationCheckpoints = stack;
  const trimmed = trimThumbsToContinuationFrame(this.thumbs || [], restored.frame);
  this.thumbs = trimmed;
  this.saveCachedFrameThumbs(trimmed);
  this.deforumSettings = {
    ...this.deforumSettings,
    init_image: restored.init_image,
    use_init: restored.use_init,
  };
  this.syncDeforumSettingsJson();
  const idx = trimmed.findIndex((t) => parseFrameNumberFromThumb(t) === restored.frame);
  if (idx >= 0) this.selectFrame(idx, { scroll: true });
  const path = restored.init_image;
  if (path) {
    this.heldPreviewFramePath = path;
    this.performance.lastPreviewPath = path;
    this.generator.lastPath = path;
  }
  this.sendControl('liveParam', { start_frame: restored.frame, should_resume: 1 });
  this.deforumSettingsStatus = `Undone to frame ${restored.frame} — change settings and press Play to redo`;
  this.performance.status = this.deforumSettingsStatus;
  this.queueDeforumSettingsSave();
  this.saveSessionState();
  this.syncDeforumBackdropToWebGL();
  return true;
},
currentResolution({ fallbackWidth = 1024, fallbackHeight = 576 } = {}) {
  const width = Number(this.deforumSettings && this.deforumSettings.W)
    || Number(this.forge && this.forge.options && this.forge.options.width)
    || Number(this.img2img && this.img2img.width)
    || Number((this.generator && this.generator.resolution ? this.generator.resolution : '').split('x')[0])
    || fallbackWidth;
  const height = Number(this.deforumSettings && this.deforumSettings.H)
    || Number(this.forge && this.forge.options && this.forge.options.height)
    || Number(this.img2img && this.img2img.height)
    || Number((this.generator && this.generator.resolution ? this.generator.resolution : '').split('x')[1])
    || fallbackHeight;
  return { width, height };
},
syncResolutionAcrossControls(rawWidth, rawHeight, {
  syncDeforum = true,
  syncForge = true,
  syncImg2img = true,
  syncGenerator = true,
  syncGpuModal = true,
} = {}) {
  const fallback = this.currentResolution();
  const width = Math.max(64, Math.round(Number(rawWidth) || fallback.width || 1024));
  const height = Math.max(64, Math.round(Number(rawHeight) || fallback.height || 576));
  if (syncDeforum) {
    this.deforumSettings = this.normalizedDeforumSettings();
    this.deforumSettings.W = width;
    this.deforumSettings.H = height;
  }
  if (syncForge) {
    this.forge.options.width = width;
    this.forge.options.height = height;
  }
  if (syncImg2img) {
    this.img2img.width = width;
    this.img2img.height = height;
  }
  if (syncGenerator) {
    this.generator.resolution = `${width}x${height}`;
  }
  if (syncGpuModal && this.gpuPool && this.gpuPool.forgeModal && this.gpuPool.forgeModal.options) {
    this.gpuPool.forgeModal.options.width = width;
    this.gpuPool.forgeModal.options.height = height;
  }
  return { width, height };
},
currentStepsValue(fallbackSteps = 6) {
  const direct = Number(this.deforumSettings && this.deforumSettings.steps);
  if (Number.isFinite(direct) && direct > 0) return Math.max(1, Math.round(direct));
  const scheduled = Math.round(this.readFirstNumericValue(
    (this.deforumSettings && this.deforumSettings.steps_schedule) || '',
    Number(this.forge && this.forge.options && this.forge.options.steps)
      || Number(this.gpuPool && this.gpuPool.forgeModal && this.gpuPool.forgeModal.options && this.gpuPool.forgeModal.options.steps)
      || fallbackSteps
  ));
  return Math.max(1, scheduled || fallbackSteps);
},
syncStepsAcrossControls(rawSteps, {
  syncDeforum = true,
  syncForge = true,
  syncGpuModal = true,
  syncSchedule = true,
} = {}) {
  const next = Math.max(1, Math.round(Number(rawSteps) || this.currentStepsValue()));
  if (syncDeforum) {
    this.deforumSettings = this.normalizedDeforumSettings();
    this.deforumSettings.steps = next;
    if (syncSchedule) {
      this.deforumSettings.steps_schedule = `0: (${next})`;
    }
  }
  if (syncForge) {
    this.forge.options.steps = next;
  }
  if (syncGpuModal && this.gpuPool && this.gpuPool.forgeModal && this.gpuPool.forgeModal.options) {
    this.gpuPool.forgeModal.options.steps = next;
  }
  return next;
},
syncFpsAcrossControls(rawFps, {
  syncDeforum = true,
  syncSequencer = true,
  syncGenerator = true,
  syncStreaming = true,
  syncFramesync = true,
} = {}) {
  const fallback =
    Number(this.deforumSettings && this.deforumSettings.fps)
    || Number(this.sequencer && this.sequencer.fps)
    || Number(this.generator && this.generator.fps)
    || Number(this.framesync && this.framesync.fps)
    || 24;
  const next = Math.max(1, Math.min(120, Math.round(Number(rawFps) || fallback || 24)));
  if (syncDeforum) {
    this.deforumSettings = this.normalizedDeforumSettings();
    this.deforumSettings.fps = next;
  }
  if (syncSequencer && this.sequencer) {
    this.sequencer.fps = next;
  }
  if (syncGenerator && this.generator) {
    this.generator.fps = next;
  }
  if (syncFramesync && this.framesync) {
    this.framesync.fps = next;
  }
  if (syncStreaming && this.streaming && Array.isArray(this.streaming.destinations)) {
    this.streaming.destinations = this.streaming.destinations.map((dest) => ({
      ...(dest || {}),
      fps: next,
    }));
  }
  return next;
},
setGlobalFps(rawFps, { source = 'ui' } = {}) {
  if (this._syncingGlobalFps) return;
  this._syncingGlobalFps = true;
  try {
    const next = this.syncFpsAcrossControls(rawFps);
    // Persist + push to live patch (Deforum)
    this.onDeforumFieldInput('fps', next, 'number');
    if (source !== 'deforum') {
      // onDeforumFieldInput already saved, but non-deforum sources might skip if the value was identical.
      this.saveSessionState();
    }
    return next;
  } finally {
    this._syncingGlobalFps = false;
  }
},
normalizeModelName(name) {
  const normalized = typeof name === 'string' ? name.trim() : '';
  if (!normalized || normalized.toLowerCase() === 'unknown') return '';
  return normalized;
},
detectModelFamilyFromText(rawValue) {
  const value = String(rawValue || '').toLowerCase();
  if (!value) return '';
  if (/\bz[-_. ]?image\b|zimage/.test(value)) return 'zimage';
  if (/\bflux\b|flux\.1/.test(value)) return 'flux';
  if (/(?:^|[^a-z0-9])svd(?:[^a-z0-9]|$)|stable video diffusion|\bvideo\b/.test(value)) return 'svd';
  if (/(?:^|[^a-z0-9])sdxl(?:[^a-z0-9]|$)|stable diffusion xl|\bpony\b|illustrious|\bxl\b/.test(value)) return 'sdxl';
  if (/\bsd(?:\s|[-_.])?1(?:\s|[-_.])?5\b|(?:^|[^a-z0-9])sd15(?:[^a-z0-9]|$)|stable diffusion 1\.5|\bv1[-_. ]?5\b|\b1\.5\b/.test(value)) return 'sd15';
  return '';
},
detectModelFamilyFromValue(metadata, fallbackText = '') {
  const values = [];
  if (metadata && typeof metadata === 'object') {
    values.push(
      metadata.base_model,
      metadata.architecture,
      metadata.model_type,
      metadata.type,
      metadata.pipeline,
      metadata.variant,
      metadata.name
    );
  }
  values.push(fallbackText);
  for (const value of values) {
    const family = this.detectModelFamilyFromText(value);
    if (family) return family;
  }
  return '';
},
detectLoraFamily(loraLike) {
  const family = this.detectModelFamilyFromValue(
    loraLike && loraLike.metadata,
    `${loraLike && loraLike.name ? loraLike.name : ''} ${loraLike && loraLike.path ? loraLike.path : ''}`
  );
  return family || 'sd15';
},
findForgeModelEntry(modelName) {
  const normalized = this.normalizeModelName(modelName);
  if (!normalized) return null;
  return (this.forge.models || []).find((model) => {
    const candidates = [model && model.model_name, model && model.title]
      .map((value) => this.normalizeModelName(value))
      .filter(Boolean);
    return candidates.includes(normalized);
  }) || null;
},
readFirstNumericValue(rawValue, fallback = 0) {
  const match = String(rawValue ?? '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return fallback;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : fallback;
},
optimizedDefaultsForModel(modelLike) {
  const matched = typeof modelLike === 'string' ? this.findForgeModelEntry(modelLike) : modelLike;
  const modelName = this.normalizeModelName(
    (matched && (matched.model_name || matched.title || matched.name))
    || (typeof modelLike === 'string' ? modelLike : (modelLike && (modelLike.model_name || modelLike.title || modelLike.name)))
    || this.engineCurrentModelName
  );
  const metadata = (matched && matched.metadata) || (modelLike && modelLike.metadata) || this.forge.modelInfo || null;
  if (!metadata && !modelName) return null;
  const family = this.detectModelFamilyFromValue(metadata, modelName);
  const profileText = [
    metadata && metadata.variant,
    metadata && metadata.type,
    metadata && metadata.pipeline,
    metadata && metadata.architecture,
    metadata && metadata.base_model,
    metadata && metadata.name,
    modelName,
  ].filter(Boolean).join(' ').toLowerCase();
  const familyLabel = { sd15: 'SD1.5', sdxl: 'SDXL', flux: 'FLUX', zimage: 'Z-Image', svd: 'SVD' }[family] || 'Generic';
  const isTurboLike = /(turbo|lightning|lcm|hyper|distill|schnell)/.test(profileText);
  const isFluxDev = family === 'flux' && /\bdev\b/.test(profileText);
  const baseResolution = Number(metadata && metadata.base_resolution) || (family === 'sd15' ? 512 : 1024);
  const currentSampler = this.deforumSettings && this.deforumSettings.sampler
    ? this.deforumSettings.sampler
    : ((this.forge.options && this.forge.options.sampler_name) || 'Euler a');
  const currentScheduler = this.deforumSettings && this.deforumSettings.scheduler
    ? this.deforumSettings.scheduler
    : ((this.forge.options && this.forge.options.scheduler) || 'Normal');
  let profileLabel = familyLabel;
  let steps = Number(metadata && metadata.recommended_steps);
  let cfgScale = Number(metadata && metadata.recommended_cfg_scale);
  let strength = Number(metadata && metadata.recommended_strength);
  let sampler = (metadata && metadata.recommended_sampler) || currentSampler;
  const scheduler = (metadata && metadata.recommended_scheduler) || currentScheduler;
  if (!Number.isFinite(steps)) {
    if (isTurboLike) steps = family === 'flux' ? 4 : 4;
    else if (family === 'flux') steps = isFluxDev ? 20 : 8;
    else if (family === 'svd') steps = 25;
    else if (family === 'sdxl') steps = 30;
    else if (family === 'sd15') steps = 24;
    else steps = 24;
  }
  if (!Number.isFinite(cfgScale)) {
    if (isTurboLike) cfgScale = family === 'flux' ? 1.0 : 1.5;
    else if (family === 'flux') cfgScale = isFluxDev ? 3.5 : 1.0;
    else if (family === 'svd') cfgScale = 2.5;
    else if (family === 'sdxl') cfgScale = 6.5;
    else if (family === 'sd15') cfgScale = 7.0;
    else cfgScale = 6.0;
  }
  if (!Number.isFinite(strength)) {
    if (isTurboLike) strength = 0.4;
    else if (family === 'flux') strength = 0.5;
    else if (family === 'sdxl') strength = 0.55;
    else strength = 0.65;
  }
  if (isTurboLike) profileLabel = `${familyLabel} fast`;
  else if (family === 'flux' && isFluxDev) profileLabel = 'FLUX dev';
  else if (family === 'flux') profileLabel = 'FLUX schnell';
  return {
    width: baseResolution >= 1024 ? 1024 : 512,
    height: baseResolution >= 1024 ? 1024 : 512,
    steps,
    sampler,
    scheduler,
    cfgScale,
    strength,
    profileLabel,
  };
},
applyModelOptimizedDefaults(modelLike) {
  const defaults = this.optimizedDefaultsForModel(modelLike);
  if (!defaults) return false;
  this.deforumSettings = this.normalizedDeforumSettings();
  this.deforumSettings.W = defaults.width;
  this.deforumSettings.H = defaults.height;
  this.deforumSettings.sampler = defaults.sampler;
  this.deforumSettings.scheduler = defaults.scheduler;
  this.deforumSettings.cfg_scale_schedule = `0:(${defaults.cfgScale})`;
  this.deforumSettings.distilled_cfg_scale_schedule = `0: (${defaults.cfgScale})`;
  this.deforumSettings.strength_schedule = `0: (${defaults.strength})`;
  this.deforumSettings.keyframe_strength_schedule = `0: (${defaults.strength})`;
  this.forge.options.width = defaults.width;
  this.forge.options.height = defaults.height;
  this.forge.options.sampler_name = defaults.sampler;
  this.forge.options.scheduler = defaults.scheduler;
  this.forge.options.cfg_scale = defaults.cfgScale;
  this.syncStepsAcrossControls(defaults.steps, { syncGpuModal: true });
  const cfgParam = this.liveVibe.find((param) => param.key === 'cfgscale') || this.liveVibe.find((param) => param.key === 'cfg');
  if (cfgParam) cfgParam.val = defaults.cfgScale;
  const strengthParam = this.liveVibe.find((param) => param.key === 'strength');
  if (strengthParam) strengthParam.val = defaults.strength;
  const family = this.detectModelFamilyFromValue(
    (modelLike && modelLike.metadata) || this.forge.modelInfo,
    this.normalizeModelName(this.forge.selectedModel || this.forge.currentModel),
  );
  if (family === 'svd') {
    this.svdEngine = normalizeSvdEngine({ ...this.svdEngine, ...getSvdPreset('XT 1.1') });
    this.syncResolutionAcrossControls(this.svdEngine.width, this.svdEngine.height, { syncGpuModal: true });
  }
  this.syncDeforumSettingsJson();
  this.deforumSettingsStatus = `${this.normalizeModelName(this.forge.selectedModel || this.forge.currentModel)} optimized for ${defaults.profileLabel}`;
  return true;
},
applyLoadedModelSelection(modelName, { syncDeforumSettings = true, queueDeforumSave = false, saveSession = true } = {}) {
  const normalized = this.normalizeModelName(modelName);
  if (!normalized) return '';
  this.forge.currentModel = normalized;
  this.forge.selectedModel = normalized;
  this.forge.lastModel = normalized;
  const matchedModel = this.findForgeModelEntry(normalized);
  if (matchedModel && matchedModel.metadata) {
    this.forge.modelInfo = matchedModel.metadata;
  }
  if (syncDeforumSettings && this.deforumSettings && this.deforumSettings.sd_model_name !== normalized) {
    this.deforumSettings.sd_model_name = normalized;
    this.syncDeforumSettingsJson();
    if (queueDeforumSave) this.queueDeforumSettingsSave();
  }
  if (saveSession) this.saveSessionState();
  return normalized;
},
syncSelectedModelFromDeforumSettings() {
  const desired = this.normalizeModelName(this.deforumSettings && this.deforumSettings.sd_model_name);
  if (desired) this.forge.selectedModel = desired;
  return desired;
},
 restoreLastModel() {
  const name = this.syncSelectedModelFromDeforumSettings() || this.normalizeModelName(this.forge.lastModel) || this.normalizeModelName(this.forge.selectedModel);
  if (!name || this.forge.switching) return false;
  if (this.normalizeModelName(this.forge.currentModel) === name) {
    this.applyLoadedModelSelection(name, { queueDeforumSave: false });
    return true;
  }
   this.forge.selectedModel = name;
  return this.switchForgeModel(name, { persistDeforumSettings: false });
 },
async onModelSelectChange() {
  await this.switchForgeModel(this.forge.selectedModel, {
    persistDeforumSettings: true,
    applyOptimizedDefaults: true,
  });
   this.saveSessionState();
 },
openEngineModelPicker() {
  const family = this.engineCurrentModelFamily;
  const allowed = ['sd15', 'sdxl', 'flux', 'zimage', 'other'];
  this.engineModelPickerTab = allowed.includes(family) ? family : 'other';
  this.engineModelPickerOpen = true;
  if (!this.forge.models.length && !this.forge.loading) {
    this.refreshForgeModels();
  }
},
closeEngineModelPicker() {
  this.engineModelPickerOpen = false;
},
onEngineModelPickerBackdropClick(event) {
  if (event?.target === event?.currentTarget) this.closeEngineModelPicker();
},
setEngineModelPickerTab(tab) {
  const allowed = ['sd15', 'sdxl', 'flux', 'zimage', 'other'];
  if (!allowed.includes(tab)) return;
  this.engineModelPickerTab = tab;
},
async selectEngineModel(model) {
  const name = this.normalizeModelName(model && (model.model_name || model.title));
  if (!name) return;
  await this.onDeforumModelCommit(name);
  this.closeEngineModelPicker();
},
async onDeforumModelCommit(rawValue) {
  const nextModel = this.normalizeModelName(rawValue != null ? rawValue : this.deforumSettings && this.deforumSettings.sd_model_name);
  if (!nextModel) return;
  if (this.deforumSettings && this.deforumSettings.sd_model_name !== nextModel) {
    this.deforumSettings.sd_model_name = nextModel;
    this.syncDeforumSettingsJson();
  }
  this.forge.selectedModel = nextModel;
  const switched = await this.switchForgeModel(nextModel, {
    persistDeforumSettings: true,
    applyOptimizedDefaults: true,
  });
  if (!switched && this.forge.currentModel) {
    this.applyLoadedModelSelection(this.forge.currentModel, { queueDeforumSave: true });
  }
},
onEngineSamplerChange(rawValue) {
  const next = String(rawValue || '').trim();
  if (!next) return;
  this.deforumSettings = this.normalizedDeforumSettings();
  this.deforumSettings.sampler = next;
  this.forge.options.sampler_name = next;
  this.syncDeforumSettingsJson();
  this.saveSessionState();
  this.pushDeforumLivePatch('sampler', next);
  this.queueDeforumSettingsSave();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
},
onEngineSchedulerChange(rawValue) {
  const next = String(rawValue || '').trim();
  if (!next) return;
  this.deforumSettings = this.normalizedDeforumSettings();
  this.deforumSettings.scheduler = next;
  this.forge.options.scheduler = next;
  this.syncDeforumSettingsJson();
  this.saveSessionState();
  this.pushDeforumLivePatch('scheduler', next);
  this.queueDeforumSettingsSave();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
},
onEngineStepsChange(rawValue) {
  if (this.lcmEngineEnabled) {
    this.onLcmEngineStepsChange(rawValue);
    return;
  }
  const next = this.syncStepsAcrossControls(rawValue, { syncGpuModal: true });
  this.syncDeforumSettingsJson();
  this.saveSessionState();
  this.pushDeforumLivePatch('steps', next);
  this.pushDeforumLivePatch('steps_schedule', this.deforumSettings.steps_schedule);
  this.queueDeforumSettingsSave();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
},
setLcmEngineEnabled(enabled) {
  const next = !!enabled;
  if (!this.lcmEngine) this.lcmEngine = { ...DEFAULT_LCM_ENGINE };
  if (this.lcmEngine.enabled === next) return;
  this.lcmEngine.enabled = next;
  if (next) {
    if (!Number.isFinite(Number(this.lcmEngine.steps)) || Number(this.lcmEngine.steps) < 1) {
      this.lcmEngine.steps = DEFAULT_LCM_ENGINE.steps;
    }
    if (!String(this.lcmEngine.loraTag || '').trim()) {
      this.lcmEngine.loraTag = DEFAULT_LCM_LORA_TAG;
    }
    this.applyLcmEngineToDeforum();
  } else {
    this.syncDeforumSettingsJson();
    this.saveSessionState();
    if (!this.deforumPlaying) this.scheduleDeforumPreview();
  }
},
onLcmEngineStepsChange(rawValue) {
  const next = Math.max(1, Math.round(Number(rawValue) || Number(this.lcmEngine.steps) || 1));
  if (!this.lcmEngine) this.lcmEngine = { ...DEFAULT_LCM_ENGINE };
  this.lcmEngine.steps = next;
  this.applyLcmEngineToDeforum();
},
onLcmEngineLoraChange(rawValue) {
  const tag = String(rawValue ?? '').trim() || DEFAULT_LCM_LORA_TAG;
  if (!this.lcmEngine) this.lcmEngine = { ...DEFAULT_LCM_ENGINE };
  this.lcmEngine.loraTag = tag;
  this.syncDeforumSettingsJson();
  this.saveSessionState();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
},
applyLcmEngineToDeforum({ saveSession = true } = {}) {
  if (!this.lcmEngine || !this.lcmEngine.enabled) return;
  const steps = Math.max(1, Math.round(Number(this.lcmEngine.steps) || 1));
  this.lcmEngine.steps = steps;
  this.syncStepsAcrossControls(steps, { syncGpuModal: true });
  this.syncDeforumSettingsJson();
  if (saveSession) this.saveSessionState();
  this.pushDeforumLivePatch('steps', steps);
  this.pushDeforumLivePatch('steps_schedule', this.deforumSettings.steps_schedule);
  this.queueDeforumSettingsSave();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
},
async ensureDefaultForgeModelPreloaded() {
  if (typeof fetch !== 'function') return;
  try {
    const desired = this.normalizeModelName(
      (this.deforumSettings && this.deforumSettings.sd_model_name) || DEFAULT_FORGE_MODEL
    );
    if (!desired) return;
    await fetch('/api/gpu-pool/default-forge-model', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: desired, preload: true, singleNode: true }),
    });
    await this.refreshGpuPool(true);
  } catch (err) {
    console.warn('[engine] default model preload failed', err.message || err);
  }
},
onEngineCfgScaleChange(rawValue) {
  const next = Number(rawValue);
  if (!Number.isFinite(next) || next < 0) return;
  this.deforumSettings = this.normalizedDeforumSettings();
  this.deforumSettings.cfg_scale_schedule = `0:(${next})`;
  this.deforumSettings.distilled_cfg_scale_schedule = `0: (${next})`;
  this.forge.options.cfg_scale = next;
  const cfgParam = this.liveVibe.find((param) => param.key === 'cfgscale') || this.liveVibe.find((param) => param.key === 'cfg');
  if (cfgParam) cfgParam.val = next;
  this.syncDeforumSettingsJson();
  this.saveSessionState();
  this.pushDeforumLivePatch('cfg_scale_schedule', this.deforumSettings.cfg_scale_schedule);
  this.pushDeforumLivePatch('distilled_cfg_scale_schedule', this.deforumSettings.distilled_cfg_scale_schedule);
  this.queueDeforumSettingsSave();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
},
reapplyEngineModelDefaults() {
  const modelName = this.engineCurrentModelName;
  if (!modelName) return false;
  const applied = this.applyModelOptimizedDefaults(modelName);
  if (applied) {
    this.saveSessionState();
    this.queueDeforumSettingsSave();
    if (!this.deforumPlaying) this.scheduleDeforumPreview();
  }
  return applied;
},
 slotTypeLabel(type) {
   const t = this.crossfadeSlotTypes.find((x) => x.id === type);
   return t ? t.label : type;
 },
 newSlotId() {
   return `slot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
 },
 addCrossfadeSlot() {
   const type = this.performance.newSlotType || 'prompt';
   const slot = {
     id: this.newSlotId(),
     type,
     valueA: type === 'param' ? 0 : (type === 'prompt' ? '' : null),
     valueB: type === 'param' ? 0 : (type === 'prompt' ? '' : null),
     paramKey: 'cfg',
     loraStrengthA: 1,
     loraStrengthB: 1,
     cnSlotId: this.cn.active || 'CN1',
   };
   this.performance.slots.push(slot);
   this.applyCrossfadeMorph();
   this.saveSessionState();
 },
 removeCrossfadeSlot(id) {
   this.performance.slots = this.performance.slots.filter((s) => s.id !== id);
   this.applyCrossfadeMorph();
   this.saveSessionState();
 },
 slotMorphedPreview(slot) {
   return morphSlotValue(this.normalizeSlotForMorph(slot), this.performance.crossfader);
 },
 promptStyleById(id) {
   if (!id) return null;
   return (this.promptStyles || []).find((style) => style.id === id) || null;
 },
 promptStyleLabel(id) {
   const style = this.promptStyleById(id);
   return style ? style.name : '';
 },
 formatMorphedPreview(slot) {
   const v = this.slotMorphedPreview(slot);
   if (v == null) return '—';
   if (slot.type === 'style' && v && typeof v === 'object') {
     const chunks = [];
     if (v.positive) chunks.push(`+${String(v.positive).slice(0, 36)}${String(v.positive).length > 36 ? '…' : ''}`);
     if (v.negative) chunks.push(`−${String(v.negative).slice(0, 28)}${String(v.negative).length > 28 ? '…' : ''}`);
     return chunks.length ? chunks.join(' ') : '—';
   }
   if (typeof v === 'object') return JSON.stringify(v);
   if (typeof v === 'number') return Number(v).toFixed(3);
   const s = String(v);
   return s.length > 48 ? s.slice(0, 48) + '…' : s;
 },
 normalizeSlotForMorph(slot) {
   if (slot.type === 'lora') {
     const pack = (name, str) => (name ? { name, strength: Number(str) || 1 } : null);
     return {
       ...slot,
       valueA: pack(slot.valueA, slot.loraStrengthA),
       valueB: pack(slot.valueB, slot.loraStrengthB),
     };
   }
   if (slot.type === 'controlnet') {
     const pack = (weight) => ({
       slotId: slot.cnSlotId,
       weight: Number(weight),
       start: 0,
       end: 0.9,
       enabled: true,
     });
     return {
       ...slot,
       valueA: slot.valueA != null && slot.valueA !== '' ? pack(slot.valueA) : null,
       valueB: slot.valueB != null && slot.valueB !== '' ? pack(slot.valueB) : null,
     };
   }
   if (slot.type === 'style') {
     return {
       ...slot,
       valueA: this.promptStyleById(slot.valueA),
       valueB: this.promptStyleById(slot.valueB),
     };
   }
   if (slot.type === 'param') {
     return { ...slot, valueA: slot.valueA, valueB: slot.valueB };
   }
   return slot;
 },
 buildMorphedPrompt() {
   const parts = [];
   const base = (this.performance.genericPrompt || '').trim();
   if (base) parts.push(base);
   for (const slot of this.performance.slots) {
     if (slot.type !== 'prompt') continue;
     const m = morphSlotValue(this.normalizeSlotForMorph(slot), this.performance.crossfader);
     if (m) parts.push(String(m));
   }
   const merged = parts.join(', ').trim();
   if (merged) return merged;
   return (this.prompts.pos || '').trim();
 },
 buildMorphedStyleAppend() {
   const partsPos = [];
   const partsNeg = [];
   for (const slot of this.performance.slots) {
     if (slot.type !== 'style') continue;
     const morphed = morphSlotValue(
       this.normalizeSlotForMorph(slot),
       this.performance.crossfader,
     );
     if (!morphed || typeof morphed !== 'object') continue;
     if (morphed.positive) partsPos.push(String(morphed.positive).trim());
     if (morphed.negative) partsNeg.push(String(morphed.negative).trim());
   }
   return {
     positive: partsPos.filter(Boolean).join(', '),
     negative: partsNeg.filter(Boolean).join(', '),
   };
 },
 buildPromptStyleJobSnapshot() {
   const styleSlots = (this.performance.slots || [])
     .filter((slot) => slot.type === 'style')
     .map((slot) => this.normalizeSlotForMorph(slot));
   const morph = this.buildMorphedStyleAppend();
   return buildPromptStyleJobSnapshot({
     activeStyleId: this.activePromptStyleId,
     activeStyle: this.activePromptStyle,
     crossfader: this.performance.crossfader,
     styleCrossfaderSlots: styleSlots,
     morphedAppend: morph,
   });
 },
 applyCrossfadeMorph() {
   const t = this.performance.crossfader;
   const live = {};
   const loraA = [];
   const loraB = [];
   for (const slot of this.performance.slots) {
     const norm = this.normalizeSlotForMorph(slot);
     const v = morphSlotValue(norm, t);
     if (v == null) continue;
     if (slot.type === 'prompt' || slot.type === 'style') continue;
     if (slot.type === 'param' && slot.paramKey) {
       const anim = this.animationTargets.find((t) => t.key === slot.paramKey);
       if (anim) {
         this.applyAnimationModulation(anim.field, v);
       } else {
         live[slot.paramKey] = v;
         const p = this.liveVibe.find((x) => x.key === slot.paramKey) || this.liveCam.find((x) => x.key === slot.paramKey);
         if (p) p.val = v;
       }
     } else if (slot.type === 'lora' && v && v.name) {
       const entry = { name: v.name, path: v.name, strength: v.strength ?? 1 };
       if (smoothstep(t) < 0.5) loraA.push(entry);
       else loraB.push(entry);
     } else if (slot.type === 'controlnet' && v) {
       const cnSlot = this.cn.slots.find((s) => s.id === v.slotId);
       if (cnSlot) {
         cnSlot.weight = v.weight;
         cnSlot.start = v.start;
         cnSlot.end = v.end;
         cnSlot.enabled = v.enabled;
         this.updateControlNet(cnSlot);
       }
     }
   }
   const basePositive = this.buildMorphedPrompt();
   const baseNegative = (this.prompts.neg || '').trim();
   this.prompts.pos = basePositive;
   const positive = this.effectivePositivePrompt(basePositive);
   const negative = this.effectiveNegativePrompt(baseNegative);
   this.sendControl('prompt', { positive, negative });
   if (Object.keys(live).length) this.sendControl('liveParam', live);
  if (this.loras.common.length || loraA.length || loraB.length) {
     this.sendControl('loras', {
      common: this.loras.common.map((lora) => ({
        name: lora.name,
        path: lora.path,
        strength: lora.strength,
      })),
       groupA: loraA,
       groupB: loraB,
       crossfaderValue: t,
     });
   }
   this.prompts.crossfaderValue = t;
 },
 onCrossfaderSlider(value) {
   const next = this.clampVal(Number(value) || 0, 0, 1);
   this.performance.crossfader = next;
   this.prompts.crossfaderValue = next;
   if (this.prompts.morphOn) {
     this.prompts.morphBlend = next;
     if (!this.prompts.morphBlendLfoLink) {
       this.prompts.morphBlendLfoBase = next;
     }
     this.applyPromptMorphing();
   }
   this.onCrossfaderInput();
 },
 onCrossfaderInput() {
   this.applyCrossfadeMorph();
   this.saveSessionState();
   if (!this.deforumPlaying) this.schedulePreviewFrame();
 },
 onPerformanceInput() {
   this.applyCrossfadeMorph();
   this.saveSessionState();
  this.queuePromptHistorySave(this.performance.genericPrompt);
   if (!this.deforumPlaying) this.schedulePreviewFrame();
 },
async loadPromptStyles({ quiet = false } = {}) {
  this.promptStylesLoading = true;
  if (!quiet) this.promptStylesStatus = "Loading styles…";
  try {
    const res = await fetch("/api/prompt-styles");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    this.promptStyles = Array.isArray(data.styles) ? data.styles : [];
    if (!quiet) this.promptStylesStatus = `${this.promptStyles.length} styles loaded`;
    if (this.promptStyleEditorId) {
      const current = this.promptStyles.find((style) => style.id === this.promptStyleEditorId);
      if (current) this.promptStyleDraft = { ...current };
    }
  } catch (err) {
    if (!quiet) this.promptStylesStatus = `Load failed: ${err.message || err}`;
  } finally {
    this.promptStylesLoading = false;
  }
},
async importPromptStylesFromForge() {
  this.promptStylesImporting = true;
  this.promptStylesStatus = "Importing from Forge…";
  try {
    const forgeUrl = (this.forge && this.forge.baseUrl) || "";
    const res = await fetch("/api/prompt-styles/import-forge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forgeUrl: forgeUrl || undefined }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    this.promptStyles = Array.isArray(data.styles) ? data.styles : [];
    const seedNote = data.persistedSeed !== false ? " — saved permanently" : "";
    this.promptStylesStatus = `Imported ${data.added || 0} new, updated ${data.updated || 0} (${data.total || this.promptStyles.length} total)${seedNote}`;
  } catch (err) {
    this.promptStylesStatus = `Import failed: ${err.message || err}`;
  } finally {
    this.promptStylesImporting = false;
  }
},
selectActivePromptStyle(id) {
  const next = id ? String(id) : null;
  this.activePromptStyleId = next;
  this.saveSessionState();
  if (!this.deforumPlaying) this.schedulePreviewFrame();
},
openPromptStyleEditor(id) {
  const style = (this.promptStyles || []).find((entry) => entry.id === id);
  if (!style) return;
  this.promptStyleEditorId = id;
  this.promptStyleDraft = { ...style };
},
startNewPromptStyle() {
  const id = `custom_${Date.now()}`;
  this.promptStyleEditorId = id;
  this.promptStyleDraft = {
    id,
    name: "New style",
    positive: "",
    negative: "",
    source: "custom",
    exampleImage: null,
  };
},
async savePromptStyleDraft() {
  const draft = this.promptStyleDraft;
  if (!draft || !String(draft.name || "").trim()) {
    this.promptStylesStatus = "Style name is required";
    return;
  }
  const exists = (this.promptStyles || []).some((style) => style.id === draft.id);
  const payload = {
    id: draft.id,
    name: draft.name,
    positive: draft.positive,
    negative: draft.negative,
  };
  try {
    const res = await fetch(
      exists ? `/api/prompt-styles/${encodeURIComponent(draft.id)}` : "/api/prompt-styles",
      {
        method: exists ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    await this.loadPromptStyles({ quiet: true });
    if (data.style) {
      this.promptStyleEditorId = data.style.id;
      this.promptStyleDraft = { ...data.style };
    }
    this.promptStylesStatus = exists ? "Style saved" : "Style created";
  } catch (err) {
    this.promptStylesStatus = `Save failed: ${err.message || err}`;
  }
},
async deletePromptStyle(id) {
  if (!id) return;
  try {
    const res = await fetch(`/api/prompt-styles/${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    if (this.activePromptStyleId === id) this.activePromptStyleId = null;
    if (this.promptStyleEditorId === id) {
      this.promptStyleEditorId = null;
      this.promptStyleDraft = null;
    }
    await this.loadPromptStyles({ quiet: true });
    this.promptStylesStatus = "Style deleted";
  } catch (err) {
    this.promptStylesStatus = `Delete failed: ${err.message || err}`;
  }
},
async setPromptStyleExampleFromPreview(styleId) {
  const path = this.performance.lastPreviewPath || this.generator.lastPath;
  if (!path) {
    this.promptStylesStatus = "No preview image yet";
    return;
  }
  await this.setPromptStyleExampleFromPath(styleId, path);
},
async setPromptStyleExampleFromPath(styleId, path) {
  try {
    const res = await fetch(`/api/prompt-styles/${encodeURIComponent(styleId)}/example`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    await this.loadPromptStyles({ quiet: true });
    if (data.style && this.promptStyleDraft && this.promptStyleDraft.id === styleId) {
      this.promptStyleDraft = { ...data.style };
    }
    this.promptStylesStatus = "Example image saved";
  } catch (err) {
    this.promptStylesStatus = `Example save failed: ${err.message || err}`;
  }
},
async onPromptStyleExampleFile(evt, styleId) {
  const file = evt?.target?.files?.[0];
  if (!file || !styleId) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const res = await fetch(`/api/prompt-styles/${encodeURIComponent(styleId)}/example`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: reader.result }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      await this.loadPromptStyles({ quiet: true });
      if (data.style && this.promptStyleDraft && this.promptStyleDraft.id === styleId) {
        this.promptStyleDraft = { ...data.style };
      }
      this.promptStylesStatus = "Example image uploaded";
    } catch (err) {
      this.promptStylesStatus = `Upload failed: ${err.message || err}`;
    }
  };
  reader.readAsDataURL(file);
  if (evt?.target) evt.target.value = "";
},
async clearPromptStyleExample(styleId) {
  try {
    const res = await fetch(`/api/prompt-styles/${encodeURIComponent(styleId)}/example`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    await this.loadPromptStyles({ quiet: true });
    if (this.promptStyleDraft && this.promptStyleDraft.id === styleId) {
      this.promptStyleDraft = { ...data.style };
    }
    this.promptStylesStatus = "Example cleared";
  } catch (err) {
    this.promptStylesStatus = `Clear failed: ${err.message || err}`;
  }
},
effectivePositivePrompt(base) {
  const fromActive = applyPromptStyleToPrompts(
    { positive: base, negative: "" },
    this.activePromptStyle,
  );
  const cross = this.buildMorphedStyleAppend();
  const merged = mergePromptParts(fromActive.positive, cross.positive);
  if (this.lcmEngineEnabled) {
    return mergeLoraIntoPrompt(merged, this.lcmEngine.loraTag || DEFAULT_LCM_LORA_TAG);
  }
  return merged;
},
effectiveNegativePrompt(base) {
  const fromActive = applyPromptStyleToPrompts(
    { positive: "", negative: base },
    this.activePromptStyle,
  );
  const cross = this.buildMorphedStyleAppend();
  return mergePromptParts(fromActive.negative, cross.negative);
},
effectiveDeforumSettingsForRender() {
  const settings = JSON.parse(JSON.stringify(this.activeDeforumSettings()));
  const basePositive = (this.isWanLayerActive || this.isAnimateLcmLayerActive || this.isSvdLayerActive)
    ? (this.buildMorphedPrompt() || String(this.prompts.pos || "").trim())
    : (
      getNestedValue(settings, "prompts.0")
      || this.buildMorphedPrompt()
      || String(this.prompts.pos || "").trim()
    );
  const baseNegative = settings.negative_prompts || this.prompts.neg || "";
  const positive = this.effectivePositivePrompt(basePositive);
  setNestedValue(settings, "prompts.0", positive);
  settings.negative_prompts = this.effectiveNegativePrompt(baseNegative);
  if (this.lcmEngineEnabled && !this.isWanLayerActive && !this.isAnimateLcmLayerActive && !this.isSvdLayerActive) {
    const steps = Math.max(1, Math.round(Number(this.lcmEngine.steps) || 1));
    settings.steps = steps;
    settings.steps_schedule = `0: (${steps})`;
  }
  if (this.isWanLayerActive) {
    return mergeWanEngineIntoDeforumSettings(settings, this.wanEngine, { positivePrompt: positive });
  }
  if (this.isAnimateLcmLayerActive) {
    return mergeAnimateLcmIntoDeforumSettings(settings, this.animateLcmEngine, { positivePrompt: positive });
  }
  if (this.isSvdLayerActive) {
    return settings;
  }
  if (settings.animation_mode === WAN_ANIMATION_MODE) {
    settings.animation_mode = this.deforumSettings?.animation_mode || '2D';
  }
  if (settings.animation_mode === ANIMATELCM_ANIMATION_MODE) {
    settings.animation_mode = this.deforumSettings?.animation_mode || '2D';
  }
  return settings;
},
onAnimateLcmFieldChange(key, rawValue, type = 'text') {
  if (!key) return;
  let next;
  if (type === 'number') {
    const num = Number(rawValue);
    if (!Number.isFinite(num)) return;
    next = num;
  } else {
    next = String(rawValue ?? '');
  }
  this.animateLcmEngine = { ...this.animateLcmEngine, [key]: next };
  this.syncDeforumSettingsJson();
  this.saveSessionState();
  this.queueDeforumSettingsSave();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
},
setAnimateLcmMotionType(type) {
  this.animateLcmEngine = { ...this.animateLcmEngine, motion_type: type };
  this.syncDeforumSettingsJson();
  this.saveSessionState();
  this.queueDeforumSettingsSave();
},
toggleAnimateLcmMotionLora(id) {
  const current = Array.isArray(this.animateLcmEngine.motion_loras) ? this.animateLcmEngine.motion_loras : [];
  const next = current.includes(id) ? current.filter((l) => l !== id) : [...current, id];
  this.animateLcmEngine = { ...this.animateLcmEngine, motion_loras: next };
  this.syncDeforumSettingsJson();
  this.saveSessionState();
  this.queueDeforumSettingsSave();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
},
applyAnimateLcmMotionPreset(name) {
  const PRESETS = {
    Static:   { motion_type: 'static',   alcm_motion_amount: 0.5,  alcm_zoom: 1.0,  alcm_pan_x: 0,   alcm_pan_y: 0,   alcm_noise: 0.03 },
    Orbit:    { motion_type: 'orbit',    alcm_motion_amount: 1.2,  alcm_zoom: 1.01, alcm_pan_x: 0.3, alcm_pan_y: 0,   alcm_noise: 0.05 },
    Tunnel:   { motion_type: 'zoom',     alcm_motion_amount: 1.0,  alcm_zoom: 1.04, alcm_pan_x: 0,   alcm_pan_y: 0,   alcm_noise: 0.04 },
    Handheld: { motion_type: 'handheld', alcm_motion_amount: 0.8,  alcm_zoom: 1.0,  alcm_pan_x: 0.1, alcm_pan_y: 0.1, alcm_noise: 0.08 },
    Chaos:    { motion_type: 'custom',   alcm_motion_amount: 1.5,  alcm_zoom: 1.02, alcm_pan_x: 0.5, alcm_pan_y: 0.3, alcm_noise: 0.12 },
  };
  const preset = PRESETS[name];
  if (!preset) return;
  this.animateLcmEngine = { ...this.animateLcmEngine, ...preset, motion_preset: name };
  this.syncDeforumSettingsJson();
  this.saveSessionState();
  this.queueDeforumSettingsSave();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
},
onSvdEngineFieldChange(key, rawValue, type = 'text') {
  if (!key || !this.svdEngine) return;
  let next = rawValue;
  if (type === 'number') {
    const num = Number(rawValue);
    if (!Number.isFinite(num)) return;
    next = num;
  } else {
    next = String(rawValue ?? '');
  }
  this.svdEngine = normalizeSvdEngine({ ...this.svdEngine, [key]: next });
  if (key === 'width' || key === 'height') {
    this.syncResolutionAcrossControls(this.svdEngine.width, this.svdEngine.height, { syncGpuModal: true });
  }
  this.saveSessionState();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
},
onSvdResolutionPresetChange(value) {
  const parsed = parseSvdResolution(value);
  const patch = { svd_resolution: value };
  if (parsed) {
    patch.width = parsed.width;
    patch.height = parsed.height;
    this.syncResolutionAcrossControls(parsed.width, parsed.height, { syncGpuModal: true });
  }
  this.svdEngine = normalizeSvdEngine({ ...this.svdEngine, ...patch });
  this.saveSessionState();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
},
applySvdPreset(name) {
  const preset = getSvdPreset(name);
  if (!preset) return;
  this.svdEngine = normalizeSvdEngine({ ...this.svdEngine, ...preset, svd_preset: name });
  this.syncResolutionAcrossControls(this.svdEngine.width, this.svdEngine.height, { syncGpuModal: true });
  this.saveSessionState();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
},
applySvdInitFromPromptsImage() {
  const dataUrl = this.img2img?.dataUrl || null;
  if (!dataUrl) {
    this.svdStatus = 'No image in Prompts → IMAGE — generate or upload first';
    return;
  }
  this.svdEngine = normalizeSvdEngine({ ...this.svdEngine, svd_init_image: dataUrl });
  this.syncSvdInitResolutionFromDataUrl(dataUrl);
  this.svdStatus = 'Init image linked from Prompts';
  this.saveSessionState();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
},
clearSvdInitImage() {
  this.svdEngine = normalizeSvdEngine({ ...this.svdEngine, svd_init_image: null });
  this.svdStatus = '';
  this.saveSessionState();
},
syncSvdInitResolutionFromDataUrl(dataUrl) {
  if (!dataUrl || typeof Image === 'undefined') return;
  const img = new Image();
  img.onload = () => {
    const picked = pickSvdResolutionForSize(img.naturalWidth, img.naturalHeight);
    const size = parseSvdResolution(picked);
    const patch = { svd_init_image: dataUrl, svd_resolution: picked };
    if (size) {
      patch.width = size.width;
      patch.height = size.height;
      this.syncResolutionAcrossControls(size.width, size.height, { syncGpuModal: true });
    }
    this.svdEngine = normalizeSvdEngine({ ...this.svdEngine, ...patch });
    this.saveSessionState();
  };
  img.src = dataUrl;
},
async ensureSvdInitImage() {
  if (this.svdEngine?.svd_init_image) return this.svdEngine.svd_init_image;
  const w = Math.round(Number(this.svdEngine?.width) || 1024);
  const h = Math.round(Number(this.svdEngine?.height) || 576);
  const cfg = this.liveVibe.find((p) => p.key === 'cfgscale') || this.liveVibe.find((p) => p.key === 'cfg');
  const strength = this.liveVibe.find((p) => p.key === 'strength');
  const steps = this.deforumSettings.steps || 20;
  const seed = this.deforumSettings.seed != null ? this.deforumSettings.seed : this.hud.seed;
  const sampler = this.deforumSettings.sampler || 'Euler a';
  const basePrompt = this.buildMorphedPrompt() || String(this.prompts.pos || '').trim();
  const prompt = this.effectivePositivePrompt(basePrompt);
  const neg = this.effectiveNegativePrompt(this.prompts.neg || '');
  const res = await fetch('/api/txt2img', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      negative_prompt: neg,
      width: w,
      height: h,
      steps,
      seed,
      sampler_name: sampler,
      cfg_scale: cfg ? Number(cfg.val) : 7,
      denoising_strength: strength ? Number(strength.val) : 0.65,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.images?.[0]) {
    throw new Error(data.error || 'Failed to generate SVD init image');
  }
  const dataUrl = `data:image/png;base64,${data.images[0]}`;
  this.svdEngine = normalizeSvdEngine({ ...this.svdEngine, svd_init_image: dataUrl });
  this.saveSessionState();
  return dataUrl;
},
async generateSvdPreviewFrame() {
  if (this.deforumPlaying) {
    this.performance.status = 'Stop animation to preview SVD';
    return false;
  }
  if (this.previewGenerating) return false;
  this.pinHeldPreviewFrame();
  this.applyCrossfadeMorph();
  this.previewGenerating = true;
  this.performance.status = 'Rendering SVD clip…';
  this.svdStatus = 'Rendering…';
  try {
    const initImage = await this.ensureSvdInitImage();
    const payload = buildSvdGeneratePayload(this.svdEngine, { initImageBase64: initImage, preview: true });
    const res = await fetch('/api/svd/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ svdEngine: this.svdEngine, payload }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      this.performance.status = data.error || 'SVD preview failed';
      this.svdStatus = data.error || 'Preview failed';
      return false;
    }
    const path = data.path || data.first_frame_path;
    if (path) {
      this.performance.lastPreviewPath = path;
      this.generator.lastPath = path;
      this.heldPreviewFramePath = path;
    }
    this.performance.status = 'SVD preview ready';
    this.svdStatus = data.xt11_available === false
      ? 'Rendered — XT 1.1 checkpoint not detected on Forge; verify models/svd'
      : 'SVD preview ready';
    this.scheduleFrameRefresh(40);
    return true;
  } catch (err) {
    this.performance.status = String(err.message || err);
    this.svdStatus = 'Preview failed';
    return false;
  } finally {
    this.previewGenerating = false;
  }
},
onWanEngineFieldChange(key, rawValue, type = 'text') {
  if (!key || !this.wanEngine) return;
  let next = rawValue;
  if (type === 'boolean') {
    next = !!rawValue;
  } else if (type === 'number') {
    const num = Number(rawValue);
    if (!Number.isFinite(num)) return;
    next = num;
  } else {
    next = String(rawValue ?? '');
  }
  this.wanEngine = { ...this.wanEngine, [key]: next };
  if (key === 'wan_resolution') {
    const size = parseWanResolution(next);
    if (size) {
      this.syncResolutionAcrossControls(size.width, size.height, { syncGpuModal: true });
    }
  }
  this.syncDeforumSettingsJson();
  this.saveSessionState();
  this.queueDeforumSettingsSave();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
},
readWanInitImage(file) {
  if (!file || !file.type?.startsWith?.('image/')) return;
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || '');
    if (!dataUrl) return;
    this.applyWanInitImageDataUrl(dataUrl);
  };
  reader.onerror = () => {};
  reader.readAsDataURL(file);
},
handleWanInitImageFile(evt) {
  const f = evt?.target?.files?.[0];
  if (f) this.readWanInitImage(f);
  if (evt?.target) evt.target.value = '';
},
handleWanInitImageDrop(evt) {
  const file = evt?.dataTransfer?.files?.[0];
  if (file) this.readWanInitImage(file);
},
clearWanInitImage() {
  this.wanEngine = normalizeWanEngine({
    ...this.wanEngine,
    wan_init_image: null,
    wan_use_init_image: false,
  });
  this.syncDeforumSettingsJson();
  this.saveSessionState();
  this.queueDeforumSettingsSave();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
},
useImg2imgAsWanInit() {
  const dataUrl = this.img2img?.dataUrl;
  if (!dataUrl) return;
  this.applyWanInitImageDataUrl(dataUrl);
},
applyWanInitImageDataUrl(dataUrl) {
  const i2vModel = String(this.wanEngine?.wan_i2v_model || '');
  const patch = {
    wan_init_image: dataUrl,
    wan_use_init_image: true,
  };
  if (!i2vModel || i2vModel === 'Use T2V Model (No Continuity)') {
    patch.wan_i2v_model = '1.3B VACE';
  }
  this.wanEngine = normalizeWanEngine({ ...this.wanEngine, ...patch });
  this.syncWanInitResolutionFromDataUrl(dataUrl);
  this.syncDeforumSettingsJson();
  this.saveSessionState();
  this.queueDeforumSettingsSave();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
},
syncWanInitResolutionFromDataUrl(dataUrl) {
  if (!dataUrl || typeof Image === 'undefined') return;
  const img = new Image();
  img.onload = () => {
    const picked = pickWanResolutionForSize(img.naturalWidth, img.naturalHeight);
    if (picked) {
      this.wanEngine = normalizeWanEngine({ ...this.wanEngine, wan_resolution: picked });
      const size = parseWanResolution(picked);
      if (size) this.syncResolutionAcrossControls(size.width, size.height, { syncGpuModal: true });
    }
    this.syncDeforumSettingsJson();
    this.saveSessionState();
  };
  img.src = dataUrl;
},
applyWanSpeedPreset(name) {
  const preset = getWanSpeedPreset(name);
  if (!preset) return;
  this.wanEngine = normalizeWanEngine({ ...this.wanEngine, ...preset });
  this.syncDeforumSettingsJson();
  this.saveSessionState();
  this.queueDeforumSettingsSave();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
},
applyWanMotionPreset(name) {
  const preset = getWanMotionPreset(name);
  if (!preset) return;
  this.wanEngine = normalizeWanEngine({ ...this.wanEngine, ...preset });
  this.syncDeforumSettingsJson();
  this.saveSessionState();
  this.queueDeforumSettingsSave();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
},
toggleWanMotionLora(id) {
  const current = Array.isArray(this.wanEngine.motion_loras) ? this.wanEngine.motion_loras : [];
  const next = current.includes(id) ? current.filter((l) => l !== id) : [...current, id];
  this.wanEngine = normalizeWanEngine({ ...this.wanEngine, motion_loras: next });
  this.syncDeforumSettingsJson();
  this.saveSessionState();
  this.queueDeforumSettingsSave();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
},
async requestWanModelDownload(packageId = 'vace-1.3b') {
  if (this.wanDownloadBusy) return;
  this.wanDownloadBusy = true;
  this.wanDownloadStatus = 'Queuing download on Forge…';
  const patch = wanEngineForDownloadPackage(packageId, this.wanEngine);
  this.wanEngine = normalizeWanEngine({ ...this.wanEngine, ...patch });
  this.syncDeforumSettingsJson();
  this.saveSessionState();
  try {
    const positive = this.buildMorphedPrompt() || String(this.prompts.pos || '').trim() || 'defora wan model download probe';
    const res = await fetch('/api/wan/download-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        packageId,
        wanEngine: this.wanEngine,
        prompt: positive,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.detail || res.statusText || 'Download request failed');
    }
    const pkg = WAN_DOWNLOAD_PACKAGES.find((p) => p.id === packageId);
    this.wanDownloadStatus = data.ok
      ? `Download triggered via Forge (${data.batchId || 'preview job'}). ${pkg?.label || packageId}`
      : (data.reason || 'Skipped');
    if (data.manual && pkg?.hfCommand) {
      this.wanDownloadStatus += ` — or run: ${pkg.hfCommand}`;
    }
  } catch (err) {
    const pkg = WAN_DOWNLOAD_PACKAGES.find((p) => p.id === packageId);
    this.wanDownloadStatus = `${err.message || err}${pkg?.hfCommand ? ` — manual: ${pkg.hfCommand}` : ''}`;
  } finally {
    this.wanDownloadBusy = false;
    this.queueDeforumSettingsSave();
  }
},
async maybeCaptureActiveStyleExample(imagePath) {
  if (!this.promptStyleAutoExample || !this.activePromptStyleId || !imagePath) return;
  await this.setPromptStyleExampleFromPath(this.activePromptStyleId, imagePath);
},
promptHistoryKey() {
  return `defora_prompt_history_${this.session || 'default'}`;
},
initPromptHistory() {
  try {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.speechPromptSupported = !!SpeechRecognition;
  } catch (_e) {
    this.speechPromptSupported = false;
  }
  try {
    const raw = window.localStorage && window.localStorage.getItem(this.promptHistoryKey());
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      this.promptHistory = data.filter((x) => typeof x === 'string' && x.trim()).slice(0, 50);
    }
  } catch (_e) { /* ignore */ }
},
savePromptHistory() {
  try {
    if (!window.localStorage) return;
    window.localStorage.setItem(this.promptHistoryKey(), JSON.stringify(this.promptHistory.slice(0, 50)));
  } catch (_e) { /* ignore */ }
},
queuePromptHistorySave(rawPrompt) {
  const s = String(rawPrompt || '').trim();
  if (!s) return;
  clearTimeout(this.promptHistoryDebounceTimer);
  this.promptHistoryDebounceTimer = setTimeout(() => {
    this.addPromptToHistory(s);
  }, 650);
},
addPromptToHistory(prompt) {
  const s = String(prompt || '').trim();
  if (!s) return;
  const next = [s, ...this.promptHistory.filter((p) => p !== s)];
  this.promptHistory = next.slice(0, 50);
  this.savePromptHistory();
},
togglePromptHistory(force) {
  const next = typeof force === 'boolean' ? force : !this.promptHistoryOpen;
  this.promptHistoryOpen = next;
  if (next) {
    // refresh from storage in case multiple tabs
    this.initPromptHistory();
  }
},
restorePromptFromHistory(prompt) {
  const s = String(prompt || '').trim();
  if (!s) return;
  this.performance.genericPrompt = s;
  this.onPerformanceInput();
  this.promptHistoryOpen = false;
},
clearGenericPrompt() {
  this.performance.genericPrompt = '';
  this.speechPromptError = '';
  this.onPerformanceInput();
},
toggleSpeechPrompt() {
  if (this.speechPromptListening) {
    this.stopSpeechPrompt();
  } else {
    this.startSpeechPrompt();
  }
},
startSpeechPrompt() {
  this.speechPromptError = '';
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    this.speechPromptSupported = false;
    this.speechPromptError = 'Microphone input not supported in this browser.';
    return;
  }
  try {
    if (this._speechPromptRecognizer) {
      try { this._speechPromptRecognizer.abort(); } catch (_e) {}
    }
    const r = new SpeechRecognition();
    this._speechPromptRecognizer = r;
    r.lang = (navigator && navigator.language) ? navigator.language : 'en-US';
    r.interimResults = true;
    r.continuous = false;
    let finalText = '';
    r.onstart = () => {
      this.speechPromptListening = true;
    };
    r.onerror = (evt) => {
      const code = evt && evt.error ? String(evt.error) : 'error';
      this.speechPromptError = code === 'not-allowed'
        ? 'Microphone permission denied.'
        : `Speech error: ${code}`;
      this.speechPromptListening = false;
    };
    r.onend = () => {
      this.speechPromptListening = false;
      if (finalText.trim()) {
        const base = String(this.performance.genericPrompt || '').trim();
        const merged = base ? `${base}, ${finalText.trim()}` : finalText.trim();
        this.performance.genericPrompt = merged;
        this.onPerformanceInput();
        this.addPromptToHistory(merged);
      }
    };
    r.onresult = (evt) => {
      try {
        const res = evt && evt.results ? evt.results : [];
        let acc = '';
        for (let i = evt.resultIndex || 0; i < res.length; i++) {
          const item = res[i];
          const alt = item && item[0] ? item[0] : null;
          if (!alt) continue;
          acc += String(alt.transcript || '');
          if (item.isFinal) finalText += String(alt.transcript || '');
        }
        // Show interim in the input (without committing to history yet)
        const base = String(this.performance.genericPrompt || '').trim();
        const interim = acc.trim();
        if (interim) {
          this.performance.genericPrompt = base ? `${base}, ${interim}` : interim;
        }
      } catch (_e) {}
    };
    r.start();
  } catch (e) {
    this.speechPromptError = String(e.message || e);
    this.speechPromptListening = false;
  }
},
stopSpeechPrompt() {
  try {
    if (this._speechPromptRecognizer) {
      try { this._speechPromptRecognizer.stop(); } catch (_e) {}
    }
  } catch (_e) {}
  this.speechPromptListening = false;
},
enqueuePreviewRequest(kind) {
  if (this.deforumPlaying) return;
  const nextKind = kind === 'deforum' ? 'deforum' : 'auto';
  while (this.previewRequestQueue.length >= this.previewQueueMaxSize) {
    this.previewRequestQueue.shift();
  }
  this.previewRequestQueue.push({ kind: nextKind });
},
async processPreviewQueue() {
  if (this.previewQueueProcessing || this.deforumPlaying) return;
  if (!this.previewRequestQueue.length) return;
  this.previewQueueProcessing = true;
  try {
    while (this.previewRequestQueue.length > 0 && !this.deforumPlaying) {
      const job = this.previewRequestQueue.shift();
      if (!job) continue;
      await this.runPreviewJob(job.kind);
    }
  } finally {
    this.previewQueueProcessing = false;
    if (this.previewRequestQueue.length && !this.deforumPlaying) {
      void this.processPreviewQueue();
    }
  }
},
async runPreviewJob(kind) {
  if (this.deforumPlaying) return;
  if (this.isSvdLayerActive) {
    await this.generateSvdPreviewFrame();
    return;
  }
  if (kind === 'deforum') {
    await this.generateDeforumPreviewFrame();
    return;
  }
  if (this.deforumPanelOpen) {
    const ok = await this.generateDeforumPreviewFrame();
    if (!ok) await this.generateImage();
  } else {
    await this.generateImage();
  }
},
queuePreviewRequest(kind, delay) {
  if (this.deforumPlaying) return;
  const nextKind = kind === 'deforum' ? 'deforum' : 'auto';
  clearTimeout(this.previewDebounceTimer);
  clearTimeout(this.deforumPreviewTimer);
  const timerKey = nextKind === 'deforum' ? 'deforumPreviewTimer' : 'previewDebounceTimer';
  this[timerKey] = setTimeout(() => {
    this[timerKey] = null;
    this.enqueuePreviewRequest(nextKind);
    void this.processPreviewQueue();
  }, delay);
},
 schedulePreviewFrame() {
  this.queuePreviewRequest('auto', 180);
 },
 scheduleDeforumPreview() {
  this.queuePreviewRequest('deforum', 300);
 },
 getDeforumField(keyPath) {
   return getNestedValue(this.deforumSettings, keyPath);
 },
formatDeforumFieldValue(field, rawValue) {
  if (!field) return String(rawValue ?? '');
  const value = rawValue == null ? '' : rawValue;
  if (field.type === 'slider' || field.type === 'number') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '';
    const stepText = String(field.step ?? '');
    const decimals = stepText.includes('.') ? stepText.split('.')[1].length : 0;
    return numeric.toFixed(decimals);
  }
  return String(value);
},
deforumFieldOptions(field) {
  if (!field) return [];
  let options = [];
  if (field.key === 'sampler') options = [...this.engineSamplerOptions];
  else if (field.key === 'scheduler') options = [...this.engineSchedulerOptions];
  else options = Array.isArray(field.options) ? [...field.options] : [];
  const current = String(this.getDeforumField(field.key) ?? '').trim();
  if (current && !options.includes(current)) options.unshift(current);
  return options;
},
isDeforumDynamicSelect(field) {
  return !!(field && (field.key === 'sampler' || field.key === 'scheduler'));
},
onDeforumSelectInput(field, rawValue) {
  if (!field || !field.key) return;
  if (field.key === 'sampler') {
    this.onEngineSamplerChange(rawValue);
    return;
  }
  if (field.key === 'scheduler') {
    this.onEngineSchedulerChange(rawValue);
    return;
  }
  this.onDeforumFieldInput(field.key, rawValue, 'text');
},
async ensureForgeSamplerSchedulerLists() {
  const hasSamplers = Array.isArray(this.forge.samplers) && this.forge.samplers.length > 0;
  const hasSchedulers = Array.isArray(this.forge.schedulers) && this.forge.schedulers.length > 0;
  if (hasSamplers && hasSchedulers) return;
  try {
    await this.refreshForgeOptions();
  } catch (_e) {
    /* forge may be offline — fallbacks still populate options */
  }
},
deforumToggleKeyForPath(keyPath) {
  return DEFORUM_DERIVED_TOGGLE_KEYS[keyPath] || keyPath;
},
isDeforumFieldToggleable(keyPath) {
  if (/^cn_\d+_/.test(String(keyPath || ''))) return false;
  if (DEFORUM_NON_TOGGLEABLE_KEYS.has(keyPath)) return false;
  const toggleKey = this.deforumToggleKeyForPath(keyPath);
  return DEFORUM_FIELD_KEYS.includes(toggleKey);
},
isDeforumFieldDisabledByAnimationMode(keyPath) {
  if (!keyPath) return false;
  if (this.deforumMode2d3d !== '2D') return false;
  return isDeforum3dOnlyFieldKey(keyPath);
},
isDeforumFieldGroupDisabledByAnimationMode(groupId) {
  return this.deforumMode2d3d === '2D' && groupId === DEFORUM_MOTION_3D_GROUP_ID;
},
isDeforumFieldEnabled(keyPath) {
  const key = String(keyPath || '');
  const cnField = key.match(/^cn_(\d+)_(\w+)$/);
  if (cnField) {
    const unit = cnField[1];
    if (cnField[2] === 'enabled') return true;
    return !!getNestedValue(this.deforumSettings, `cn_${unit}_enabled`);
  }
  if (this.isDeforumFieldDisabledByAnimationMode(keyPath)) return false;
  if (!this.isDeforumFieldToggleable(keyPath)) return true;
  const toggleKey = this.deforumToggleKeyForPath(keyPath);
  return this.deforumFieldEnabled[toggleKey] !== false;
},
setDeforumMode2d3d(mode) {
  const next = normalizeDeforumMode2d3d(mode);
  if (this.deforumMode2d3d !== next) {
    this.onDeforumFieldInput('animation_mode', next, 'text');
  }
  if (next === '2D' && this.deforumActiveTab === DEFORUM_MOTION_3D_GROUP_ID) {
    this.deforumActiveTab = 'motion';
    this.saveSessionState();
  }
},
setDeforumFieldEnabled(keyPath, enabled) {
  const key = String(keyPath || '');
  if (/^cn_\d+_/.test(key)) return;
  const toggleKey = this.deforumToggleKeyForPath(keyPath);
  if (!this.isDeforumFieldToggleable(toggleKey)) return;
  this.deforumFieldEnabled = {
    ...createDeforumFieldEnabledMap(this.deforumFieldEnabled),
    [toggleKey]: enabled !== false,
  };
  this.syncDeforumSettingsJson();
  this.saveSessionState();
  this.queueDeforumSettingsSave();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
},
activeDeforumSettings() {
  const settings = this.normalizedDeforumSettings();
  DEFORUM_FIELD_KEYS.forEach((keyPath) => {
    if (!this.isDeforumFieldEnabled(keyPath)) removeNestedValue(settings, keyPath);
  });
  if (this.deforumMode2d3d === '2D') {
    DEFORUM_3D_ONLY_FIELD_KEYS.forEach((keyPath) => removeNestedValue(settings, keyPath));
  }
  Object.entries(DEFORUM_DERIVED_TOGGLE_KEYS).forEach(([keyPath, toggleKey]) => {
    if (!this.isDeforumFieldEnabled(toggleKey)) removeNestedValue(settings, keyPath);
  });
  return settings;
},
 onDeforumSectionToggle(groupId, evt) {
   this.deforumSectionOpen[groupId] = evt.target.open;
 },
setSeedRandomEnabled(enabled) {
  if (enabled) {
    const current = Number(this.deforumSettings?.seed);
    if (Number.isFinite(current) && current >= 0) {
      this.seedFixedBackup = current;
    }
    this.onDeforumFieldInput("seed", -1, "number");
    return;
  }
  let next = Number(this.seedFixedBackup);
  if (!Number.isFinite(next) || next < 0) {
    next = Number.isFinite(Number(this.hud?.seed)) && this.hud.seed >= 0
      ? Number(this.hud.seed)
      : Math.floor(Math.random() * 2147483647);
  }
  this.onDeforumFieldInput("seed", next, "number");
},
onDeforumSeedInput(raw) {
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0) return;
  this.onDeforumFieldInput("seed", n, "number");
},
 onDeforumFieldInput(keyPath, raw, kind) {
  if (this.isDeforumFieldDisabledByAnimationMode(keyPath)) return;
   let value = raw;
   if (kind === 'number') {
     const n = parseFloat(raw);
     value = Number.isFinite(n) ? n : 0;
   } else if (kind === 'bool') {
     value = !!raw;
   } else if (keyPath === 'init_image' && raw === '') {
     value = null;
   }
   setNestedValue(this.deforumSettings, keyPath, value);
   if (keyPath === 'prompts.0') {
     const p0 = String(value || '');
     const negSplit = p0.split(/\s+--neg\s+/i);
     if (negSplit.length > 1) {
       this.prompts.pos = negSplit[0].trim();
       this.prompts.neg = negSplit.slice(1).join(' --neg ').trim();
     } else {
       this.prompts.pos = p0.trim();
     }
   }
   if (keyPath === 'negative_prompts') {
     this.prompts.neg = String(value || '');
   }
   if (keyPath === 'seed' && Number.isFinite(value)) {
     if (value >= 0) {
       this.seedFixedBackup = value;
       this.hud.seed = value;
     }
   }
  if (keyPath === 'steps' && Number.isFinite(value)) {
    this.syncStepsAcrossControls(value, { syncGpuModal: true });
  }
  if (keyPath === 'steps_schedule') {
    const scheduleValue = String(value || '');
    const scheduleScalar = (scheduleValue.match(/\(([^()]+)\)/) || [])[1] || scheduleValue;
    const parsedSteps = Math.max(1, Math.round(this.readFirstNumericValue(
      scheduleScalar,
      Number(this.forge.options && this.forge.options.steps)
        || Number(this.gpuPool && this.gpuPool.forgeModal && this.gpuPool.forgeModal.options && this.gpuPool.forgeModal.options.steps)
        || 6
    )));
    this.syncStepsAcrossControls(parsedSteps, { syncGpuModal: true, syncSchedule: false });
  }
  if (keyPath === 'sampler') {
    this.forge.options.sampler_name = String(value || '');
  }
  if (keyPath === 'scheduler') {
    this.forge.options.scheduler = String(value || '');
  }
  if (keyPath === 'W' && Number.isFinite(value)) {
    this.syncResolutionAcrossControls(value, this.deforumSettings && this.deforumSettings.H, { syncGpuModal: true });
  }
  if (keyPath === 'H' && Number.isFinite(value)) {
    this.syncResolutionAcrossControls(this.deforumSettings && this.deforumSettings.W, value, { syncGpuModal: true });
  }
  if (keyPath === 'fps' && Number.isFinite(value)) {
    if (!this._syncingGlobalFps) {
      this._syncingGlobalFps = true;
      try {
        this.syncFpsAcrossControls(value, { syncDeforum: true });
      } finally {
        this._syncingGlobalFps = false;
      }
    }
  }
  if (keyPath === 'sd_model_name') {
    this.forge.selectedModel = this.normalizeModelName(value);
  }
   this.syncDeforumSettingsJson();
  this.saveSessionState();
   this.pushDeforumLivePatch(keyPath, value);
  if (keyPath === 'steps') {
    this.pushDeforumLivePatch('steps_schedule', this.deforumSettings.steps_schedule);
  }
  if (keyPath === 'steps_schedule') {
    this.pushDeforumLivePatch('steps', this.deforumSettings.steps);
  }
   this.queueDeforumSettingsSave();
   if (!this.deforumPlaying) this.scheduleDeforumPreview();
 },
 onEngineResolutionChange(val) {
   const [w, h] = String(val).split('x').map(Number);
   if (w > 0 && h > 0) {
    this.syncResolutionAcrossControls(w, h, { syncGpuModal: true });
     this.onDeforumFieldInput('W', w, 'number');
     this.onDeforumFieldInput('H', h, 'number');
   }
 },
onImg2imgResolutionInput(axis, rawValue) {
  const fallback = {
    fallbackWidth: Number(this.img2img && this.img2img.width) || 1024,
    fallbackHeight: Number(this.img2img && this.img2img.height) || 576,
  };
  const current = this.currentResolution(fallback);
  const nextWidth = axis === 'width' ? rawValue : current.width;
  const nextHeight = axis === 'height' ? rawValue : current.height;
  const next = this.syncResolutionAcrossControls(nextWidth, nextHeight, { syncGpuModal: true });
  this.syncDeforumSettingsJson();
  this.saveSessionState();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
  return next;
},
onGpuForgeModalResolutionInput(axis, rawValue) {
  const modal = this.gpuPool && this.gpuPool.forgeModal;
  if (!modal || !modal.options) return null;
  const nextWidth = axis === 'width' ? rawValue : modal.options.width;
  const nextHeight = axis === 'height' ? rawValue : modal.options.height;
  const next = this.syncResolutionAcrossControls(nextWidth, nextHeight, { syncGpuModal: true });
  this.syncDeforumSettingsJson();
  this.saveSessionState();
  if (!this.deforumPlaying) this.scheduleDeforumPreview();
  return next;
},
 pushDeforumLivePatch(keyPath, value) {
  if (!this.isDeforumFieldEnabled(keyPath)) return;
   const patch = patchFromKeyPath(keyPath, value);
   this.sendControl('liveParam', patch);
 },
 syncDeforumSettingsJson() {
   try {
    this.deforumSettingsJson = JSON.stringify(this.activeDeforumSettings(), null, 2);
     this.deforumSettingsJsonError = '';
   } catch (e) {
     this.deforumSettingsJsonError = String(e.message || e);
   }
 },
 runDeforumSettingsVerify({ forSave = false } = {}) {
   if (this.deforumAdvancedOpen) {
     try {
       this.applyDeforumSettingsJson();
     } catch (_e) {
       this.deforumVerifyResults = {
         ok: false,
         errors: [{ field: 'JSON', message: this.deforumSettingsJsonError || 'Invalid JSON' }],
         warnings: [],
       };
       this.deforumSettingsStatus = 'Fix JSON before verifying';
       return this.deforumVerifyResults;
     }
   }
   const settings = forSave ? this.activeDeforumSettings() : this.normalizedDeforumSettings();
   this.deforumVerifyResults = verifyDeforumSettings(settings, { onlyDefinedKeys: forSave });
   const { errors, warnings } = this.deforumVerifyResults;
   if (!errors.length && !warnings.length) {
     this.deforumSettingsStatus = 'Settings look good';
   } else {
     this.deforumSettingsStatus = `${errors.length} error(s), ${warnings.length} optimization hint(s)`;
   }
   return this.deforumVerifyResults;
 },
 guardDeforumSettingsBeforeRun(actionLabel = 'continue') {
   const hasWindow = typeof window !== 'undefined';
   if (this.deforumAdvancedOpen && this.deforumSettingsJsonError) {
     if (hasWindow) window.alert(`Fix JSON errors before you ${actionLabel}.`);
     else this.deforumSettingsStatus = `Fix JSON errors before you ${actionLabel}`;
     return false;
   }
   if (this.deforumAdvancedOpen) {
     try {
       this.applyDeforumSettingsJson();
     } catch (_e) {
       if (hasWindow) window.alert(`Invalid settings JSON — fix errors before you ${actionLabel}.`);
       else this.deforumSettingsStatus = `Invalid JSON — cannot ${actionLabel}`;
       return false;
     }
   }
   const forSave = /save/i.test(String(actionLabel));
   const result = this.runDeforumSettingsVerify({ forSave });
   if (result.errors.length) {
     const lines = result.errors.map((i) => `• ${i.field}: ${i.message}`).join('\n');
     if (hasWindow) {
       window.alert(`Cannot ${actionLabel} — fix these settings first:\n\n${lines}\n\nUse Verify in the JSON panel for the full list.`);
     } else {
       this.deforumSettingsStatus = `Cannot ${actionLabel}: ${result.errors.length} error(s)`;
     }
     return false;
   }
   if (result.warnings.length) {
     const preview = result.warnings.slice(0, 10);
     const lines = preview.map((i) => `• ${i.field}: ${i.message}`).join('\n');
     const more = result.warnings.length > 10
       ? `\n…and ${result.warnings.length - 10} more (open Verify for the full list)`
       : '';
     let ok = true;
     if (hasWindow) {
       ok = window.confirm(
         `Settings may not be optimal:\n\n${lines}${more}\n\n${actionLabel} anyway?`
       );
     }
     if (!ok) return false;
   }
   return true;
 },
 applyDeforumSettingsJson() {
   try {
     const parsed = JSON.parse(this.deforumSettingsJson);
     if (!parsed || typeof parsed !== 'object') throw new Error('JSON must be an object');
    this.deforumSettings = mergeDeforumSettings(this.normalizedDeforumSettings(), parsed);
    this.syncStepsAcrossControls(this.deforumSettings.steps, { syncGpuModal: false });
     this.deforumSettingsJsonError = '';
    const desiredModel = this.syncSelectedModelFromDeforumSettings();
    if (desiredModel) {
      void this.switchForgeModel(desiredModel, { persistDeforumSettings: true });
    } else {
      this.queueDeforumSettingsSave();
    }
     if (!this.deforumPlaying) this.scheduleDeforumPreview();
   } catch (e) {
     this.deforumSettingsJsonError = String(e.message || e);
   }
 },
async loadDeforumSettings({ syncServerModel = true } = {}) {
  this.deforumSettingsLoading = true;
   try {
     const res = await fetch('/api/deforum/settings');
     const data = await res.json();
    if (!this.sessionDeforumSettingsLoaded && data.settings && typeof data.settings === 'object') {
       this.deforumSettings = mergeDeforumSettings({ ...DEFORUM_DEFAULT_SETTINGS }, data.settings);
       this.deforumSettings = this.normalizedDeforumSettings();
     }
    if (this.deforumSettings && this.session) {
      this.deforumSettings = { ...this.deforumSettings, batch_name: this.session };
    }
    this.syncStepsAcrossControls(this.deforumSettings.steps, { syncGpuModal: false });
    this.syncSelectedModelFromDeforumSettings();
     this.syncDeforumSettingsJson();
    this.syncDeforumCnSlotsFromSettings();
    this.deforumSettingsStatus = this.sessionDeforumSettingsLoaded ? 'Loaded local session' : 'Loaded';
    if (syncServerModel) {
      await this.restoreLastModel();
    }
   } catch (e) {
     this.deforumSettingsStatus = 'Load failed';
     console.error('loadDeforumSettings', e);
  } finally {
    this.deforumSettingsLoading = false;
   }
 },
 queueDeforumSettingsSave() {
   clearTimeout(this.deforumSaveTimer);
   this.deforumSaveTimer = setTimeout(() => this.saveDeforumSettings(), 800);
 },
 async saveDeforumSettings() {
  this.deforumSettingsSaving = true;
   try {
    const settings = this.activeDeforumSettings();
    const promptStyles = this.buildPromptStyleJobSnapshot();
     const res = await fetch('/api/deforum/settings', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ settings, promptStyles }),
     });
     const data = await res.json();
     if (!res.ok || data.error) {
       this.deforumSettingsStatus = data.error || 'Save failed';
       return;
     }
    if (data.modelSync && data.modelSync.success && data.modelSync.model) {
      const modelName = data.modelSync.model.model_name || data.modelSync.model.title || '';
      this.applyLoadedModelSelection(modelName, { queueDeforumSave: false });
    }
     this.deforumSettingsStatus = 'Saved';
   } catch (e) {
     this.deforumSettingsStatus = 'Save failed';
  } finally {
    this.deforumSettingsSaving = false;
   }
 },
 async generateDeforumPreviewFrame() {
   if (this.deforumPlaying) {
     this.performance.status = 'Stop animation to preview single frames';
     return false;
   }
   if (!this.guardDeforumSettingsBeforeRun('render a preview frame')) return false;
   if (this.previewGenerating) return false;
   this.pinHeldPreviewFrame();
   this.applyCrossfadeMorph();
   this.applyDeforumControlNetForRun();
   this.previewGenerating = true;
   this.performance.status = 'Rendering Deforum frame…';
   this.deforumSettingsStatus = 'Rendering…';
   this.startForgePreviewProgressPoll({ maxFrames: 1 });
   try {
    const settings = this.effectiveDeforumSettingsForRender();
    const promptStyles = this.buildPromptStyleJobSnapshot();
     const res = await fetch('/api/deforum/preview', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ settings, promptStyles }),
     });
     const data = await res.json();
     if (!res.ok || data.error) {
       this.performance.status = data.error || 'Deforum preview failed';
       this.deforumSettingsStatus = 'Preview failed';
       return false;
     }
     const finalPath = data.path;
     this.performance.lastPreviewPath = finalPath;
     this.generator.lastPath = finalPath;
     this.heldPreviewFramePath = finalPath;
     this.forgeLivePreviewImage = '';
     this.persistDeforumContinuationFromThumb(
       { src: finalPath, path: finalPath, name: String(finalPath || '').split('/').pop() || '' },
       { queueSave: true, saveSession: true, checkpoint: true },
     );
     this.performance.status = 'Deforum frame ready';
     this.deforumSettingsStatus = 'Frame ready';
    this.scheduleFrameRefresh(40);
     void this.maybeCaptureActiveStyleExample(finalPath);
     return true;
   } catch (err) {
     this.performance.status = String(err.message || err);
     this.deforumSettingsStatus = 'Preview failed';
     return false;
   } finally {
     this.stopForgePreviewProgressPoll();
     this.previewProgressPct = null;
     this.previewGenerating = false;
   }
 },
 async generatePreviewFrame() {
  if (this.deforumPlaying) return false;
  this.enqueuePreviewRequest(this.deforumPanelOpen ? 'deforum' : 'auto');
  await this.processPreviewQueue();
  return !this.previewRequestQueue.length;
 },
 async generateImage() {
   if (this.deforumPlaying) {
     this.performance.status = 'Stop animation to preview single frames';
     return;
   }
   if (this.previewGenerating) return;
   this.pinHeldPreviewFrame();
   this.applyCrossfadeMorph();
   this.previewGenerating = true;
   this.performance.status = 'Generating preview frame…';
   this.startForgePreviewProgressPoll({ maxFrames: 1 });
   const cfg = this.liveVibe.find((p) => p.key === 'cfgscale') || this.liveVibe.find((p) => p.key === 'cfg');
   const strength = this.liveVibe.find((p) => p.key === 'strength');
   const w = this.deforumSettings.W || 1024;
   const h = this.deforumSettings.H || 576;
   const steps = this.deforumSettings.steps || 12;
   const seed = this.deforumSettings.seed != null ? this.deforumSettings.seed : this.hud.seed;
   const sampler = this.deforumSettings.sampler || 'Euler a';
   const baseNeg = this.deforumSettings.negative_prompts || this.prompts.neg || '';
   const basePrompt =
     getNestedValue(this.deforumSettings, 'prompts.0') ||
     this.buildMorphedPrompt();
   const prompt = this.effectivePositivePrompt(basePrompt);
   const neg = this.effectiveNegativePrompt(baseNeg);
   try {
    this.deforumSettings = this.normalizedDeforumSettings();
     const res = await fetch('/api/txt2img', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         prompt,
         negative_prompt: neg,
         steps,
         cfg_scale: cfg ? cfg.val : 7,
         width: w,
         height: h,
         seed,
         sampler_name: sampler,
        settings: this.deforumSettings,
       }),
     });
     const data = await res.json();
     if (!res.ok || data.error) {
       this.performance.status = data.error || 'Preview failed';
       return;
     }
     this.performance.lastPreviewPath = data.path;
     this.generator.lastPath = data.path;
     this.heldPreviewFramePath = data.path;
     this.forgeLivePreviewImage = '';
     this.performance.status = 'Preview frame ready';
    this.scheduleFrameRefresh(120);
     void this.maybeCaptureActiveStyleExample(data.path);
   } catch (err) {
     this.performance.status = String(err.message || err);
   } finally {
     this.stopForgePreviewProgressPoll();
     this.previewProgressPct = null;
     this.previewGenerating = false;
   }
 },

// Forge settings methods
 async refreshForgeStatus() {
   this.forge.loading = true;
   try {
     const res = await fetch('/api/status');
     const data = await res.json();
     if (data.sdForge) {
       this.forge.available = data.sdForge.available;
     } else {
       this.forge.available = false;
     }
   } catch (err) {
     this.forge.available = false;
   } finally {
     this.forge.loading = false;
   }
 },
 async saveForgeConnection() {
   try {
     const res = await fetch('/api/forge/options', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({}),
     });
     await res.json();
     await this.refreshForgeStatus();
   } catch (err) {
     console.error('Failed to save connection', err);
   }
 },
 async refreshForgeModels() {
   try {
     const { data } = await apiFetch('/api/sd-models', {}, 'sd-models list');
     this.forge.models = data.models || [];
     this.forge.modelsSource = data.source || '';
    const matched = this.findForgeModelEntry(this.forge.currentModel || this.forge.selectedModel);
    if (matched && matched.metadata) {
      this.forge.modelInfo = matched.metadata;
    }
   } catch (_) {
     this.forge.modelsSource = '';
   }
 },
async switchForgeModel(
  modelName = this.forge.selectedModel,
  { persistDeforumSettings = false, applyOptimizedDefaults = false } = {}
) {
  const requestedModel = this.normalizeModelName(modelName);
  if (!requestedModel) return false;
  this.forge.selectedModel = requestedModel;
  if (this.normalizeModelName(this.forge.currentModel) === requestedModel) {
    this.applyLoadedModelSelection(requestedModel, { queueDeforumSave: persistDeforumSettings });
    if (applyOptimizedDefaults) {
      const applied = this.applyModelOptimizedDefaults(requestedModel);
      if (applied && persistDeforumSettings) this.queueDeforumSettingsSave();
    }
    if (!this.deforumPlaying) this.schedulePreviewFrame();
    return true;
  }
   this.forge.switching = true;
   try {
     const res = await fetch('/api/sd-models/switch', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_name: requestedModel }),
     });
     const data = await res.json();
     if (data.success) {
      const resolvedModel = this.normalizeModelName((data.model && (data.model.model_name || data.model.title)) || requestedModel);
      this.applyLoadedModelSelection(resolvedModel, { queueDeforumSave: persistDeforumSettings });
       if (data.model && data.model.metadata) {
         this.forge.modelInfo = data.model.metadata;
       }
      if (applyOptimizedDefaults) {
        const applied = this.applyModelOptimizedDefaults(data.model || resolvedModel);
        if (applied && persistDeforumSettings) this.queueDeforumSettingsSave();
      }
       if (!this.deforumPlaying) this.schedulePreviewFrame();
      return true;
     }
    throw new Error(data.error || data.message || 'Failed to switch model');
   } catch (err) {
     console.error('Failed to switch model', err);
    this.deforumSettingsStatus = `Model sync failed: ${err.message || err}`;
    return false;
   } finally {
     this.forge.switching = false;
   }
 },
 async refreshForgeOptions() {
   try {
     const [optRes, sampRes, schedRes, vaeRes, curRes] = await Promise.all([
       fetch('/api/forge/options'),
       fetch('/api/forge/samplers'),
       fetch('/api/forge/schedulers'),
       fetch('/api/forge/vae'),
       fetch('/api/sd-models/current'),
     ]);
     const opt = await optRes.json();
     const samp = await sampRes.json();
     const sched = await schedRes.json();
     const vae = await vaeRes.json();
     const cur = await curRes.json();

     this.forge.available = opt.available;
     this.forge.samplers = samp.samplers || [];
     this.forge.schedulers = sched.schedulers || [];
     this.forge.vaeList = vae.vae || [];
     if (cur.model) {
      const currentModel = cur.model.model_name || cur.model.title || '';
      this.applyLoadedModelSelection(currentModel, { queueDeforumSave: false, saveSession: false });
      if (cur.model.metadata) {
        this.forge.modelInfo = cur.model.metadata;
      }
     }

     const o = opt.options || {};
     const keys = ['sampler_name', 'scheduler', 'steps', 'cfg_scale', 'width', 'height', 'batch_size', 'sd_vae', 'clip_skip', 'eta_ddim', 'eta_ancestral', 'sigma_churn', 'enable_emphasis', 'use_old_sampling', 'do_not_add_watermark'];
     for (const k of keys) {
       if (o[k] !== undefined) this.forge.options[k] = o[k];
     }
   } catch (err) {
     console.error('Failed to load forge options', err);
   }
 },
 async applyForgeOptions() {
   const keys = ['sampler_name', 'scheduler', 'steps', 'cfg_scale', 'width', 'height', 'batch_size', 'sd_vae', 'clip_skip', 'eta_ddim', 'eta_ancestral', 'sigma_churn', 'enable_emphasis', 'use_old_sampling', 'do_not_add_watermark'];
   const updates = {};
   for (const k of keys) {
     updates[k] = this.forge.options[k];
   }
   try {
     const res = await fetch('/api/forge/options', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(updates),
     });
     const data = await res.json();
     if (!data.success) {
       console.error('Failed to apply options', data);
     }
   } catch (err) {
     console.error('Failed to apply forge options', err);
   }
 },
 async refreshForgeAll() {
   await Promise.all([
     this.refreshForgeStatus(),
     this.refreshForgeModels(),
     this.refreshForgeOptions(),
   ]);
 },

  },
}
</script>
