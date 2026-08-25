#!/usr/bin/env node
/**
 * Regenerate src/app-definition.js from src/App.vue for Node test harness parity (audit A-01).
 * Utility modules stay ESM for Vite; their bodies are inlined here as plain JS for require().
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const appVuePath = join(root, 'src', 'App.vue');
const outPath = join(root, 'src', 'app-definition.js');

// Single-line imports must be processed before multi-line blocks (api-utils regex is greedy).
const UTIL_MODULES = ['animation-plugins/motion-loras.mjs', 'utils/morph-utils.mjs', 'utils/deforum-settings-schema.mjs', 'utils/deforum-settings-verify.mjs', 'utils/api-utils.js', 'shared/run-detail-json.mjs', 'shared/prompt-styles.mjs', 'shared/engine-config.mjs', 'shared/freecut-bridge.mjs', 'shared/deforum-continuation.mjs', 'shared/story-llm-request.mjs', 'shared/protoplanet-gpgpu.mjs', 'shared/periodic-table-settings.mjs', 'shared/engine-settings-snapshot.mjs', 'shared/deforum-controlnet-config.mjs', 'shared/wan-engine-config.mjs', 'shared/svd-engine-config.mjs', 'animation-plugins/animatelcm-engine-config.mjs', 'animation-plugins/common-visual.mjs'];

function extractVueTemplate(src, label) {
  const templateOpen = src.indexOf('<template>');
  const scriptOpen = src.indexOf('<script>');
  if (templateOpen < 0 || scriptOpen < 0 || templateOpen > scriptOpen) {
    throw new Error(`Could not parse template for ${label}`);
  }
  return src
    .slice(templateOpen + '<template>'.length, src.lastIndexOf('</template>', scriptOpen))
    .trim();
}

function esmToInlineCjs(src) {
  return src
    .replace(/^export\s+(async\s+)?function\s+/gm, '$1function ')
    .replace(/^export\s+const\s+/gm, 'const ')
    .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
    .replace(/^module\.exports\s*=[\s\S]*$/m, '')
    .trim();
}

function inlineUtilModule(mod) {
  const path = join(root, 'src', mod);
  let body = esmToInlineCjs(readFileSync(path, 'utf8'));
  if (mod !== 'animation-plugins/motion-loras.mjs') {
    body = body.replace(
      /import\s+\{[^}]*\}\s+from\s+['"](?:\.\/motion-loras\.mjs|\.\.\/animation-plugins\/motion-loras\.mjs|\.\/(?:\.\.\/)?animation-plugins\/motion-loras\.mjs)['"];?\s*/g,
      '',
    );
  }
  return `// --- inlined from ${mod} (ESM source; do not edit) ---\n${body}\n`;
}

const vue = readFileSync(appVuePath, 'utf8');
const scriptOpen = vue.indexOf('<script>');
const scriptMatch = vue.match(/<script>([\s\S]*?)<\/script>/);
if (scriptOpen < 0 || !scriptMatch) {
  console.error('Could not parse App.vue script');
  process.exit(1);
}
const templateOpen = vue.indexOf('<template>');
if (templateOpen < 0 || templateOpen > scriptOpen) {
  console.error('Could not parse App.vue template');
  process.exit(1);
}
// Outermost SFC template only (inner <template v-if> must not end the match early).
const template = vue
  .slice(templateOpen + '<template>'.length, vue.lastIndexOf('</template>', scriptOpen))
  .trim();
let script = scriptMatch[1].trim();
script = script.replace(/import\s+['"]\.\/style\.css['"];?\s*/g, '');

const VUE_BUILTIN_TAGS = new Set([
  'Template',
  'Component',
  'Slot',
  'Transition',
  'TransitionGroup',
  'KeepAlive',
  'Teleport',
  'Suspense',
]);

function collectAppTemplateComponentTags(tpl) {
  const tags = new Set();
  const re = /<\/?([A-Z][A-Za-z0-9]*)\b/g;
  let m;
  while ((m = re.exec(tpl)) !== null) {
    const name = m[1];
    if (!VUE_BUILTIN_TAGS.has(name)) tags.add(name);
  }
  return tags;
}

function collectImportedVueComponents(scriptBody) {
  const names = new Set();
  const re = /import\s+([A-Za-z0-9_$]+)\s+from\s+['"][^'"]+\.vue['"]/g;
  let m;
  while ((m = re.exec(scriptBody)) !== null) names.add(m[1]);
  return names;
}

function collectRegisteredComponents(scriptBody) {
  const names = new Set();
  const match = scriptBody.match(/components\s*:\s*\{([^}]*)\}/);
  if (!match) return names;
  for (const part of match[1].split(',')) {
    const token = part.trim();
    if (!token) continue;
    // Support `Foo` and `Foo: Foo` / `Foo: Bar`
    const key = token.split(':')[0].trim();
    if (/^[A-Za-z_$][\w$]*$/.test(key)) names.add(key);
  }
  return names;
}

{
  const used = collectAppTemplateComponentTags(template);
  const imported = collectImportedVueComponents(script);
  const registered = collectRegisteredComponents(script);
  const missing = [...used].filter((name) => !imported.has(name) && !registered.has(name));
  if (missing.length) {
    console.error(
      'App.vue template references components that are not imported/registered:\n  - ' +
        missing.sort().join('\n  - ')
    );
    process.exit(1);
  }
  const importedNotRegistered = [...imported].filter((name) => !registered.has(name));
  if (importedNotRegistered.length) {
    console.error(
      'App.vue imports Vue components that are missing from components: { }:\n  - ' +
        importedNotRegistered.sort().join('\n  - ')
    );
    process.exit(1);
  }
}

let inlinedUtils = '';
let motionLorasInlined = false;
for (const mod of UTIL_MODULES) {
  const escapedMod = mod.replace(/\./g, '\\.');
  // Disallow crossing into the next import block (multiline `import {` is non-greedy but
  // still pairs the first `import {` with a later `from` clause).
  const re = new RegExp(
    `import\\s+\\{((?:(?!\\bimport\\s+\\{)[\\s\\S])*?)\\}\\s+from\\s+['"]\\.\\/${escapedMod}['"];?`
  );
  const m = script.match(re);
  if (m) {
    if (
      !motionLorasInlined &&
      (mod === 'shared/wan-engine-config.mjs' ||
        mod === 'animation-plugins/animatelcm-engine-config.mjs')
    ) {
      inlinedUtils += inlineUtilModule('animation-plugins/motion-loras.mjs');
      motionLorasInlined = true;
    }
    inlinedUtils += inlineUtilModule(mod);
    script = script.replace(m[0], '');
  }
}
if (inlinedUtils) inlinedUtils += '\n';

function normalizeRelPath(baseRelPath, importPath) {
  const baseDir = dirname(join(root, 'src', baseRelPath.replace(/^\.\//, '')));
  const resolved = join(baseDir, importPath).replace(/\\/g, '/');
  const srcRoot = join(root, 'src').replace(/\\/g, '/');
  return `./${resolved.slice(srcRoot.length + 1)}`;
}

const emittedComponentStubs = new Set();
const emittedComponentPaths = new Set();
let needsAppViewProxyStub = false;

function extractObjectClause(scriptBody, key) {
  const idx = scriptBody.indexOf(`${key}:`);
  if (idx < 0) return '';
  const start = scriptBody.indexOf('{', idx);
  if (start < 0) return '';
  let depth = 0;
  for (let i = start; i < scriptBody.length; i++) {
    const ch = scriptBody[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return `, ${key}: ${scriptBody.slice(start, i + 1)}`;
      }
    }
  }
  return '';
}

function extractMethodsClause(scriptBody) {
  return extractObjectClause(scriptBody, 'methods');
}

function extractComputedClause(scriptBody) {
  return extractObjectClause(scriptBody, 'computed');
}

function extractDataFunctionClause(scriptBody) {
  const idx = scriptBody.indexOf('data()');
  if (idx < 0) return '';
  const returnIdx = scriptBody.indexOf('return', idx);
  if (returnIdx < 0) return '';
  const start = scriptBody.indexOf('{', returnIdx);
  if (start < 0) return '';
  let depth = 0;
  for (let i = start; i < scriptBody.length; i++) {
    const ch = scriptBody[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return `, data() { return ${scriptBody.slice(start, i + 1)} }`;
      }
    }
  }
  return '';
}

function extractComponentDefinition(scriptBody) {
  const usesProxy =
    /\bproxyAppView\b/.test(scriptBody)
    && (scriptBody.includes('return proxyAppView') || /\.\.\.\s*proxyAppView\s*\(/.test(scriptBody));
  const propsMatch = scriptBody.match(/props:\s*\{([\s\S]*?)\n\s*\},/);
  let propsClause = "props: ['app']";
  if (propsMatch) {
    propsClause = `props: {${propsMatch[1]}\n  }`;
  }
  const setupClause = usesProxy ? ', setup(props) { return __proxyAppView(props); }' : '';
  // Proxy-backed panels delegate to app; inlining local data/computed/methods breaks the test harness.
  const dataClause = usesProxy ? '' : extractDataFunctionClause(scriptBody);
  const methodsClause = usesProxy ? '' : extractMethodsClause(scriptBody);
  const computedClause = usesProxy ? '' : extractComputedClause(scriptBody);
  return { propsClause, setupClause, dataClause, methodsClause, computedClause, usesProxy };
}

function motionPathPreviewStub(name) {
  return `const ${name} = { props: ['deforumSettings', 'motionValues', 'preferLiveValues', 'playing'], template: '<div class="motion-path-preview" data-testid="motion-path-preview"><div class="motion-path-preview__header"><div class="framesync-subtitle motion-path-preview__title">3D motion preview</div></div><div class="motion-path-preview__stage"></div></div>' };`;
}

const FULL_STUB_SUFFIXES = [
  'RunsBrowserPanel.vue',
  'FrameRailPanel.vue',
  'SequencerControlsPanel.vue',
  'StylesSettingsPanel.vue',
  'VideoSwarmBrowser.vue',
  'ProjectsBrowser.vue',
  'VideosBrowser.vue',
  'LibraryBrowserShell.vue',
  'LibraryMediaCard.vue',
  'LibraryAudioCard.vue',
  'AudioBrowser.vue',
  'AnimationEnginePanel.vue',
  'LiveEngineControls.vue',
  'CrossfaderPanel.vue',
  'DeforumJobToolbar.vue',
  'LiveParametersPanel.vue',
  'DeforumMotionPads.vue',
  'DeforumControlPanel.vue',
  'DeforumSettingsBody.vue',
  'ModulationMappingsPanel.vue',
  'animation-plugins/CompositorControls.vue',
  'animation-plugins/AnimationEnginePluginPanel.vue',
  'animation-plugins/WebGLPluginPanel.vue',
  'animation-plugins/WanPluginPanel.vue',
  'animation-plugins/DeforumPluginPanel.vue',
  'animation-plugins/EngineLayerControls.vue',
  'animation-plugins/CommonVisualStrip.vue',
];

function usesFullComponentStub(relPath) {
  const relKey = relPath.replace(/^\.\//, '');
  return relKey.includes('/views/') || FULL_STUB_SUFFIXES.some((p) => relKey.endsWith(p));
}

function ensureComponentStub(name, relPath, lines, seen = new Set()) {
  const relKey = relPath.replace(/^\.\//, '');
  if (seen.has(relKey) || emittedComponentPaths.has(relKey)) return;
  seen.add(relKey);
  emittedComponentPaths.add(relKey);

  if (relKey.endsWith('components/VideoSwarmBrowser.vue')) {
    needsAppViewProxyStub = true;
    lines.push(
      `const ${name} = { props: {
    app: { type: Object, required: true },
  }, setup(props) { return __proxyAppView(props); }, template: ${JSON.stringify(
        `<div class="video-swarm-browser" data-testid="video-swarm-browser">
  <div class="video-swarm-browser__toolbar">
    <button type="button" class="framesync-button framesync-button--compact" data-testid="video-swarm-new-folder" @click="createSystemFolder && createSystemFolder()">
      New folder
    </button>
    <button type="button" class="framesync-button framesync-button--compact" data-testid="video-swarm-view-videos-only" @click="toggleSystemFilesVideosOnly && toggleSystemFilesVideosOnly()">
      Videos only
    </button>
    <button type="button" class="framesync-button framesync-button--compact" data-testid="video-swarm-connect-cloud" @click="openCloudConnect && openCloudConnect()">
      Cloud
    </button>
  </div>
</div>`
      )} };`
    );
    emittedComponentStubs.add(name);
    return;
  }

  const componentPath = join(root, 'src', relKey);
  const componentSrc = readFileSync(componentPath, 'utf8');
  const componentTemplate = extractVueTemplate(componentSrc, relPath);
  const scriptMatch = componentSrc.match(/<script>([\s\S]*?)<\/script>/);
  const { propsClause, setupClause, dataClause, methodsClause, computedClause, usesProxy } = scriptMatch
    ? extractComponentDefinition(scriptMatch[1])
    : { propsClause: "props: ['app']", setupClause: ', setup(props) { return __proxyAppView(props); }', dataClause: '', methodsClause: '', computedClause: '', usesProxy: true };
  if (usesProxy) {
    needsAppViewProxyStub = true;
  }

  const childComponents = [];
  if (scriptMatch) {
    const importRe = /import\s+([A-Za-z0-9_$]+)\s+from\s+['"](\.\.?\/[^'"]+\.vue)['"]/g;
    let m;
    while ((m = importRe.exec(scriptMatch[1])) !== null) {
      const [, importName, importRel] = m;
      const nestedRel = normalizeRelPath(relPath, importRel);
      if (usesFullComponentStub(nestedRel)) {
        ensureComponentStub(importName, nestedRel, lines, seen);
      } else if (nestedRel.includes('/generate/')) {
        if (!emittedComponentStubs.has(importName)) {
          lines.push(`const ${importName} = { props: ['duration', 'playhead', 'markers', 'clips', 'selectedClipId', 'tracks', 'selectedTrackId', 'paramMeta', 'frames', 'fps', 'jobFrameNumber', 'jobTotalFrames', 'jobFrameLive', 'compact', 'expandable'], template: '<div class="timeline-stub"></div>' };`);
          emittedComponentStubs.add(importName);
        }
      } else if (nestedRel.endsWith('MotionPathPreview.vue')) {
        if (!emittedComponentStubs.has(importName)) {
          lines.push(motionPathPreviewStub(importName));
          emittedComponentStubs.add(importName);
        }
      } else if (nestedRel.endsWith('XYController.vue')) {
        if (!emittedComponentStubs.has(importName)) {
          lines.push(`const ${importName} = { props: { x: { type: Number, default: 0 }, y: { type: Number, default: 0 }, rangeX: { type: Number, default: 1 }, rangeY: { type: Number, default: 1 }, xAxis: { type: String, default: 'translation_x' }, yAxis: { type: String, default: 'translation_y' }, axisOptions: { type: Array, default: () => [] }, variant: { type: String, default: 'move' }, testId: { type: String, default: 'xy-controller' }, showReadout: { type: Boolean, default: true }, compact: { type: Boolean, default: true }, springBack: { type: Boolean, default: true }, springDurationMs: { type: Number, default: 280 } }, emits: ['input', 'drag-start', 'release', 'update:xAxis', 'update:yAxis'], components: { UiIcon: { props: ['name'], template: '<span class="ui-icon-stub"></span>' } }, template: '<div class="xy-controller xy-controller--compact" :data-testid="testId"><button :data-testid="testId + \\'-axis-x\\'"></button><button :data-testid="testId + \\'-axis-y\\'"></button><div class="xy-controller__pad motion-pad-hero"></div></div>' };`);
          emittedComponentStubs.add(importName);
        }
      } else if (nestedRel.endsWith('AnimateLcmPluginPanel.vue')) {
        if (!emittedComponentStubs.has(importName)) {
          lines.push(`const ${importName} = { props: ['app'], setup(props) { return __proxyAppView(props); }, template: '<div data-testid="animatelcm-plugin-panel"></div>' };`);
          emittedComponentStubs.add(importName);
        }
      } else if (nestedRel.endsWith('SvdPluginPanel.vue')) {
        if (!emittedComponentStubs.has(importName)) {
          lines.push(`const ${importName} = { props: ['app'], setup(props) { return __proxyAppView(props); }, template: '<div data-testid="svd-plugin-panel"></div>' };`);
          emittedComponentStubs.add(importName);
        }
      } else if (nestedRel.endsWith('EngineGlobalConfigPanel.vue')) {
        if (!emittedComponentStubs.has(importName)) {
          lines.push(`const ${importName} = { props: ['app'], setup(props) { return __proxyAppView(props); }, template: '<div data-testid="engine-global-config"></div>' };`);
          emittedComponentStubs.add(importName);
        }
      } else if (nestedRel.endsWith('DeforumJobToolbar.vue')) {
        if (!emittedComponentStubs.has(importName)) {
          lines.push(`const ${importName} = { props: ['app'], setup(props) { return __proxyAppView(props); }, template: '<div data-testid="deforum-job-toolbar"></div>' };`);
          emittedComponentStubs.add(importName);
        }
      } else if (nestedRel.endsWith('DeforumPluginPanel.vue')) {
        if (!emittedComponentStubs.has(importName)) {
          lines.push(`const ${importName} = { props: ['app'], setup(props) { return __proxyAppView(props); }, template: '<div data-testid="deforum-plugin-panel"></div>' };`);
          emittedComponentStubs.add(importName);
        }
      } else if (nestedRel.endsWith('DeforumControlNetPanel.vue')) {
        if (!emittedComponentStubs.has(importName)) {
          lines.push(`const ${importName} = { props: ['app'], setup(props) { return __proxyAppView(props); }, template: '<div data-testid="deforum-controlnet-panel"><button data-testid="deforum-cn-unit-1" class="chip chip--active"></button><button data-testid="deforum-cn-unit-2" class="chip"></button></div>' };`);
          emittedComponentStubs.add(importName);
        }
      } else if (!emittedComponentStubs.has(importName)) {
        lines.push(`const ${importName} = { props: ['app'], template: '<div></div>' };`);
        emittedComponentStubs.add(importName);
      }
      childComponents.push(`${importName}: ${importName}`);
    }
  }

  const componentsClause = childComponents.length
    ? `, components: { ${childComponents.join(', ')} }`
    : '';
  lines.push(
    `const ${name} = { ${propsClause}${setupClause}${dataClause}${computedClause}${methodsClause}${componentsClause}, template: ${JSON.stringify(componentTemplate)} };`
  );
  emittedComponentStubs.add(name);
}

const componentStubs = [];
script = script.replace(
  /^import\s+([A-Za-z0-9_$]+)\s+from\s+['"](\.\/components\/[^'"]+\.vue)['"];?\s*$/gm,
  (_, name, relPath) => {
    if (usesFullComponentStub(relPath)) {
      ensureComponentStub(name, relPath, componentStubs);
      return '';
    }
    if (!emittedComponentStubs.has(name)) {
      const glassStub = name === 'GlassPanel'
        ? `const ${name} = { props: ['size'], template: '<div class="glass-panel"><slot name="header"></slot><slot></slot></div>' };`
        : `const ${name} = { props: ['app'], template: '<div></div>' };`;
      componentStubs.push(glassStub);
      emittedComponentStubs.add(name);
    }
    return '';
  }
);
const proxyStubBlock = needsAppViewProxyStub
  ? `function __hasOwnProp(props, key) {
  return Object.prototype.hasOwnProperty.call(props, key);
}

function __proxyAppView(props) {
  return new Proxy({}, {
    get(_target, key) {
      if (__hasOwnProp(props, 'app') && key === 'app') return props.app;
      if (__hasOwnProp(props, key) && key !== 'app') return props[key];
      if (props.app == null) return undefined;
      const value = Reflect.get(props.app, key);
      if (typeof value === 'function') return value.bind(props.app);
      return value;
    },
    set(_target, key, value) {
      if (__hasOwnProp(props, key) && key !== 'app') return false;
      if (props.app == null) return false;
      Reflect.set(props.app, key, value);
      return true;
    },
    has(_target, key) {
      if (__hasOwnProp(props, 'app') && key === 'app') return true;
      return (__hasOwnProp(props, key) && key !== 'app') || (props.app != null && Reflect.has(props.app, key));
    },
    getOwnPropertyDescriptor(_target, key) {
      if (__hasOwnProp(props, 'app') && key === 'app') {
        return { configurable: true, enumerable: true, value: props.app, writable: false };
      }
      if (__hasOwnProp(props, key) && key !== 'app') {
        return { configurable: true, enumerable: true, value: props[key], writable: false };
      }
      if (props.app == null) return undefined;
      return {
        configurable: true,
        enumerable: true,
        value: Reflect.get(props.app, key),
        writable: true,
      };
    },
  });
}

`
  : '';
const stubBlock = componentStubs.length
  ? `${proxyStubBlock}${componentStubs.join('\n')}\n\n`
  : '';

script = script.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*/gm, '').trim();
const exportDefaultIndex = script.indexOf('export default');
if (exportDefaultIndex < 0) {
  console.error('Could not locate export default in App.vue script');
  process.exit(1);
}
const preamble = script.slice(0, exportDefaultIndex).trim();
const componentObject = script.slice(exportDefaultIndex).replace(/export\s+default\s+/, '').trim();
const inner = componentObject.startsWith('{') && componentObject.endsWith('}')
  ? componentObject.slice(1, -1).trim()
  : componentObject;
const preambleBlock = preamble ? `${preamble}\n\n` : '';

const header = `// Auto-generated from App.vue — run: npm run sync-app-definition (audit A-01)\n\n`;
const body = `${header}${inlinedUtils}${stubBlock}${preambleBlock}module.exports = {
  template: ${JSON.stringify(template)},
  ${inner}
};
`;
writeFileSync(outPath, body);
console.log('Wrote', outPath);
