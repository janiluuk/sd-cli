#!/usr/bin/env node
const express = require("express");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const WebSocket = require("ws");
const amqp = require("amqplib");
const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const { Readable } = require("stream");
const { createGpuPool } = require("./modules/gpu-pool");
const { createInfrastructureStatus } = require("./modules/infrastructure-status");
const {
  isCiOffline,
  skipBackgroundProbes,
  isQuietMode,
  blockExternalFetches,
  installCiFetchGuard,
} = require("./modules/ci-offline");
const { resolveStoragePaths } = require("./modules/storage-paths");
const promptStylesStore = require("./modules/prompt-styles-store");
const { createRunsJobLog } = require("./modules/runs-job-log");
const { pathToFileURL } = require("url");

async function start(opts = {}) {
  const runtimeEnv = opts.env || process.env;
  const externalBlocked = () => blockExternalFetches(runtimeEnv);
  const quietMode = () => isQuietMode(runtimeEnv);
  installCiFetchGuard(runtimeEnv);
  if (externalBlocked()) {
    console.log("[web] CI quiet mode — external Forge/LLM connections disabled");
  }
  const port = opts.port ?? process.env.PORT ?? 3000;
  const rabbitUrl = opts.rabbitUrl || process.env.RABBIT_URL || "amqp://localhost";
  const controlToken = opts.controlToken ?? process.env.CONTROL_TOKEN ?? "";
  const queue = opts.queue || process.env.CONTROL_QUEUE || "controls";
  const storage = resolveStoragePaths(opts);
  const webRoot = storage.webRoot;
  const framesDir = storage.framesDir;
  const runsDir = storage.runsDir;
  const uploadsDir = storage.uploadsDir;
  const videoswarmDir = storage.videoswarmDir;
  const hlsStream = opts.hlsStream || process.env.HLS_STREAM || "/hls/live/deforum.m3u8";
  const hlsDir = storage.hlsDir;
  const enableMq = opts.enableMq ?? (process.env.DISABLE_MQ ? false : true);
   const spawner = opts.spawner || spawn;

  const playlistPath = path.join(hlsDir, hlsStream.replace(/^\/hls\//, ""));
  const hlsUpstream = String(opts.hlsUpstream || process.env.HLS_UPSTREAM || "")
    .trim()
    .replace(/\/$/, "");
  const hlsPlaylistUrl = hlsUpstream
    ? `${hlsUpstream}${hlsStream.startsWith("/") ? hlsStream : `/${hlsStream}`}`
    : "";

  async function readPlaylistUpdatedMs() {
    if (hlsPlaylistUrl) {
      try {
        const res = await fetch(hlsPlaylistUrl, { method: "HEAD" });
        if (!res.ok) return null;
        const lm = res.headers.get("last-modified");
        if (lm) {
          const parsed = Date.parse(lm);
          if (Number.isFinite(parsed)) return parsed;
        }
        return Date.now();
      } catch (_e) {
        return null;
      }
    }
    try {
      const stat = await fsp.stat(playlistPath);
      return stat.mtimeMs;
    } catch (_e) {
      return null;
    }
  }

  // Track API availability status
  const apiStatus = {
    sdForgeAvailable: false,
    lastChecked: null,
    forgeCacheValidUntil: 0,
    loraCacheValidUntil: 0,
    controlNetModels: null,
    controlNetModelsFetchedAt: 0,
    loraModels: null,
    sdModels: null,
    currentModel: null,
  };
  const txt2imgBypassUntil = new Map();
  const TXT2IMG_BYPASS_MS = 2 * 60 * 1000;

  const repoRoot = path.resolve(__dirname, "..", "..");
  const aiInvokeScript = path.join(__dirname, "scripts", "ai_invoke.py");
  const { execFile, execSync } = require("child_process");

  function resolvePythonBin() {
    const fromEnv = process.env.PYTHON || process.env.PYTHON3;
    if (fromEnv) return fromEnv;
    for (const bin of ["python3", "python", "/usr/bin/python3", "/usr/local/bin/python3"]) {
      try {
        execSync(`"${bin}" -c "import sys"`, { stdio: "ignore", timeout: 5000 });
        return bin;
      } catch (_e) {
        /* try next */
      }
    }
    return "python3";
  }

  const PYTHON_BIN = resolvePythonBin();

  function spawnPython(args, opts = {}) {
    return spawner(PYTHON_BIN, args, {
      cwd: repoRoot,
      env: { ...process.env, PYTHONPATH: repoRoot },
      ...opts,
    });
  }

  function execPythonModule(moduleArgs, callback) {
    execFile(
      PYTHON_BIN,
      moduleArgs,
      { cwd: repoRoot, env: { ...process.env, PYTHONPATH: repoRoot }, maxBuffer: 10 * 1024 * 1024 },
      callback
    );
  }

  function invokeAi(op, payload) {
    return new Promise((resolve, reject) => {
      const req = JSON.stringify({ op, ...payload });
      const child = spawnPython([aiInvokeScript], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => { stdout += d; });
      child.stderr.on("data", (d) => { stderr += d; });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          return reject(new Error(stderr || stdout || `ai_invoke exit ${code}`));
        }
        try {
          resolve(stdout.trim() ? JSON.parse(stdout) : null);
        } catch (e) {
          reject(new Error(`ai_invoke invalid JSON: ${stdout.slice(0, 200)}`));
        }
      });
      child.stdin.write(req);
      child.stdin.end();
    });
  }

  function stripCodeFence(text) {
    const raw = String(text || "").trim();
    if (!raw.startsWith("```")) return raw;
    return raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }

  function parseLooseJson(text) {
    const raw = stripCodeFence(text);
    if (!raw) throw new Error("empty JSON response");
    try {
      return JSON.parse(raw);
    } catch (_err) {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start >= 0 && end > start) {
        return JSON.parse(raw.slice(start, end + 1));
      }
      throw new Error(`invalid JSON payload: ${raw.slice(0, 240)}`);
    }
  }

  function fallbackStoryScene(theme, style, idx, total) {
    const phase =
      idx === 0
        ? "opening"
        : idx >= total - 1
          ? "closing"
          : idx < Math.ceil(total / 2)
            ? "buildup"
            : "climax";
    return `${style}, ${phase} scene from ${theme}, cinematic composition, detailed atmosphere, coherent character continuity`;
  }

  function normalizeStoryScenes(sceneMap, { theme, style, numScenes, frameStarts }) {
    const input = sceneMap && typeof sceneMap === "object" ? sceneMap : {};
    const scenes = {};
    frameStarts.forEach((frame, idx) => {
      const prompt =
        input[String(frame)] ||
        input[frame] ||
        input[String(idx)] ||
        input[idx] ||
        fallbackStoryScene(theme, style, idx, numScenes);
      scenes[String(frame)] = String(prompt || fallbackStoryScene(theme, style, idx, numScenes)).trim();
    });
    return scenes;
  }

  function normalizeStoryMotion(motion, totalFrames) {
    const cleaned = {};
    if (motion && typeof motion === "object" && !Array.isArray(motion)) {
      Object.entries(motion).forEach(([key, value]) => {
        if (!key || value == null) return;
        const normalized = String(value).trim();
        if (normalized) cleaned[String(key)] = normalized;
      });
    }
    if (!Object.keys(cleaned).length) {
      cleaned.Zoom = `0:(1.0025), ${Math.max(totalFrames - 1, 1)}:(1.0)`;
    }
    return cleaned;
  }

  function formatStoryResult(result) {
    const lines = [
      `Theme: ${result.theme}`,
      `Style: ${result.style}`,
      `Resolution: ${result.width}x${result.height}`,
      `FPS: ${result.fps}`,
      `Total frames: ${result.totalFrames}`,
      "",
      JSON.stringify(result.scenes, null, 2),
      "",
      "Motion Settings:",
    ];
    Object.entries(result.motion || {}).forEach(([key, value]) => lines.push(`${key}: ${value}`));
    return lines.join("\n");
  }

  const storyLlm = await import(pathToFileURL(path.join(webRoot, "src/shared/story-llm-request.mjs")).href);
  const runsJobLogStore = createRunsJobLog(runsDir);

  async function persistStoryLlmRequestLog(body = {}, modelName = "") {
    const clientRequest = storyLlm.normalizeStoryClientRequest(body);
    const ollamaRequest = storyLlm.buildStoryOllamaApiBody(clientRequest, { model: modelName });
    const entry = storyLlm.storyLlmRequestLogEntry(clientRequest, ollamaRequest);
    const saved = await runsJobLogStore.append(entry);
    if (saved) broadcast({ type: "runs_job_log", entry: saved });
    return { clientRequest, ollamaRequest, logId: saved?.id || entry.id };
  }

  async function generateStoryWithOllama(body = {}) {
    const clientRequest = storyLlm.normalizeStoryClientRequest(body);
    const {
      theme,
      style,
      width,
      height,
      fps,
      totalFrames,
      numScenes,
    } = clientRequest;
    const frameStarts = storyLlm.storyFrameStarts(totalFrames, numScenes);
    const target = gpuPool.resolveOllamaTarget({ body });
    try {
      let model = body.model || target.node?.model || target.model || process.env.OLLAMA_MODEL || "";
      if (!model) {
        const models = await gpuPool.listOllamaModels(target.url);
        model = models[0]?.name || "";
        if (target.node && model) target.node.model = model;
      }
      if (!model) {
        throw new Error("No Ollama model configured. Add an Ollama node and choose a model in the GPU pool.");
      }
      if (target.node) {
        target.node.model = model;
        target.node.currentModel = model;
      }
      const llmLog = await persistStoryLlmRequestLog(body, model);
      const ollamaBody = storyLlm.buildStoryOllamaApiBody(clientRequest, { model });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60000);
      let response;
      try {
        response = await fetch(`${target.url}/api/generate`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(ollamaBody),
        });
      } finally {
        clearTimeout(timer);
      }
      const rawText = await response.text();
      let payload = {};
      try {
        payload = rawText ? JSON.parse(rawText) : {};
      } catch (_err) {
        payload = { response: rawText };
      }
      if (!response.ok) {
        throw new Error(payload?.error || `Ollama generate failed (${response.status})`);
      }
      const parsed = parseLooseJson(payload?.response || payload?.message?.content || "");
      const result = {
        theme: String(parsed.theme || theme),
        style: String(parsed.style || style),
        width,
        height,
        fps,
        totalFrames,
        numScenes,
        summary: String(parsed.summary || ""),
        scenes: normalizeStoryScenes(parsed.scenes, { theme, style, numScenes, frameStarts }),
        motion: normalizeStoryMotion(parsed.motion, totalFrames),
        source: {
          backend: "ollama",
          url: target.url,
          model,
          node: target.node ? { id: target.node.id, name: target.node.name, url: target.node.url } : null,
        },
      };
      result.formatted = formatStoryResult(result);
      result.llmLog = llmLog;
      return result;
    } finally {
      target.release();
    }
  }

  let framesIndexCache = { items: [], builtAt: 0, dirMtime: 0 };
  const FRAMES_INDEX_MIN_ITEMS = 50;
  const FRAME_FILE_RE = /^frame_(\d+)\.(png|jpg|jpeg|webp)$/i;

  function updateFramesIndexCache(item, maxItems = FRAMES_INDEX_MIN_ITEMS) {
    if (!item || !item.name) return;
    const current = Array.isArray(framesIndexCache.items) ? framesIndexCache.items : [];
    const filtered = current.filter((entry) => entry.name !== item.name);
    filtered.unshift(item);
    filtered.sort((a, b) => {
      if (Number.isFinite(a.frame) && Number.isFinite(b.frame) && a.frame !== b.frame) {
        return b.frame - a.frame;
      }
      return (b.mtime || 0) - (a.mtime || 0);
    });
    framesIndexCache.items = filtered.slice(0, Math.max(maxItems, FRAMES_INDEX_MIN_ITEMS));
    framesIndexCache.builtAt = Date.now();
  }

  async function buildFramesIndex(limit = 50) {
    let dirMtime = 0;
    try {
      const st = await fsp.stat(framesDir);
      dirMtime = st.mtimeMs;
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
    if (framesIndexCache.builtAt && framesIndexCache.dirMtime === dirMtime) {
      return framesIndexCache.items.slice(0, limit);
    }
    const maxItems = Math.max(limit, FRAMES_INDEX_MIN_ITEMS);
    const topFrames = [];
    const pushCandidate = (candidate) => {
      if (!candidate) return;
      const minFrame = topFrames.length ? topFrames[topFrames.length - 1].frame : -1;
      if (topFrames.length >= maxItems && candidate.frame <= minFrame) return;
      topFrames.push(candidate);
      topFrames.sort((a, b) => b.frame - a.frame);
      if (topFrames.length > maxItems) topFrames.length = maxItems;
    };

    const dir = await fsp.opendir(framesDir);
    try {
      for await (const entry of dir) {
        if (!entry.isFile()) continue;
        const match = FRAME_FILE_RE.exec(entry.name);
        if (!match) continue;
        pushCandidate({ name: entry.name, frame: parseInt(match[1], 10) });
      }
    } finally {
      await dir.close().catch(() => {});
    }

    const items = await Promise.all(
      topFrames.map(async (candidate) => {
        const filePath = path.join(framesDir, candidate.name);
        let mtime = 0;
        try {
          const stat = await fsp.stat(filePath);
          mtime = stat.mtimeMs;
        } catch (_e) {
          /* ignore files that vanished between directory scan and stat */
        }
        return {
          src: `/frames/${candidate.name}?v=${mtime || Date.now()}`,
          name: candidate.name,
          frame: candidate.frame,
          mtime,
        };
      })
    );

    items.sort((a, b) => {
      if ((b.mtime || 0) !== (a.mtime || 0)) return (b.mtime || 0) - (a.mtime || 0);
      return (b.frame || 0) - (a.frame || 0);
    });
    framesIndexCache = { items, builtAt: Date.now(), dirMtime };
    return items.slice(0, limit);
  }

  const gpuPool = createGpuPool({
    configPath: opts.gpuPoolPath || path.join(__dirname, "gpu-pool.json"),
    env: runtimeEnv,
  });
  await gpuPool.init();

  const infrastructure = createInfrastructureStatus({
    env: runtimeEnv,
    framesDir,
    fsp,
  });

  function forgeTarget(req, options = {}) {
    return gpuPool.resolveForgeTarget(req, options);
  }

  function resolveMediatorConnection(req, body = {}) {
    const fromPool = gpuPool.resolveMediatorTarget(req);
    const host =
      body.mediator_host ||
      body.mediatorHost ||
      (fromPool && fromPool.host) ||
      process.env.DEF_MEDIATOR_HOST ||
      process.env.MEDIATOR_HOST ||
      "localhost";
    const port =
      body.mediator_port ||
      body.mediatorPort ||
      (fromPool && fromPool.deforumationPort) ||
      process.env.DEF_MEDIATOR_PORT ||
      process.env.MEDIATOR_PORT ||
      "8766";
    return { host, port: String(port) };
  }

  function forgeBaseUrl(req) {
    return forgeTarget(req).url;
  }

  /** Forge node that writes into FRAMES_DIR — required when GPUs are remote but frames are on a shared mount. */
  function previewForgeTarget(req) {
    const pinnedUrl = String(process.env.FRAMES_FORGE_URL || process.env.PREVIEW_FORGE_URL || "").trim();
    if (pinnedUrl) {
      const url = pinnedUrl.replace(/\/$/, "");
      return { url, node: null, backend: "sd-forge", release: () => {} };
    }
    return forgeTarget(req);
  }

  function writableForgeTargets() {
    const nodes = Array.isArray(gpuPool.state?.nodes)
      ? gpuPool.state.nodes.filter((node) => node.enabled && node.backend === "sd-forge")
      : [];
    if (gpuPool.state?.enabled && nodes.length) {
      return nodes.map((node) => ({ url: node.url, node }));
    }
    const host = process.env.SD_FORGE_HOST || "192.168.2.101";
    const port = process.env.SD_FORGE_PORT || "7860";
    return [{ url: `http://${host}:${port}`, node: null }];
  }

  async function postForgeOptionsToTarget(target, updates, timeoutMs) {
    if (typeof fetch === "undefined") {
      throw new Error("fetch not available");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${target.url}/sdapi/v1/options`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
      }
      return {
        ok: true,
        url: target.url,
        node: target.node ? { name: target.node.name, id: target.node.id } : null,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function applyForgeOptionsAcrossTargets(updates, timeoutMs = 10000) {
    const targets = writableForgeTargets();
    const results = await Promise.all(
      targets.map(async (target) => {
        const t0 = Date.now();
        const paths = Object.keys(updates).slice(0, 3).join(",");
        try {
          const result = await postForgeOptionsToTarget(target, updates, timeoutMs);
          if (target.node) {
            gpuPool.logNodeRequest(target.node.id, { type: "options", path: `/sdapi/v1/options [${paths}]`, statusCode: 200, durationMs: Date.now() - t0, ok: true });
          }
          return result;
        } catch (err) {
          if (target.node) {
            gpuPool.logNodeRequest(target.node.id, { type: "options", path: `/sdapi/v1/options [${paths}]`, durationMs: Date.now() - t0, ok: false, error: err.message });
          }
          return {
            ok: false,
            url: target.url,
            node: target.node ? { name: target.node.name, id: target.node.id } : null,
            error: err.message,
          };
        }
      })
    );
    const successes = results.filter((result) => result.ok);
    const failures = results.filter((result) => !result.ok);
    if (!successes.length) {
      throw new Error(failures[0]?.error || "No Forge nodes accepted the update");
    }
    return {
      success: true,
      partial: failures.length > 0,
      results,
      successes: successes.length,
      failures: failures.length,
    };
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function latestFrameInfo() {
    const cached = Array.isArray(framesIndexCache.items) ? framesIndexCache.items[0] : null;
    if (cached && framesIndexCache.builtAt && Date.now() - framesIndexCache.builtAt < 2000) {
      return cached;
    }
    const items = await buildFramesIndex(1);
    return items[0] || null;
  }

  async function latestFramePath() {
    const top = await latestFrameInfo();
    if (!top) return null;
    return top.src || `/frames/${top.name}`;
  }

  function txt2imgBypassKey(target) {
    return target?.node?.id || target?.url || "";
  }

  function shouldBypassTxt2img(target) {
    const key = txt2imgBypassKey(target);
    if (!key) return false;
    const until = txt2imgBypassUntil.get(key) || 0;
    if (until <= Date.now()) {
      txt2imgBypassUntil.delete(key);
      return false;
    }
    return true;
  }

  function recordTxt2imgFailure(target) {
    const key = txt2imgBypassKey(target);
    if (!key) return;
    txt2imgBypassUntil.set(key, Date.now() + TXT2IMG_BYPASS_MS);
  }

  function clearTxt2imgFailure(target) {
    const key = txt2imgBypassKey(target);
    if (!key) return;
    txt2imgBypassUntil.delete(key);
  }

  function buildTxt2imgFallbackSettings(body, payload) {
    const base = body && typeof body.settings === "object"
      ? JSON.parse(JSON.stringify(body.settings))
      : null;
    if (!base) return null;

    const prompts = Array.isArray(base.prompts) ? [...base.prompts] : [];
    prompts[0] = payload.prompt || prompts[0] || "Preview frame";
    base.prompts = prompts;
    base.negative_prompts = payload.negative_prompt || base.negative_prompts || "";
    base.W = payload.width;
    base.H = payload.height;
    base.steps = payload.steps;
    base.seed = payload.seed;
    base.sampler = payload.sampler_name;
    return base;
  }

  async function fetchForgeProgressFromTarget(target, { includeImage = true, timeoutMs = 8000 } = {}) {
    if (typeof fetch === "undefined") {
      throw new Error("fetch not available");
    }
    const skipImage = includeImage ? "false" : "true";
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const response = await fetch(`${target.url}/sdapi/v1/progress?skip_current_image=${skipImage}`, {
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err = new Error("Forge progress request failed");
        err.status = response.status;
        err.detail = data;
        throw err;
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchDeforumBatchStatusFromTarget(target, batchId, timeoutMs = 8000) {
    if (!batchId || typeof fetch === "undefined") return null;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const response = await fetch(`${target.url}/deforum_api/batches/${encodeURIComponent(batchId)}`, {
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
      });
      if (!response.ok) return null;
      return await response.json().catch(() => null);
    } catch (_err) {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function renderDeforumPreview(settings, target, optionsOverrides = {}) {
    if (externalBlocked()) {
      return { ok: false, skipped: true, reason: "ci_offline" };
    }
    const forgeUrl = target.url;
    const baselineFrame = await latestFrameInfo();
    const previewSettings = {
      ...settings,
      max_frames: 1,
      motion_preview_mode: true,
      skip_video_creation: true,
    };
    const payload = { deforum_settings: previewSettings, options_overrides: optionsOverrides || {} };

    if (typeof fetch === "undefined") {
      const err = new Error("fetch not available in this Node build");
      err.status = 500;
      throw err;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    const t0 = Date.now();
    let response;
    try {
      response = await fetch(`${forgeUrl}/deforum_api/batches`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    const genDuration = Date.now() - t0;
    if (target.node) {
      gpuPool.logNodeRequest(target.node.id, { type: "generate", path: "/deforum_api/batches", statusCode: response.status, durationMs: genDuration, ok: response.ok || response.status === 202 });
    }
    if (response.status !== 202 && !response.ok) {
      const text = await response.text();
      const err = new Error("Deforum batch submit failed");
      err.status = response.status;
      err.detail = text.slice(0, 500);
      throw err;
    }
    const data = await response.json();
    const batchId = data.batch_id;
    if (!batchId) {
      const framePath = await latestFramePath();
      if (framePath) {
        return { ok: true, path: framePath, batch: data, node: target.node ? { name: target.node.name, url: target.node.url } : null };
      }
      const err = new Error("Deforum returned no batch_id");
      err.raw = data;
      throw err;
    }

    let status = "pending";
    for (let i = 0; i < 120; i++) {
      const framePollMs = i < 30 ? 75 : (i < 60 ? 150 : 300);
      await sleep(framePollMs);
      const frame = await latestFrameInfo();
      if (frame && (!baselineFrame || frame.mtime > baselineFrame.mtime || frame.name !== baselineFrame.name)) {
        return {
          ok: true,
          path: frame.src || `/frames/${frame.name}`,
          batchId,
          status: "frame_ready",
          node: target.node ? { name: target.node.name, url: target.node.url } : null,
        };
      }

      if ((i < 20 && i % 2 === 0) || (i >= 20 && i % 4 === 0)) {
        const pollCtrl = new AbortController();
        const pollTimeout = setTimeout(() => pollCtrl.abort(), 15000);
        let sresp;
        try {
          sresp = await fetch(`${forgeUrl}/deforum_api/batches/${batchId}`, {
            signal: pollCtrl.signal,
          });
        } finally {
          clearTimeout(pollTimeout);
        }
        if (!sresp.ok) continue;
        const sdata = await sresp.json();
        status = sdata.status || sdata.state || status;
        if (["completed", "failed", "cancelled", "canceled", "done"].includes(String(status).toLowerCase())) {
          if (String(status).toLowerCase() === "failed") {
            const err = new Error("Deforum preview failed");
            err.batch = sdata;
            throw err;
          }
          break;
        }
      }
    }

    const framePath = await latestFramePath();
    if (!framePath) {
      const err = new Error("Deforum finished but no frame found in frames dir");
      err.batchId = batchId;
      err.previewStatus = status;
      throw err;
    }
    return {
      ok: true,
      path: framePath,
      batchId,
      status,
      node: target.node ? { name: target.node.name, url: target.node.url } : null,
    };
  }

  function extractRunMetaFromSnapshot(snapshot) {
    const snap = snapshot && typeof snapshot === "object" ? snapshot : {};
    const settings = snap.settings && typeof snap.settings === "object" ? snap.settings : {};
    const kind = String(snap.kind || "deforum");
    const tag = kind === "deforum_warmup" ? "warmup" : kind === "deforum_preview" ? "preview" : "defora";
    const prompts = settings.prompts && typeof settings.prompts === "object" ? settings.prompts : {};
    const firstPromptKey = Object.keys(prompts).sort((a, b) => Number(a) - Number(b))[0];
    const promptPositive =
      (firstPromptKey != null ? prompts[firstPromptKey] : null) ||
      settings.animation_prompts_positive ||
      settings.prompt ||
      "";
    const promptNegative =
      settings.negative_prompts ||
      settings.negative_prompt ||
      settings.neg ||
      "";
    const maxFrames = settings.max_frames != null ? parseInt(settings.max_frames, 10) : null;
    const steps = settings.steps != null ? parseInt(settings.steps, 10) : null;
    const cfg = settings.cfg_scale != null ? parseFloat(settings.cfg_scale) : null;
    const strength =
      settings.strength != null
        ? settings.strength
        : settings.strength_schedule != null
          ? settings.strength_schedule
          : null;
    return {
      tag,
      kind,
      model: settings.sd_model_checkpoint || settings.sd_model_name || settings.model || "",
      seed: settings.seed != null ? settings.seed : null,
      steps: Number.isFinite(steps) ? steps : null,
      cfg: Number.isFinite(cfg) ? cfg : null,
      strength,
      frame_count: Number.isFinite(maxFrames) ? maxFrames : snap.maxFrames || null,
      length_frames: Number.isFinite(maxFrames) ? maxFrames : snap.maxFrames || null,
      prompt_positive: String(promptPositive || ""),
      prompt_negative: String(promptNegative || ""),
      fps: snap.fps != null ? snap.fps : settings.fps != null ? settings.fps : null,
      ...extractStyleMetaFromSnapshot(snap),
    };
  }

  async function updateRunManifest(runId, patch = {}) {
    if (!runId) return;
    const safeId = String(runId).replace(/[^a-zA-Z0-9._:-]/g, "_");
    const dir = path.join(runsDir, safeId);
    const manifestPath = path.join(dir, "run.json");
    try {
      await fsp.mkdir(dir, { recursive: true });
      let prev = {};
      if (fs.existsSync(manifestPath)) {
        try {
          prev = JSON.parse(await fsp.readFile(manifestPath, "utf-8"));
        } catch (_e) {
          prev = {};
        }
      }
      const next = { ...prev, run_id: safeId, ...patch };
      if (!next.started_at) next.started_at = new Date().toISOString();
      await fsp.writeFile(manifestPath, JSON.stringify(next, null, 2), "utf-8");
      console.log(`[runs] updated manifest ${safeId} status=${next.status || "?"}`);
    } catch (e) {
      console.warn("[runs] update manifest failed", e.message);
    }
  }

  async function persistRunJobSnapshot(runId, snapshot) {
    if (!runId) return;
    try {
      const safeId = String(runId).replace(/[^a-zA-Z0-9._:-]/g, "_");
      const dir = path.join(runsDir, safeId);
      await fsp.mkdir(dir, { recursive: true });
      const out = {
        run_id: safeId,
        captured_at: new Date().toISOString(),
        snapshot,
      };
      await fsp.writeFile(path.join(dir, "defora-job.json"), JSON.stringify(out, null, 2), "utf-8");
      const meta = extractRunMetaFromSnapshot(snapshot);
      const manifestPath = path.join(dir, "run.json");
      if (!fs.existsSync(manifestPath)) {
        await fsp.writeFile(
          manifestPath,
          JSON.stringify(
            {
              run_id: safeId,
              status: "queued",
              started_at: new Date().toISOString(),
              ...meta,
              job: out,
            },
            null,
            2
          ),
          "utf-8"
        );
        console.log(`[runs] logged run ${safeId} (${meta.kind || meta.tag})`);
      } else {
        try {
          const prev = JSON.parse(await fsp.readFile(manifestPath, "utf-8"));
          await fsp.writeFile(
            manifestPath,
            JSON.stringify({ ...prev, ...meta, job: out, updated_at: new Date().toISOString() }, null, 2),
            "utf-8"
          );
        } catch (_e) {
          /* ignore */
        }
      }
    } catch (e) {
      console.warn("[runs] persist job snapshot failed", e.message);
    }
  }

  function normalizeForgeRunStatus(status) {
    const s = String(status || "queued").toLowerCase();
    if (s.includes("fail") || s.includes("cancel") || s.includes("error")) return "failed";
    if (s.includes("complete") || s === "done" || s === "success") return "completed";
    if (s.includes("run") || s === "processing" || s === "active") return "running";
    return "queued";
  }

  /** Lightweight SD-Forge reachability check (updates apiStatus). */
  async function probeSdForge() {
    if (skipBackgroundProbes(runtimeEnv)) return;
    if (typeof fetch === "undefined") return;
    const target = forgeTarget({});
    const forgeUrl = target.url;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(`${forgeUrl}/sdapi/v1/options`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeout);
      apiStatus.sdForgeAvailable = response.ok;
      apiStatus.lastChecked = new Date().toISOString();
    } catch (_e) {
      apiStatus.sdForgeAvailable = false;
      apiStatus.lastChecked = new Date().toISOString();
    } finally {
      target.release();
    }
  }

  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use("/frames", express.static(framesDir, {
    maxAge: "1h",
    immutable: true,
    etag: true,
    lastModified: true,
  }));
  
  // Serve static files from public directory
  const publicDir = opts.publicDir || process.env.PUBLIC_DIR || path.join(__dirname, "public");
  const quietBoot = quietMode();
  const indexHtmlPath = path.join(publicDir, "index.html");
  if (quietBoot && fs.existsSync(indexHtmlPath)) {
    app.get(["/", "/index.html"], (_req, res) => {
      try {
        const html = fs.readFileSync(indexHtmlPath, "utf8");
        const injected = html.includes("__DEFORA_QUIET__")
          ? html
          : html.replace("<head>", '<head>\n  <script>window.__DEFORA_QUIET__=1</script>');
        res.type("html").send(injected);
      } catch (err) {
        res.sendFile(indexHtmlPath);
      }
    });
  }
  app.use(express.static(publicDir));

  const freecutDir =
    opts.freecutDir ||
    process.env.FREECUT_DIR ||
    path.join(publicDir, "freecut");
  if (fs.existsSync(freecutDir)) {
    const freecutIndexPath = path.join(freecutDir, "index.html");
    let freecutIndexTemplate = null;
    function freecutInnerRouteFromRequest(req) {
      const raw = String(req.originalUrl || req.url || "").split("?")[0].split("#")[0];
      let sub = raw.replace(/^\/freecut\/?/i, "/");
      if (!sub || sub === "/" || sub === "/index.html") return "/projects";
      return sub.startsWith("/") ? sub : `/${sub}`;
    }
    function sendFreecutSpa(req, res) {
      try {
        if (!freecutIndexTemplate) {
          freecutIndexTemplate = fs.readFileSync(freecutIndexPath, "utf8");
        }
        const innerRoute = freecutInnerRouteFromRequest(req);
        const inject = `<script>(function(){try{var r=${JSON.stringify(innerRoute)};if(window.location.pathname!==r){history.replaceState(null,"",r+window.location.search+window.location.hash);}}catch(_e){}})();</script>`;
        const bridge = `<script src="/freecut/defora-bridge.js"></script>`;
        let html = freecutIndexTemplate.replace("<head>", `<head>\n<!-- defora-freecut-path-fix -->\n${inject}\n`);
        html = html.includes("defora-bridge.js")
          ? html
          : html.replace("</body>", `${bridge}\n</body>`);
        res.type("html").send(html);
      } catch (err) {
        console.error("[web] freecut SPA error", err);
        res.status(500).send("FreeCut unavailable");
      }
    }
    app.use("/freecut", express.static(freecutDir, { maxAge: "300s", fallthrough: true, index: false }));
    app.use("/freecut", (req, res) => {
      sendFreecutSpa(req, res);
    });
    const landingDir = path.join(freecutDir, "assets", "landing");
    if (fs.existsSync(landingDir)) {
      app.use("/assets/landing", express.static(landingDir, { maxAge: "3600s" }));
    }
  } else {
    console.warn("[web] freecut dir missing — video editor static bundle unavailable:", freecutDir);
  }

  // Simple health check endpoint for Docker healthcheck
  app.get("/health", (_req, res) => {
    res.status(200).send("OK");
  });

  app.get("/api/health", async (_req, res) => {
    const updated = await readPlaylistUpdatedMs();
    res.json({
      ok: true,
      stream: hlsStream,
      updated,
      hlsUpstream: hlsUpstream || null,
      rtmpIngest:
        process.env.ENCODER_RTMP_TARGET ||
        process.env.RTMP_INGEST_TARGET ||
        process.env.RTMP_TARGET ||
        null,
    });
  });
  
  // Streaming API endpoints
  app.post("/api/stream/start", async (req, res) => {
    const { target, fps, resolution, protocol, overlay, transition } = req.body || {};
    if (!target) {
      return res.status(400).json({ error: "target URL required" });
    }
    try {
      const framesDir = process.env.FRAMES_DIR || path.join(__dirname, "frames");
      const args = [
        "-m", "defora_cli.stream_helper", "start",
        "--source", framesDir, "--target", target,
        "--fps", String(fps || 24),
      ];
      if (resolution) args.push("--resolution", resolution);
      if (protocol) args.push("--protocol", protocol);
      if (overlay) args.push("--overlay", String(overlay).trim());
      if (transition) args.push("--transition", String(transition).trim());
      execPythonModule(args, (error, stdout, stderr) => {
        if (error) {
          return res.status(500).json({ error: stderr || stdout || error.message });
        }
        res.json({ success: true, message: stdout });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/stream/stop", async (_req, res) => {
    try {
      execPythonModule(["-m", "defora_cli.stream_helper", "stop"], (error, stdout, stderr) => {
        if (error) {
          return res.status(500).json({ error: stderr || stdout || error.message });
        }
        res.json({ success: true, message: stdout });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/stream/status", async (_req, res) => {
    try {
      execPythonModule(["-m", "defora_cli.stream_helper", "status", "--json"], (error, stdout, stderr) => {
        let metrics = null;
        const raw = String(stdout || "").trim();
        if (raw) {
          try {
            metrics = JSON.parse(raw.split("\n").filter(Boolean).pop());
          } catch (_e) {
            metrics = null;
          }
        }
        const running = !!(metrics && metrics.running);
        res.json({
          status: running ? "running" : "stopped",
          output: raw || String(stderr || "").trim(),
          python: PYTHON_BIN,
          metrics: metrics || {
            running: false,
            status: "stopped",
            health: error ? "offline" : "offline",
            kbps: null,
            fps: null,
            target: null,
          },
        });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/stream/record", async (req, res) => {
    const { output, fps, resolution, codec, quality } = req.body || {};
    if (!output) {
      return res.status(400).json({ error: "output path required" });
    }
    try {
      const framesDir = process.env.FRAMES_DIR || path.join(__dirname, "frames");
      const args = [
        "-m", "defora_cli.stream_helper", "record",
        "--source", framesDir, "--output", output,
        "--fps", String(fps || 24),
      ];
      if (resolution) args.push("--resolution", resolution);
      if (codec) args.push("--codec", codec);
      if (quality) args.push("--quality", quality);
      execPythonModule(args, (error, stdout, stderr) => {
        if (error) {
          return res.status(500).json({ error: stderr || stdout || error.message });
        }
        res.json({ success: true, message: stdout });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/stream/stop-record", async (_req, res) => {
    try {
      execPythonModule(["-m", "defora_cli.stream_helper", "stop-record"], (error, stdout, stderr) => {
        if (error) {
          return res.status(500).json({ error: stderr || stdout || error.message });
        }
        res.json({ success: true, message: stdout });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/stream/record-status", async (_req, res) => {
    try {
      execPythonModule(["-m", "defora_cli.stream_helper", "record-status"], (error, stdout) => {
        res.json({
          status: error ? "stopped" : "recording",
          output: stdout,
        });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // API status endpoint for model availability
  app.get("/api/status", (_req, res) => {
    const sdForgePollMs = parseInt(process.env.SD_FORGE_POLL_MS || "0", 10);
    const quiet = quietMode();
    res.json({
      quiet,
      externalServicesDisabled: externalBlocked(),
      sdForge: {
        available: quiet ? false : apiStatus.sdForgeAvailable,
        lastChecked: apiStatus.lastChecked,
        pollIntervalMs: Number.isFinite(sdForgePollMs) && sdForgePollMs > 0 ? sdForgePollMs : 0,
      },
      models: {
        controlNet: apiStatus.controlNetModels !== null ? 'cached' : 'not-loaded',
        lora: apiStatus.loraModels !== null ? 'cached' : 'not-loaded',
      }
    });
  });

  app.get("/api/frames", async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 12));
      const items = await buildFramesIndex(limit);
      res.json({ items });
    } catch (err) {
      if (err.code === "ENOENT") {
        res.json({ items: [] });
      } else {
        console.error("[api] frames error", err);
        res.status(500).json({ error: "frames unavailable" });
      }
    }
  });

  app.post("/api/audio-map", async (req, res) => {
    const body = req.body || {};
    const audioPath = body.audioPath;
    if (!audioPath) {
      return res.status(400).json({ error: "audioPath required" });
    }
    const fps = parseInt(body.fps, 10) || 24;
    const live = !!body.live;
    const { host: mediatorHost, port: mediatorPort } = resolveMediatorConnection(req, body);
    const mappings = Array.isArray(body.mappings) ? body.mappings : [];
    let mappingArg;
    try {
      mappingArg = JSON.stringify(
        mappings.map((m) => ({
          param: m.param,
          freq_min: Number(m.freq_min),
          freq_max: Number(m.freq_max),
          out_min: Number(m.out_min ?? 0),
          out_max: Number(m.out_max ?? 1),
        }))
      );
    } catch (err) {
      return res.status(400).json({ error: "invalid mappings" });
    }
    const args = ["-m", "defora_cli.audio_reactive_modulator", "--audio", audioPath, "--fps", String(fps)];
    if (mappingArg) {
      args.push("--mapping", mappingArg);
    }
    if (body.output) {
      args.push("--output", body.output);
    }
    if (live) {
      args.push("--live", "--mediator-host", mediatorHost, "--mediator-port", String(mediatorPort));
    }
    const child = spawnPython(args, { stdio: ["ignore", "pipe", "pipe"] });
    if (!child || typeof child.on !== "function") {
      return res.status(500).json({ error: "could not start audio processor" });
    }
    let stdout = "";
    let stderr = "";
    if (child.stdout && child.stdout.on) {
      child.stdout.on("data", (d) => (stdout += d.toString()));
    }
    if (child.stderr && child.stderr.on) {
      child.stderr.on("data", (d) => (stderr += d.toString()));
    }
    child.on("error", (err) => {
      res.status(500).json({ error: String(err) });
    });
    child.on("close", (code) => {
      res.json({ ok: code === 0, code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });

  // Preset management API
  const presetsDir = opts.presetsDir || process.env.PRESETS_DIR || path.join(__dirname, "presets");
  const sequencersDir =
    opts.sequencersDir || process.env.SEQUENCER_DIR || path.join(__dirname, "sequencers");
  const pluginsDir = opts.pluginsDir || process.env.PLUGINS_DIR || path.join(__dirname, "plugins");
  const uploadRetentionHours = parseInt(process.env.UPLOAD_RETENTION_HOURS || "24", 10);
  
  try {
    await fsp.mkdir(presetsDir, { recursive: true });
  } catch (_e) {}
  try {
    await fsp.mkdir(sequencersDir, { recursive: true });
  } catch (_e) {}
  try {
    await fsp.mkdir(uploadsDir, { recursive: true });
  } catch (_e) {}
  try {
    await fsp.mkdir(videoswarmDir, { recursive: true });
  } catch (_e) {}
  try {
    await fsp.mkdir(pluginsDir, { recursive: true });
  } catch (_e) {}

  app.use("/uploads", express.static(uploadsDir, { maxAge: "60s" }));
  await promptStylesStore.ensurePromptStylesStore(webRoot);
  void (async () => {
    if (process.env.PROMPT_STYLES_AUTO_IMPORT === "0") return;
    const forgeUrl =
      String(process.env.FORGE_URL || process.env.SD_FORGE_URL || "").trim()
      || "http://127.0.0.1:7860";
    try {
      const result = await promptStylesStore.importFromForge(forgeUrl, webRoot, {
        merge: true,
        persistSeed: process.env.PROMPT_STYLES_PERSIST_SEED !== "0",
      });
      if (result.added || result.updated) {
        console.log(
          `[prompt-styles] Auto-imported from Forge: +${result.added} new, ~${result.updated} updated (${result.total} total)`,
        );
      }
    } catch (err) {
      console.log(`[prompt-styles] Auto-import skipped: ${err.message}`);
    }
  })();
  app.use(
    "/style-examples",
    express.static(promptStylesStore.examplesDir(webRoot), { maxAge: "3600s" }),
  );

  async function resolveStandbyPreviewPath() {
    const candidates = [
      process.env.STANDBY_PREVIEW_VIDEO,
      path.join(uploadsDir, "vid_preview.mp4"),
    ].filter(Boolean);
    for (const candidate of candidates) {
      try {
        const st = await fsp.stat(candidate);
        if (st.isFile()) return path.resolve(candidate);
      } catch (_e) {
        /* try next */
      }
    }
    return null;
  }

  app.head("/api/preview/standby-video", async (_req, res) => {
    try {
      const filePath = await resolveStandbyPreviewPath();
      if (!filePath) return res.status(404).end();
      res.set("Accept-Ranges", "bytes");
      res.set("Content-Type", "video/mp4");
      return res.status(200).end();
    } catch (err) {
      res.status(500).end();
    }
  });

  app.get("/api/preview/standby-video", async (_req, res) => {
    try {
      const filePath = await resolveStandbyPreviewPath();
      if (!filePath) return res.status(404).json({ error: "standby preview not configured" });
      res.type("video/mp4");
      return res.sendFile(filePath);
    } catch (err) {
      res.status(500).json({ error: err.message || "standby preview unavailable" });
    }
  });

  async function resolveStandbyPreviewPath() {
    const candidates = [
      process.env.STANDBY_PREVIEW_VIDEO,
      path.join(uploadsDir, "vid_preview.mp4"),
    ].filter(Boolean);
    for (const candidate of candidates) {
      try {
        const st = await fsp.stat(candidate);
        if (st.isFile()) return path.resolve(candidate);
      } catch (_e) {
        /* try next */
      }
    }
    return null;
  }

  app.head("/api/preview/standby-video", async (_req, res) => {
    try {
      const filePath = await resolveStandbyPreviewPath();
      if (!filePath) return res.status(404).end();
      res.set("Accept-Ranges", "bytes");
      res.set("Content-Type", "video/mp4");
      return res.status(200).end();
    } catch (err) {
      res.status(500).end();
    }
  });

  app.get("/api/preview/standby-video", async (_req, res) => {
    try {
      const filePath = await resolveStandbyPreviewPath();
      if (!filePath) return res.status(404).json({ error: "standby preview not configured" });
      res.type("video/mp4");
      return res.sendFile(filePath);
    } catch (err) {
      res.status(500).json({ error: err.message || "standby preview unavailable" });
    }
  });

  const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".mkv", ".m4v", ".avi"]);
  const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
  const AUDIO_EXT = new Set([".wav", ".mp3", ".ogg", ".flac", ".m4a"]);
  const projectsDir = path.join(uploadsDir, "projects");

  function videoSwarmRoots() {
    return [
      { id: "uploads", label: "Uploads", path: uploadsDir },
      { id: "videoswarm", label: "VideoSwarm", path: videoswarmDir },
      { id: "frames", label: "Frames", path: framesDir },
      { id: "hls", label: "HLS", path: hlsDir },
      { id: "runs", label: "Runs", path: runsDir },
    ];
  }

  function rootForResolvedPath(resolved, roots) {
    const target = path.resolve(resolved);
    let best = null;
    let bestLen = -1;
    for (const root of roots) {
      const rootResolved = path.resolve(root.path);
      if (target === rootResolved || target.startsWith(rootResolved + path.sep)) {
        if (rootResolved.length > bestLen) {
          best = root;
          bestLen = rootResolved.length;
        }
      }
    }
    return best;
  }

  function resolveVideoSwarmPath(inputPath, rootId) {
    const roots = videoSwarmRoots();
    const raw = String(inputPath || "").trim();
    if (!raw) {
      const root = rootId ? roots.find((r) => r.id === rootId) : roots[0];
      return root ? path.resolve(root.path) : null;
    }
    // IMPORTANT: the browser sends back absolute paths that we previously returned.
    // Preserve absolute paths; only join relative paths against the chosen root.
    let resolved;
    if (path.isAbsolute(raw)) {
      resolved = path.resolve(raw);
    } else {
      const root = rootId ? roots.find((r) => r.id === rootId) : roots[0];
      if (!root) return null;
      resolved = path.resolve(path.join(root.path, raw));
    }
    const allowed = rootForResolvedPath(resolved, roots);
    if (!allowed) return null;
    return resolved;
  }

  function parseVideoSwarmSortKey(sort) {
    const raw = String(sort || "name").trim().toLowerCase();
    if (raw === "date" || raw.startsWith("mtime")) return "date";
    if (raw === "size" || raw.startsWith("size")) return "size";
    return "name";
  }

  const cloudSourcesPath = path.join(videoswarmDir, "cloud-sources.json");

  function sanitizeFolderName(name) {
    const s = String(name || "").trim().replace(/[\\/]+/g, "");
    if (!s || s === "." || s === "..") return null;
    return s.slice(0, 120);
  }

  function cloudProviderLabel(provider) {
    const map = {
      google_drive: "Google Drive",
      dropbox: "Dropbox",
      onedrive: "OneDrive",
      other: "Cloud",
    };
    return map[String(provider || "").toLowerCase()] || "Cloud";
  }

  async function loadCloudSources() {
    try {
      const raw = await fsp.readFile(cloudSourcesPath, "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.sources) ? parsed.sources : [];
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
  }

  async function saveCloudSources(sources) {
    const list = Array.isArray(sources) ? sources : [];
    await fsp.mkdir(path.dirname(cloudSourcesPath), { recursive: true });
    await fsp.writeFile(cloudSourcesPath, JSON.stringify({ sources: list }, null, 2), "utf8");
    return list;
  }

  function cloudRootEntries(sources) {
    return sources.map((source) => ({
      id: `cloud:${source.id}`,
      label: `${cloudProviderLabel(source.provider)} — ${source.label}`,
      kind: "cloud",
      provider: source.provider,
      url: source.url,
      path: "",
    }));
  }

  function cloudVideosForSource(source) {
    const rootId = `cloud:${source.id}`;
    return (Array.isArray(source.videos) ? source.videos : []).map((video) => ({
      name: video.name || "Video",
      path: video.path || video.url,
      url: video.url,
      rootId,
      size: Number(video.size) || 0,
      mtimeMs: Number(video.mtimeMs) || Date.parse(video.addedAt) || 0,
      kind: "cloud",
    }));
  }

  function formatProjectDate(isoOrMs) {
    const d = new Date(isoOrMs);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function buildProjectTitle({ meta, frameCount, video, updatedAt }) {
    const tag = meta?.tag ? String(meta.tag).trim() : "";
    if (tag) return tag.length > 56 ? `${tag.slice(0, 53)}…` : tag;
    const prompt = meta?.prompt ? String(meta.prompt).trim() : "";
    if (prompt) return prompt.length > 56 ? `${prompt.slice(0, 53)}…` : prompt;
    const dateStr = formatProjectDate(updatedAt);
    if (frameCount > 0 && video) return `${frameCount} frames · video · ${dateStr}`;
    if (frameCount > 0) return `${frameCount} frames · ${dateStr}`;
    if (video) return `Video · ${dateStr}`;
    return `Project · ${dateStr}`;
  }

  function projectPlaybackUrls(entry) {
    let videoUrl = null;
    let thumbUrl = null;
    if (entry.kind === "run" && entry.runId && entry.videoName) {
      videoUrl = `/api/runs/${encodeURIComponent(entry.runId)}/video/${encodeURIComponent(entry.videoName)}`;
    } else if (entry.videoPath) {
      videoUrl = `/api/video-swarm/file?path=${encodeURIComponent(entry.videoPath)}&rootId=${encodeURIComponent(entry.rootId || "uploads")}`;
    }
    if (entry.kind === "run" && entry.runId && entry.thumbFrameName) {
      thumbUrl = `/api/runs/${encodeURIComponent(entry.runId)}/frames/${encodeURIComponent(entry.thumbFrameName)}`;
    } else if (entry.thumbPath) {
      thumbUrl = `/api/video-swarm/file?path=${encodeURIComponent(entry.thumbPath)}&rootId=${encodeURIComponent(entry.rootId || "uploads")}`;
    }
    return { videoUrl, thumbUrl };
  }

  async function scanDirectoryForProjectAssets(dirPath, { maxDepth = 2 } = {}) {
    const frameFiles = [];
    let video = null;
    let thumbPath = null;

    async function walk(dir, depth) {
      if (depth > maxDepth) return;
      let entries;
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        if (ent.name.startsWith(".")) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          await walk(full, depth + 1);
          continue;
        }
        if (!ent.isFile()) continue;
        const ext = path.extname(ent.name).toLowerCase();
        if (/^frame_\d+\.(png|jpg|jpeg|webp)$/i.test(ent.name)) {
          frameFiles.push(full);
          if (!thumbPath) thumbPath = full;
        } else if (VIDEO_EXT.has(ext) && !video) {
          const fst = await fsp.stat(full);
          video = {
            path: full,
            name: ent.name,
            size: fst.size,
            mtimeMs: fst.mtimeMs,
          };
        } else if (IMAGE_EXT.has(ext) && !thumbPath) {
          thumbPath = full;
        }
      }
    }

    await walk(dirPath, 0);
    return {
      frameCount: frameFiles.length,
      video,
      thumbPath,
      thumbFrameName: thumbPath ? path.basename(thumbPath) : null,
    };
  }

  async function listVideoSwarmProjects() {
    await fsp.mkdir(projectsDir, { recursive: true });
    const projects = [];

    try {
      const subs = await fsp.readdir(projectsDir, { withFileTypes: true });
      for (const ent of subs) {
        if (!ent.isDirectory()) continue;
        const dirPath = path.join(projectsDir, ent.name);
        const st = await fsp.stat(dirPath);
        const assets = await scanDirectoryForProjectAssets(dirPath);
        if (!assets.frameCount && !assets.video) continue;
        const root = rootForResolvedPath(dirPath, videoSwarmRoots());
        projects.push({
          id: `uploads-project:${ent.name}`,
          kind: "uploads-project",
          runId: null,
          rootId: root ? root.id : "uploads",
          dirPath,
          videoPath: assets.video?.path || null,
          videoName: assets.video?.name || null,
          thumbPath: assets.thumbPath,
          thumbFrameName: assets.thumbFrameName,
          frameCount: assets.frameCount,
          updatedAt: new Date(Math.max(st.mtimeMs, assets.video?.mtimeMs || 0)).toISOString(),
          meta: {},
        });
      }
    } catch (_err) {
      /* ignore */
    }

    try {
      const rootEntries = await fsp.readdir(uploadsDir, { withFileTypes: true });
      for (const ent of rootEntries) {
        if (!ent.isFile()) continue;
        const ext = path.extname(ent.name).toLowerCase();
        if (!VIDEO_EXT.has(ext)) continue;
        const full = path.join(uploadsDir, ent.name);
        const fst = await fsp.stat(full);
        const root = rootForResolvedPath(full, videoSwarmRoots());
        projects.push({
          id: `uploads-loose:${ent.name}`,
          kind: "uploads-loose",
          runId: null,
          rootId: root ? root.id : "uploads",
          dirPath: uploadsDir,
          videoPath: full,
          videoName: ent.name,
          thumbPath: null,
          thumbFrameName: null,
          frameCount: 0,
          updatedAt: new Date(fst.mtimeMs).toISOString(),
          meta: {},
        });
      }
    } catch (_err) {
      /* ignore */
    }

    try {
      const runEntries = await fsp.readdir(runsDir, { withFileTypes: true });
      for (const ent of runEntries) {
        if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
        const dirPath = path.join(runsDir, ent.name);
        const st = await fsp.stat(dirPath);
        let meta = {};
        try {
          const raw = await fsp.readFile(path.join(dirPath, "run.json"), "utf8");
          const manifest = JSON.parse(raw);
          meta = {
            tag: manifest.tag,
            prompt: manifest.prompt_positive || manifest.prompt,
            frame_count: manifest.frame_count,
          };
        } catch (_e) {
          /* optional run.json */
        }
        const assets = await scanDirectoryForProjectAssets(dirPath);
        const frameCount = assets.frameCount || Number(meta.frame_count) || 0;
        if (!frameCount && !assets.video) continue;
        projects.push({
          id: `run:${ent.name}`,
          kind: "run",
          runId: ent.name,
          rootId: "runs",
          dirPath,
          videoPath: assets.video?.path || null,
          videoName: assets.video?.name || null,
          thumbPath: assets.thumbPath,
          thumbFrameName: assets.thumbFrameName,
          frameCount,
          updatedAt: new Date(Math.max(st.mtimeMs, assets.video?.mtimeMs || 0)).toISOString(),
          meta,
        });
      }
    } catch (_err) {
      /* ignore */
    }

    projects.sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
    return projects.map((entry) => {
      const title = buildProjectTitle({
        meta: entry.meta,
        frameCount: entry.frameCount,
        video: entry.videoPath,
        updatedAt: entry.updatedAt,
      });
      const urls = projectPlaybackUrls(entry);
      return {
        id: entry.id,
        kind: entry.kind,
        title,
        frameCount: entry.frameCount,
        hasVideo: Boolean(entry.videoPath),
        videoPath: entry.videoPath,
        videoName: entry.videoName,
        rootId: entry.rootId,
        runId: entry.runId,
        updatedAt: entry.updatedAt,
        videoUrl: urls.videoUrl,
        thumbUrl: urls.thumbUrl,
      };
    });
  }

  function classifyVideoSource(name, rootId) {
    if (/defora_rec/i.test(String(name || ""))) return "recording";
    if (rootId === "runs") return "run";
    return "upload";
  }

  function buildVideoTitle({ name, updatedAt, source }) {
    const dateStr = formatProjectDate(updatedAt);
    if (source === "recording") return `Recording · ${dateStr}`;
    if (source === "run") return `Run export · ${dateStr}`;
    return `Video · ${dateStr}`;
  }

  function formatVideoByteSize(size) {
    const n = Number(size) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatVideoMeta({ updatedAt, size }) {
    const parts = [];
    if (updatedAt) {
      const d = new Date(updatedAt);
      if (!Number.isNaN(d.getTime())) {
        parts.push(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
      }
    }
    if (size > 0) parts.push(formatVideoByteSize(size));
    return parts.join(" · ");
  }

  async function findThumbInDirectory(dirPath) {
    try {
      const items = await fsp.readdir(dirPath, { withFileTypes: true });
      for (const ent of items) {
        if (!ent.isFile()) continue;
        if (/^frame_\d+\.(png|jpg|jpeg|webp)$/i.test(ent.name)) {
          return path.join(dirPath, ent.name);
        }
      }
      for (const ent of items) {
        if (!ent.isFile()) continue;
        const ext = path.extname(ent.name).toLowerCase();
        if (IMAGE_EXT.has(ext)) return path.join(dirPath, ent.name);
      }
    } catch (_e) {
      /* ignore */
    }
    return null;
  }

  function runIdFromVideoPath(full) {
    const rel = path.relative(runsDir, full);
    if (!rel || rel.startsWith("..")) return null;
    const seg = rel.split(path.sep).filter(Boolean);
    return seg.length ? seg[0] : null;
  }

  async function listVideoSwarmVideos() {
    const videos = [];
    const seen = new Set();
    const roots = videoSwarmRoots();

    async function pushVideo(full, rootId) {
      const resolved = path.resolve(full);
      if (seen.has(resolved)) return;
      seen.add(resolved);
      let fst;
      try {
        fst = await fsp.stat(full);
      } catch {
        return;
      }
      if (!fst.isFile()) return;
      const dirPath = path.dirname(full);
      const thumbPath = await findThumbInDirectory(dirPath);
      const videoName = path.basename(full);
      const source = classifyVideoSource(videoName, rootId);
      const runId = rootId === "runs" ? runIdFromVideoPath(full) : null;
      videos.push({
        id: `video:${rootId}:${resolved}`,
        kind: rootId === "runs" ? "run" : "video",
        source,
        runId,
        rootId,
        videoPath: full,
        videoName,
        thumbPath,
        thumbFrameName: thumbPath ? path.basename(thumbPath) : null,
        size: fst.size,
        updatedAt: new Date(fst.mtimeMs).toISOString(),
      });
    }

    async function walk(dir, rootId, depth = 0) {
      if (depth > 14) return;
      let entries;
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        if (ent.name.startsWith(".")) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          await walk(full, rootId, depth + 1);
          continue;
        }
        if (!ent.isFile()) continue;
        const ext = path.extname(ent.name).toLowerCase();
        if (!VIDEO_EXT.has(ext)) continue;
        await pushVideo(full, rootId);
      }
    }

    for (const root of roots) {
      if (!root?.path || String(root.id || "").startsWith("cloud:")) continue;
      if (root.id === "hls") continue;
      await walk(root.path, root.id);
    }

    videos.sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
    return videos.map((entry) => {
      const title = buildVideoTitle({
        name: entry.videoName,
        updatedAt: entry.updatedAt,
        source: entry.source,
      });
      const urls = projectPlaybackUrls(entry);
      return {
        id: entry.id,
        kind: entry.kind,
        source: entry.source,
        title,
        meta: formatVideoMeta({ updatedAt: entry.updatedAt, size: entry.size }),
        videoPath: entry.videoPath,
        videoName: entry.videoName,
        rootId: entry.rootId,
        runId: entry.runId,
        updatedAt: entry.updatedAt,
        videoUrl: urls.videoUrl,
        thumbUrl: urls.thumbUrl,
        size: entry.size,
      };
    });
  }

  function audioFileUrl(entry) {
    if (!entry?.audioPath) return null;
    return `/api/video-swarm/file?path=${encodeURIComponent(entry.audioPath)}&rootId=${encodeURIComponent(entry.rootId || "uploads")}`;
  }

  function classifyAudioSource(name, rootId) {
    if (rootId === "runs") return "run";
    return "upload";
  }

  function buildAudioTitle({ updatedAt, source }) {
    const dateStr = formatProjectDate(updatedAt);
    if (source === "run") return `Run audio · ${dateStr}`;
    return `Audio · ${dateStr}`;
  }

  async function listVideoSwarmAudio() {
    const items = [];
    const seen = new Set();
    const roots = videoSwarmRoots();

    async function pushAudio(full, rootId) {
      const resolved = path.resolve(full);
      if (seen.has(resolved)) return;
      seen.add(resolved);
      let fst;
      try {
        fst = await fsp.stat(full);
      } catch {
        return;
      }
      if (!fst.isFile()) return;
      const audioName = path.basename(full);
      items.push({
        id: `audio:${rootId}:${resolved}`,
        kind: "audio",
        source: classifyAudioSource(audioName, rootId),
        rootId,
        audioPath: full,
        audioName,
        size: fst.size,
        updatedAt: new Date(fst.mtimeMs).toISOString(),
      });
    }

    async function walk(dir, rootId, depth = 0) {
      if (depth > 14) return;
      let entries;
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        if (ent.name.startsWith(".")) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          await walk(full, rootId, depth + 1);
          continue;
        }
        if (!ent.isFile()) continue;
        const ext = path.extname(ent.name).toLowerCase();
        if (!AUDIO_EXT.has(ext)) continue;
        await pushAudio(full, rootId);
      }
    }

    for (const root of roots) {
      if (!root?.path || String(root.id || "").startsWith("cloud:")) continue;
      if (root.id === "hls") continue;
      await walk(root.path, root.id);
    }

    items.sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
    return items.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      source: entry.source,
      title: buildAudioTitle({ updatedAt: entry.updatedAt, source: entry.source }),
      meta: formatVideoMeta({ updatedAt: entry.updatedAt, size: entry.size }),
      audioPath: entry.audioPath,
      audioName: entry.audioName,
      rootId: entry.rootId,
      updatedAt: entry.updatedAt,
      audioUrl: audioFileUrl(entry),
      size: entry.size,
    }));
  }

  async function browseVideoSwarm(targetPath, { recursive = false, sortKey = "name", videosOnly = false } = {}) {
    const st = await fsp.stat(targetPath);
    if (!st.isDirectory()) {
      const err = new Error("not a directory");
      err.code = "ENOTDIR";
      throw err;
    }
    if (videosOnly) recursive = true;
    const entries = await fsp.readdir(targetPath, { withFileTypes: true });
    const parent = path.dirname(targetPath);
    const roots = videoSwarmRoots();
    const atRoot = roots.some((r) => path.resolve(r.path) === path.resolve(targetPath));
    const videos = [];
    const folders = [];
    const walk = async (dir) => {
      const items = await fsp.readdir(dir, { withFileTypes: true });
      for (const ent of items) {
        if (ent.name.startsWith(".")) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (recursive) await walk(full);
          continue;
        }
        if (!ent.isFile()) continue;
        const ext = path.extname(ent.name).toLowerCase();
        if (!VIDEO_EXT.has(ext)) continue;
        const fst = await fsp.stat(full);
        const root = rootForResolvedPath(full, roots);
        videos.push({
          name: ent.name,
          path: full,
          rootId: root ? root.id : "",
          size: fst.size,
          mtimeMs: fst.mtimeMs,
        });
      }
    };
    if (recursive) {
      await walk(targetPath);
    } else if (!videosOnly) {
      for (const ent of entries) {
        if (ent.name.startsWith(".")) continue;
        const full = path.join(targetPath, ent.name);
        if (ent.isDirectory()) {
          const root = rootForResolvedPath(full, roots);
          folders.push({
            name: ent.name,
            path: full,
            rootId: root ? root.id : "",
          });
          continue;
        }
        if (!ent.isFile()) continue;
        const ext = path.extname(ent.name).toLowerCase();
        if (!VIDEO_EXT.has(ext)) continue;
        const fst = await fsp.stat(full);
        const root = rootForResolvedPath(full, roots);
        videos.push({
          name: ent.name,
          path: full,
          rootId: root ? root.id : "",
          size: fst.size,
          mtimeMs: fst.mtimeMs,
        });
      }
    }
    const sortFn = {
      name: (a, b) => a.name.localeCompare(b.name),
      date: (a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0),
      size: (a, b) => (b.size || 0) - (a.size || 0),
    }[sortKey] || ((a, b) => a.name.localeCompare(b.name));
    folders.sort((a, b) => a.name.localeCompare(b.name));
    videos.sort(sortFn);
    const root = rootForResolvedPath(targetPath, roots);
    return {
      kind: "local",
      path: targetPath,
      rootId: root ? root.id : "",
      parent: atRoot ? "" : parent,
      folders: videosOnly ? [] : folders,
      folderCount: videosOnly ? 0 : folders.length,
      videos,
      videoCount: videos.length,
      videosOnly: !!videosOnly,
    };
  }

  app.get("/api/storage/layout", (_req, res) => {
    res.json({
      framesDir,
      runsDir,
      uploadsDir,
      videoswarmDir,
      hlsDir,
      shared: {
        framesVolume: framesDir,
        runsVolume: runsDir,
        uploadsUnderRuns: uploadsDir.startsWith(runsDir + path.sep) || uploadsDir === runsDir,
        videoswarmUnderRuns:
          videoswarmDir.startsWith(runsDir + path.sep) || videoswarmDir === runsDir,
      },
      browserRoots: videoSwarmRoots().map(({ id, label, path: p }) => ({ id, label, path: p })),
    });
  });

  function sanitizeUploadFileName(name) {
    const base = path.basename(String(name || "upload.mp4"));
    const safe = base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
    return safe || "upload.mp4";
  }

  app.post("/api/video-swarm/upload", express.raw({ limit: "250mb", type: () => true }), async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body) || !req.body.length) {
        return res.status(400).json({ error: "empty body" });
      }
      const ext = path.extname(String(req.query.name || req.headers["x-filename"] || "")).toLowerCase();
      if (ext && !VIDEO_EXT.has(ext)) {
        return res.status(400).json({ error: "unsupported video type" });
      }
      const maxBytes = 200 * 1024 * 1024;
      if (req.body.length > maxBytes) {
        return res.status(400).json({ error: "file too large (max 200MB)" });
      }
      const safeName = sanitizeUploadFileName(req.query.name || req.headers["x-filename"]);
      const extOk = path.extname(safeName).toLowerCase();
      const finalName = VIDEO_EXT.has(extOk) ? safeName : `${safeName.replace(/\.[^.]+$/, "")}.mp4`;
      const dirMode = String(req.query.dir || "uploads").trim();
      let targetDir = uploadsDir;
      if (dirMode === "videoswarm") {
        targetDir = videoswarmDir;
      } else if (dirMode === "projects") {
        const projectId = `project-${Date.now()}`;
        targetDir = path.join(projectsDir, projectId);
      }
      await fsp.mkdir(targetDir, { recursive: true });
      const targetPath = path.join(targetDir, dirMode === "projects" ? finalName : `${Date.now()}-${finalName}`);
      await fsp.writeFile(targetPath, req.body);
      const root = rootForResolvedPath(targetPath, videoSwarmRoots());
      res.status(201).json({
        ok: true,
        name: path.basename(targetPath),
        path: targetPath,
        rootId: root ? root.id : "uploads",
        size: req.body.length,
        url: `/api/video-swarm/file?path=${encodeURIComponent(targetPath)}${root ? `&rootId=${encodeURIComponent(root.id)}` : ""}`,
      });
    } catch (err) {
      console.error("[api] video-swarm upload", err);
      res.status(500).json({ error: err.message || "upload failed" });
    }
  });

  app.get("/api/video-swarm/roots", async (_req, res) => {
    try {
      const cloudSources = await loadCloudSources();
      const localRoots = videoSwarmRoots().map(({ id, label, path: p }) => ({
        id,
        label,
        path: p,
        kind: "local",
      }));
      res.json({
        roots: [...localRoots, ...cloudRootEntries(cloudSources)],
        cloudSources,
      });
    } catch (err) {
      res.status(500).json({ error: err.message || "roots unavailable" });
    }
  });

  app.get("/api/video-swarm/cloud-sources", async (_req, res) => {
    try {
      const sources = await loadCloudSources();
      res.json({ sources });
    } catch (err) {
      res.status(500).json({ error: err.message || "cloud sources unavailable" });
    }
  });

  app.post("/api/video-swarm/cloud-sources", express.json(), async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const label = String(body.label || "").trim() || cloudProviderLabel(body.provider);
      const provider = String(body.provider || "other").trim().toLowerCase() || "other";
      let url = String(body.url || "").trim();
      if (!url) return res.status(400).json({ error: "url required" });
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      try {
        // eslint-disable-next-line no-new
        new URL(url);
      } catch (_e) {
        return res.status(400).json({ error: "invalid url" });
      }
      const sources = await loadCloudSources();
      const entry = {
        id: `cs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label,
        provider,
        url,
        videos: [],
        createdAt: new Date().toISOString(),
      };
      sources.push(entry);
      await saveCloudSources(sources);
      res.status(201).json({ source: entry, sources });
    } catch (err) {
      res.status(500).json({ error: err.message || "could not save cloud source" });
    }
  });

  app.post("/api/video-swarm/cloud-sources/:id/videos", express.json(), async (req, res) => {
    try {
      const sourceId = String(req.params.id || "").trim();
      const body = req.body && typeof req.body === "object" ? req.body : {};
      let url = String(body.url || "").trim();
      if (!url) return res.status(400).json({ error: "url required" });
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      try {
        // eslint-disable-next-line no-new
        new URL(url);
      } catch (_e) {
        return res.status(400).json({ error: "invalid url" });
      }
      const name = String(body.name || "").trim() || path.basename(new URL(url).pathname) || "Video";
      const sources = await loadCloudSources();
      const idx = sources.findIndex((s) => s.id === sourceId);
      if (idx < 0) return res.status(404).json({ error: "cloud source not found" });
      const video = {
        name,
        url,
        path: url,
        addedAt: new Date().toISOString(),
      };
      const list = Array.isArray(sources[idx].videos) ? sources[idx].videos : [];
      list.push(video);
      sources[idx].videos = list;
      await saveCloudSources(sources);
      res.status(201).json({ source: sources[idx], video });
    } catch (err) {
      res.status(500).json({ error: err.message || "could not add cloud video" });
    }
  });

  app.delete("/api/video-swarm/cloud-sources/:id", async (req, res) => {
    try {
      const sourceId = String(req.params.id || "").trim();
      const sources = await loadCloudSources();
      const next = sources.filter((s) => s.id !== sourceId);
      if (next.length === sources.length) return res.status(404).json({ error: "cloud source not found" });
      await saveCloudSources(next);
      res.json({ ok: true, sources: next });
    } catch (err) {
      res.status(500).json({ error: err.message || "could not remove cloud source" });
    }
  });

  app.post("/api/video-swarm/mkdir", express.json(), async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const folderName = sanitizeFolderName(body.name);
      if (!folderName) return res.status(400).json({ error: "invalid folder name" });
      const rootId = String(body.rootId || "").trim();
      if (rootId.startsWith("cloud:")) {
        return res.status(400).json({ error: "cannot create folders on cloud storage" });
      }
      const parentPath = resolveVideoSwarmPath(String(body.path || ""), rootId || "frames");
      if (!parentPath) return res.status(400).json({ error: "invalid path" });
      const parentStat = await fsp.stat(parentPath);
      if (!parentStat.isDirectory()) return res.status(400).json({ error: "parent is not a directory" });
      const newPath = path.join(parentPath, folderName);
      await fsp.mkdir(newPath, { recursive: false });
      res.status(201).json({ ok: true, path: newPath, name: folderName });
    } catch (err) {
      if (err.code === "EEXIST") return res.status(409).json({ error: "folder already exists" });
      if (err.code === "ENOENT") return res.status(404).json({ error: "path not found" });
      res.status(500).json({ error: err.message || "mkdir failed" });
    }
  });

  app.get("/api/video-swarm/projects", async (_req, res) => {
    try {
      const projects = await listVideoSwarmProjects();
      res.json({ projects, count: projects.length });
    } catch (err) {
      console.error("[api] video-swarm projects", err);
      res.status(500).json({ error: err.message || "projects unavailable" });
    }
  });

  app.get("/api/video-swarm/videos", async (_req, res) => {
    try {
      const videos = await listVideoSwarmVideos();
      res.json({ videos, count: videos.length });
    } catch (err) {
      console.error("[api] video-swarm videos", err);
      res.status(500).json({ error: err.message || "videos unavailable" });
    }
  });

  app.get("/api/video-swarm/audio", async (_req, res) => {
    try {
      const audio = await listVideoSwarmAudio();
      res.json({ audio, count: audio.length });
    } catch (err) {
      console.error("[api] video-swarm audio", err);
      res.status(500).json({ error: err.message || "audio unavailable" });
    }
  });

  app.get("/api/video-swarm/browse", async (req, res) => {
    try {
      const rootId = String(req.query.rootId || "").trim();
      if (rootId.startsWith("cloud:")) {
        const sourceId = rootId.slice("cloud:".length);
        const sources = await loadCloudSources();
        const source = sources.find((s) => s.id === sourceId);
        if (!source) return res.status(404).json({ error: "cloud source not found" });
        const videos = cloudVideosForSource(source);
        return res.json({
          kind: "cloud",
          path: "",
          parent: "",
          cloudSource: source,
          folders: [],
          folderCount: 0,
          videos,
          videoCount: videos.length,
        });
      }
      const browsePath = resolveVideoSwarmPath(String(req.query.path || ""), rootId || "frames");
      if (!browsePath) return res.status(400).json({ error: "invalid path" });
      const recursive = String(req.query.recursive || "") === "1" || req.query.recursive === "true";
      const videosOnly = String(req.query.videosOnly || "") === "1" || req.query.videosOnly === "true";
      const sortKey = parseVideoSwarmSortKey(req.query.sort);
      const data = await browseVideoSwarm(browsePath, { recursive, sortKey, videosOnly });
      res.json(data);
    } catch (err) {
      if (err.code === "ENOENT") return res.status(404).json({ error: "path not found" });
      console.error("[api] video-swarm browse", err);
      res.status(500).json({ error: err.message || "browse failed" });
    }
  });

  app.get("/api/video-swarm/file", async (req, res) => {
    try {
      const rawPath = String(req.query.path || "").trim();
      if (/^https?:\/\//i.test(rawPath)) {
        return res.redirect(302, rawPath);
      }
      const filePath = resolveVideoSwarmPath(rawPath, String(req.query.rootId || "").trim() || null);
      if (!filePath) return res.status(400).json({ error: "invalid path" });
      const st = await fsp.stat(filePath);
      if (!st.isFile()) return res.status(404).json({ error: "not a file" });
      const ext = path.extname(filePath).toLowerCase();
      if (IMAGE_EXT.has(ext)) {
        const imageType =
          ext === ".png" ? "image/png"
            : ext === ".webp" ? "image/webp"
              : ext === ".gif" ? "image/gif"
                : "image/jpeg";
        res.type(imageType);
        return res.sendFile(filePath);
      }
      if (AUDIO_EXT.has(ext)) {
        const audioType =
          ext === ".wav" ? "audio/wav"
            : ext === ".mp3" ? "audio/mpeg"
              : ext === ".ogg" ? "audio/ogg"
                : ext === ".flac" ? "audio/flac"
                  : ext === ".m4a" ? "audio/mp4"
                    : "application/octet-stream";
        res.type(audioType);
        return res.sendFile(filePath);
      }
      const type =
        ext === ".webm" ? "video/webm"
          : ext === ".mov" ? "video/quicktime"
            : "video/mp4";
      res.type(type);
      res.sendFile(filePath);
    } catch (err) {
      if (err.code === "ENOENT") return res.status(404).json({ error: "file not found" });
      res.status(500).json({ error: err.message || "file unavailable" });
    }
  });

  const videoswarmApiBase = String(process.env.VIDEOSWARM_API_BASE || "").trim().replace(/\/+$/, "");
  app.all("/api/videoswarm-proxy/*", async (req, res) => {
    if (!videoswarmApiBase) return res.status(501).json({ error: "VIDEOSWARM_API_BASE not configured" });
    if (!["GET", "HEAD"].includes(req.method)) return res.status(405).json({ error: "method not allowed" });
    try {
      const tail = String(req.params[0] || "").replace(/^\/+/, "");
      const url = `${videoswarmApiBase}/${tail}${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`;
      const upstream = await fetch(url, {
        method: req.method,
        headers: {
          accept: req.headers.accept || "*/*",
          range: req.headers.range || undefined,
        },
      });

      res.status(upstream.status);
      const passthrough = new Set([
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
        "cache-control",
        "etag",
        "last-modified",
      ]);
      upstream.headers.forEach((value, key) => {
        if (passthrough.has(key.toLowerCase())) res.setHeader(key, value);
      });

      if (req.method === "HEAD" || !upstream.body) return res.end();
      Readable.fromWeb(upstream.body).pipe(res);
    } catch (err) {
      console.error("[api] videoswarm proxy", err);
      res.status(502).json({ error: "upstream unavailable" });
    }
  });

  const SEQUENCER_EASING = new Set(["linear", "easeIn", "easeOut", "easeInOut"]);

  function validateTimeline(body) {
    if (!body || typeof body !== "object") return "invalid body";
    if (body.version !== 1) return "version must be 1";
    if (typeof body.durationSec !== "number" || body.durationSec <= 0 || body.durationSec > 3600) {
      return "durationSec must be between 0 and 3600";
    }
    if (typeof body.fps !== "number" || body.fps < 1 || body.fps > 120) return "fps must be 1–120";
    if (!Array.isArray(body.tracks)) return "tracks must be an array";
    for (const tr of body.tracks) {
      if (!tr || typeof tr !== "object") return "invalid track";
      if (typeof tr.param !== "string" || !/^[\w.]+$/.test(tr.param)) return "invalid track.param";
      if (!Array.isArray(tr.keyframes)) return "keyframes must be an array";
      for (const kf of tr.keyframes) {
        if (!kf || typeof kf !== "object") return "invalid keyframe";
        if (typeof kf.t !== "number" || typeof kf.v !== "number") return "keyframe requires numeric t and v";
        if (kf.t < 0 || kf.t > body.durationSec) return "keyframe t outside 0..durationSec";
        if (kf.easing != null) {
          if (typeof kf.easing !== "string" || !SEQUENCER_EASING.has(kf.easing)) {
            return "invalid keyframe.easing (use linear|easeIn|easeOut|easeInOut)";
          }
        }
      }
    }
    if (body.markers != null) {
      if (!Array.isArray(body.markers)) return "markers must be an array";
      if (body.markers.length > 64) return "too many markers (max 64)";
      const markerNameOk = /^[a-zA-Z0-9_ \-.]{1,48}$/;
      for (const mk of body.markers) {
        if (!mk || typeof mk !== "object") return "invalid marker";
        if (typeof mk.t !== "number" || typeof mk.name !== "string") return "marker requires numeric t and string name";
        if (mk.t < 0 || mk.t > body.durationSec) return "marker t outside 0..durationSec";
        const nm = mk.name.trim();
        if (!markerNameOk.test(nm)) return "invalid marker.name (1–48 chars: letters, digits, space, _ - .)";
      }
    }
    if (body.clips != null) {
      if (!Array.isArray(body.clips)) return "clips must be an array";
      if (body.clips.length > 96) return "too many clips (max 96)";
      const clipTypes = new Set(["prompt", "lora", "controlnet", "video"]);
      const clipNameOk = /^[a-zA-Z0-9_ \-.]{1,48}$/;
      for (const cl of body.clips) {
        if (!cl || typeof cl !== "object") return "invalid clip";
        if (!clipTypes.has(cl.type)) return "invalid clip.type (prompt|lora|controlnet|video)";
        if (typeof cl.t !== "number") return "clip requires numeric t";
        if (cl.t < 0 || cl.t > body.durationSec) return "clip t outside 0..durationSec";
        if (cl.endT != null && (typeof cl.endT !== "number" || cl.endT < cl.t || cl.endT > body.durationSec)) {
          return "invalid clip.endT";
        }
        const label = String(cl.label || cl.type).trim();
        if (!clipNameOk.test(label)) return "invalid clip.label (1–48 chars: letters, digits, space, _ - .)";
        if (cl.payload != null && typeof cl.payload !== "object") return "invalid clip.payload";
      }
    }
    return null;
  }

  // Cleanup function for old audio uploads
  async function cleanupOldUploads() {
    try {
      const now = Date.now();
      const maxAgeMs = uploadRetentionHours * 60 * 60 * 1000;
      const files = await fsp.readdir(uploadsDir);
      let cleanedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(uploadsDir, file);
        try {
          const stat = await fsp.stat(filePath);
          const ageMs = now - stat.mtimeMs;
          
          if (ageMs > maxAgeMs) {
            await fsp.unlink(filePath);
            cleanedCount++;
            console.log(`[cleanup] Removed old upload: ${file} (age: ${(ageMs / 1000 / 60 / 60).toFixed(1)}h)`);
          }
        } catch (err) {
          console.error(`[cleanup] Error processing ${file}:`, err.message);
        }
      }
      
      if (cleanedCount > 0) {
        console.log(`[cleanup] Cleaned up ${cleanedCount} old upload(s)`);
      }
    } catch (err) {
      console.error("[cleanup] Error during cleanup:", err.message);
    }
  }

  // Run cleanup on startup and then every hour
  cleanupOldUploads();
  const cleanupTimer = setInterval(cleanupOldUploads, 60 * 60 * 1000);

  app.post("/api/audio-upload", async (req, res) => {
    try {
      const { name, data } = req.body || {};
      if (!name || !data) {
        return res.status(400).json({ error: "name and data required" });
      }
      
      // Validate file extension
      const originalName = path.basename(String(name));
      const ext = path.extname(originalName).toLowerCase();
      const allowedExts = new Set([".wav", ".mp3", ".ogg", ".flac", ".m4a"]);
      if (!allowedExts.has(ext)) {
        return res.status(400).json({ error: "invalid or unsupported audio file extension" });
      }
      const baseNameWithoutExt = path.basename(originalName, ext);
      const sanitizedBase = baseNameWithoutExt.replace(/[^a-zA-Z0-9_-]/g, "_");
      const safeName = sanitizedBase + ext;
      
      // Parse and validate data URL
      const dataStr = String(data);
      let base64Payload;

      if (dataStr.startsWith("data:")) {
        const match = /^data:([^;]+);base64,(.+)$/.exec(dataStr);
        if (!match) {
          return res.status(400).json({ error: "invalid data URL format" });
        }
        const mimeType = match[1];
        if (typeof mimeType !== "string" || !mimeType.toLowerCase().startsWith("audio/")) {
          return res.status(400).json({ error: "invalid MIME type: audio required" });
        }
        
        // Cross-validate MIME type against file extension
        const mimeExt = {
          "audio/wav": ".wav",
          "audio/wave": ".wav",
          "audio/x-wav": ".wav",
          "audio/mpeg": ".mp3",
          "audio/mp3": ".mp3",
          "audio/ogg": ".ogg",
          "audio/flac": ".flac",
          "audio/x-flac": ".flac",
          "audio/mp4": ".m4a",
          "audio/x-m4a": ".m4a"
        };
        const expectedExt = mimeExt[mimeType.toLowerCase()];
        if (expectedExt && expectedExt !== ext) {
          return res.status(400).json({ error: `MIME type ${mimeType} does not match file extension ${ext}` });
        }
        
        base64Payload = match[2];
      } else {
        // Fallback: treat as raw base64 data without a data: URL prefix.
        base64Payload = dataStr;
      }

      const buf = Buffer.from(base64Payload, "base64");
      
      // Validate file size (max 100MB)
      const maxSizeBytes = 100 * 1024 * 1024;
      if (buf.length > maxSizeBytes) {
        return res.status(400).json({ error: `file too large: ${(buf.length / 1024 / 1024).toFixed(2)}MB (max 100MB)` });
      }
      
      const target = path.join(uploadsDir, `${Date.now()}-${safeName}`);
      await fsp.writeFile(target, buf);
      res.json({ ok: true, path: target, name: safeName, size: buf.length });
    } catch (err) {
      console.error("[api] audio upload error", err);
      res.status(500).json({ error: "upload failed" });
    }
  });

  app.get("/api/presets", async (_req, res) => {
    try {
      const files = await fsp.readdir(presetsDir);
      const presets = files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
      res.json({ presets });
    } catch (err) {
      console.error("[api] presets list error", err);
      res.status(500).json({ error: "could not list presets" });
    }
  });

  app.get("/api/presets/:name", async (req, res) => {
    try {
      const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, "");
      if (!name) return res.status(400).json({ error: "invalid preset name" });
      const filePath = path.join(presetsDir, `${name}.json`);
      const data = await fsp.readFile(filePath, "utf-8");
      const preset = JSON.parse(data);
      res.json({ name, preset });
    } catch (err) {
      if (err.code === "ENOENT") {
        res.status(404).json({ error: "preset not found" });
      } else {
        console.error("[api] preset load error", err);
        res.status(500).json({ error: "could not load preset" });
      }
    }
  });

  app.post("/api/presets/:name", async (req, res) => {
    try {
      const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, "");
      if (!name) return res.status(400).json({ error: "invalid preset name" });
      const preset = req.body;
      if (!preset || typeof preset !== "object") {
        return res.status(400).json({ error: "invalid preset data" });
      }
      const filePath = path.join(presetsDir, `${name}.json`);
      await fsp.writeFile(filePath, JSON.stringify(preset, null, 2), "utf-8");
      res.json({ ok: true, name });
    } catch (err) {
      console.error("[api] preset save error", err);
      res.status(500).json({ error: "could not save preset" });
    }
  });

  app.delete("/api/presets/:name", async (req, res) => {
    try {
      const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, "");
      if (!name) return res.status(400).json({ error: "invalid preset name" });
      const filePath = path.join(presetsDir, `${name}.json`);
      await fsp.unlink(filePath);
      res.json({ ok: true });
    } catch (err) {
      if (err.code === "ENOENT") {
        res.status(404).json({ error: "preset not found" });
      } else {
        console.error("[api] preset delete error", err);
        res.status(500).json({ error: "could not delete preset" });
      }
    }
  });

  // Shared presets for collaborative features
  const sharedPresetsDir = path.join(__dirname, "shared-presets");
  if (!require('fs').existsSync(sharedPresetsDir)) {
    require('fs').mkdirSync(sharedPresetsDir, { recursive: true });
  }

  app.get("/api/shared-presets", async (_req, res) => {
    try {
      const files = await fsp.readdir(sharedPresetsDir);
      const presets = await Promise.all(
        files
          .filter((f) => f.endsWith(".json"))
          .map(async (f) => {
            const data = await fsp.readFile(path.join(sharedPresetsDir, f), "utf-8");
            const preset = JSON.parse(data);
            return {
              name: f.replace(/\.json$/, ""),
              sharedBy: preset.sharedBy || "unknown",
              sharedAt: preset.sharedAt || "",
              description: preset.description || "",
              tags: preset.tags || [],
            };
          })
      );
      res.json({ presets });
    } catch (err) {
      console.error("[api] shared presets list error", err);
      res.status(500).json({ error: "could not list shared presets" });
    }
  });

  app.post("/api/shared-presets", async (req, res) => {
    const { name, preset, sharedBy, description, tags } = req.body || {};
    if (!name || !preset) {
      return res.status(400).json({ error: "name and preset data required" });
    }
    try {
      const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, "");
      if (!sanitizedName) return res.status(400).json({ error: "invalid preset name" });
      
      const presetData = {
        ...preset,
        sharedBy: sharedBy || "anonymous",
        sharedAt: new Date().toISOString(),
        description: description || "",
        tags: tags || [],
      };
      
      const filePath = path.join(sharedPresetsDir, `${sanitizedName}.json`);
      await fsp.writeFile(filePath, JSON.stringify(presetData, null, 2), "utf-8");
      
      // Broadcast to all connected clients
      broadcast({
        type: "shared_preset",
        action: "created",
        name: sanitizedName,
        sharedBy: presetData.sharedBy,
      });
      
      res.json({ ok: true, name: sanitizedName });
    } catch (err) {
      console.error("[api] shared preset save error", err);
      res.status(500).json({ error: "could not save shared preset" });
    }
  });

  app.get("/api/shared-presets/:name", async (req, res) => {
    try {
      const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, "");
      if (!name) return res.status(400).json({ error: "invalid preset name" });
      const filePath = path.join(sharedPresetsDir, `${name}.json`);
      const data = await fsp.readFile(filePath, "utf-8");
      const preset = JSON.parse(data);
      res.json({ name, preset });
    } catch (err) {
      if (err.code === "ENOENT") {
        res.status(404).json({ error: "shared preset not found" });
      } else {
        console.error("[api] shared preset load error", err);
        res.status(500).json({ error: "could not load shared preset" });
      }
    }
  });

  app.delete("/api/shared-presets/:name", async (req, res) => {
    try {
      const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, "");
      if (!name) return res.status(400).json({ error: "invalid preset name" });
      const filePath = path.join(sharedPresetsDir, `${name}.json`);
      await fsp.unlink(filePath);
      
      broadcast({
        type: "shared_preset",
        action: "deleted",
        name,
      });
      
      res.json({ ok: true });
    } catch (err) {
      if (err.code === "ENOENT") {
        res.status(404).json({ error: "shared preset not found" });
      } else {
        console.error("[api] shared preset delete error", err);
        res.status(500).json({ error: "could not delete shared preset" });
      }
    }
  });

  // Deforum animation settings (full JSON preset for hidden LIVE panel)
  const deforumSettingsFile = path.join(__dirname, "deforum-settings.json");
  const deforumJobMetaFile = path.join(__dirname, "deforum-job-meta.json");

  async function readDeforumJobMeta() {
    try {
      if (!fs.existsSync(deforumJobMetaFile)) return {};
      return JSON.parse(await fsp.readFile(deforumJobMetaFile, "utf-8"));
    } catch (_e) {
      return {};
    }
  }

  async function writeDeforumJobMeta(patch = {}) {
    const prev = await readDeforumJobMeta();
    const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
    await fsp.writeFile(deforumJobMetaFile, JSON.stringify(next, null, 2), "utf-8");
    return next;
  }

  function mergePromptStylesIntoSnapshot(snapshot, promptStyles) {
    const snap = snapshot && typeof snapshot === "object" ? { ...snapshot } : {};
    if (promptStyles && typeof promptStyles === "object") {
      snap.promptStyles = promptStyles;
    }
    return snap;
  }

  function extractStyleMetaFromSnapshot(snapshot) {
    const ps = snapshot?.promptStyles;
    if (!ps || typeof ps !== "object") return {};
    const active = ps.activeStyle && typeof ps.activeStyle === "object" ? ps.activeStyle : null;
    const morph = ps.morphedAppend && typeof ps.morphedAppend === "object" ? ps.morphedAppend : {};
    return {
      style_id: ps.activeStyleId || active?.id || null,
      style_name: active?.name || null,
      style_positive_append: morph.positive || active?.positive || null,
      style_negative_append: morph.negative || active?.negative || null,
    };
  }

  app.get("/api/deforum/settings", async (_req, res) => {
    try {
      let settings = null;
      if (fs.existsSync(deforumSettingsFile)) {
        settings = JSON.parse(await fsp.readFile(deforumSettingsFile, "utf-8"));
      }
      const meta = await readDeforumJobMeta();
      res.json({ settings, promptStyles: meta.promptStyles || null });
    } catch (err) {
      console.error("[api] deforum settings read error", err);
      res.status(500).json({ error: "could not read deforum settings" });
    }
  });

  app.post("/api/deforum/settings", async (req, res) => {
    const { settings, promptStyles } = req.body || {};
    if (!settings || typeof settings !== "object") {
      return res.status(400).json({ error: "settings object required" });
    }
    try {
      let modelSync = null;
      let previousSettings = null;
      if (fs.existsSync(deforumSettingsFile)) {
        try {
          previousSettings = JSON.parse(await fsp.readFile(deforumSettingsFile, "utf-8"));
        } catch (_err) {
          previousSettings = null;
        }
      }
      await fsp.writeFile(deforumSettingsFile, JSON.stringify(settings, null, 2), "utf-8");
      if (promptStyles && typeof promptStyles === "object") {
        await writeDeforumJobMeta({ promptStyles });
      }
      const previousModel = typeof previousSettings?.sd_model_name === "string"
        ? previousSettings.sd_model_name.trim()
        : "";
      const requestedModel = typeof settings.sd_model_name === "string" ? settings.sd_model_name.trim() : "";
      if (requestedModel && requestedModel !== previousModel) {
        try {
          modelSync = await switchSdModelOnForge(req, requestedModel);
        } catch (modelErr) {
          modelSync = { success: false, error: modelErr.message };
          console.warn("[api] deforum settings model sync warning", modelErr.message);
        }
      }
      broadcast({ type: "deforum_settings", action: "updated" });
      res.json({ ok: true, modelSync });
    } catch (err) {
      console.error("[api] deforum settings save error", err);
      res.status(500).json({ error: "could not save deforum settings" });
    }
  });

  app.get("/api/prompt-styles", async (_req, res) => {
    try {
      const styles = await promptStylesStore.readStyles(webRoot);
      res.json({ styles, count: styles.length });
    } catch (err) {
      console.error("[api] prompt-styles list error", err);
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  app.post("/api/prompt-styles/import-forge", async (req, res) => {
    const body = req.body || {};
    const forgeUrl =
      String(body.forgeUrl || "").trim()
      || previewForgeTarget(req)?.url
      || process.env.FORGE_URL
      || "http://127.0.0.1:7860";
    try {
      const result = await promptStylesStore.importFromForge(forgeUrl, webRoot, {
        merge: body.replace !== true,
        persistSeed: body.persistSeed !== false,
      });
      const styles = await promptStylesStore.readStyles(webRoot);
      res.json({ ok: true, forgeUrl, ...result, styles });
    } catch (err) {
      console.error("[api] prompt-styles import error", err);
      res.status(502).json({ error: String(err.message || err) });
    }
  });

  app.post("/api/prompt-styles", async (req, res) => {
    const { name, positive, negative, description, previewPrompt } = req.body || {};
    if (!String(name || "").trim()) {
      return res.status(400).json({ error: "name required" });
    }
    try {
      const styles = await promptStylesStore.readStyles(webRoot);
      const id = promptStylesStore.dedupeStyleIds([
        {
          id: String(req.body?.id || "").trim() || undefined,
          name: String(name).trim(),
          description: String(description || "").trim(),
          previewPrompt: String(previewPrompt || "").trim(),
          positive: String(positive || "").trim(),
          negative: String(negative || "").trim(),
          source: "custom",
          exampleImage: null,
          updatedAt: new Date().toISOString(),
        },
      ])[0].id;
      if (styles.some((style) => style.id === id)) {
        return res.status(409).json({ error: "style id already exists" });
      }
      styles.push(
        promptStylesStore.normalizeStyleRecord({
          id,
          name: String(name).trim(),
          description: String(description || "").trim(),
          previewPrompt: String(previewPrompt || "").trim(),
          positive: String(positive || "").trim(),
          negative: String(negative || "").trim(),
          source: "custom",
          exampleImage: null,
          updatedAt: new Date().toISOString(),
        }),
      );
      const saved = await promptStylesStore.writeStyles(webRoot, styles);
      const style = saved.find((entry) => entry.id === id);
      res.json({ ok: true, style });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  app.put("/api/prompt-styles/:id", async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id required" });
    const { name, positive, negative, description, previewPrompt } = req.body || {};
    try {
      const styles = await promptStylesStore.readStyles(webRoot);
      const idx = styles.findIndex((style) => style.id === id);
      if (idx < 0) return res.status(404).json({ error: "style not found" });
      if (name != null) styles[idx].name = String(name).trim() || styles[idx].name;
      if (description != null) styles[idx].description = String(description).trim();
      if (previewPrompt != null) styles[idx].previewPrompt = String(previewPrompt).trim();
      if (positive != null) styles[idx].positive = String(positive).trim();
      if (negative != null) styles[idx].negative = String(negative).trim();
      styles[idx] = promptStylesStore.normalizeStyleRecord(styles[idx]);
      const saved = await promptStylesStore.writeStyles(webRoot, styles);
      res.json({ ok: true, style: saved.find((entry) => entry.id === id) });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  app.delete("/api/prompt-styles/:id", async (req, res) => {
    const id = String(req.params.id || "").trim();
    try {
      const styles = (await promptStylesStore.readStyles(webRoot)).filter((style) => style.id !== id);
      if (styles.length === (await promptStylesStore.readStyles(webRoot)).length) {
        return res.status(404).json({ error: "style not found" });
      }
      await promptStylesStore.clearStyleExample(webRoot, id).catch(() => null);
      await promptStylesStore.writeStyles(webRoot, styles);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  app.post("/api/prompt-styles/:id/example", async (req, res) => {
    const id = String(req.params.id || "").trim();
    const sourcePath = String((req.body || {}).path || "").trim();
    if (!sourcePath) return res.status(400).json({ error: "path required" });
    try {
      const style = await promptStylesStore.setStyleExampleFromPath(webRoot, id, sourcePath, uploadsDir);
      res.json({ ok: true, style });
    } catch (err) {
      res.status(400).json({ error: String(err.message || err) });
    }
  });

  app.delete("/api/prompt-styles/:id/example", async (req, res) => {
    const id = String(req.params.id || "").trim();
    try {
      const style = await promptStylesStore.clearStyleExample(webRoot, id);
      res.json({ ok: true, style });
    } catch (err) {
      res.status(400).json({ error: String(err.message || err) });
    }
  });

  /** Merge Wan engine UI state into Deforum settings (no Forge). Used by E2E and tooling. */
  app.post("/api/wan/merge-settings", async (req, res) => {
    const body = req.body || {};
    try {
      const { mergeWanEngineIntoDeforumSettings, normalizeWanEngine } = await import(
        "./src/shared/wan-engine-config.mjs"
      );
      const maxFrames = Math.max(1, Math.min(99999, parseInt(body.maxFrames, 10) || 96));
      const fps = Math.max(1, Math.min(60, parseInt(body.fps, 10) || 12));
      const wanEngine = normalizeWanEngine(body.wanEngine && typeof body.wanEngine === "object" ? body.wanEngine : {});
      const positive = String(body.prompt || "cinematic ocean waves at dusk").trim();
      let baseSettings = {};
      if (fs.existsSync(deforumSettingsFile)) {
        try { baseSettings = JSON.parse(await fsp.readFile(deforumSettingsFile, "utf-8")); } catch (_e) { /* ignore */ }
      }
      const settings = mergeWanEngineIntoDeforumSettings(
        { ...baseSettings, max_frames: maxFrames, fps, prompts: { 0: positive } },
        wanEngine,
        { positivePrompt: positive },
      );
      res.json({ settings, wanEngine, maxFrames, fps });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  let wanGenerateBatchId = null;
  let wanGenerateRunning = false;

  /** Submit a Wan Video batch to Forge (full clip, not single-frame preview). */
  app.post("/api/wan/generate", async (req, res) => {
    if (externalBlocked()) {
      return res.json({ ok: false, skipped: true, reason: "ci_offline" });
    }
    if (wanGenerateRunning) {
      return res.json({ ok: true, batchId: wanGenerateBatchId, status: "already_running" });
    }
    const body = req.body || {};
    const maxFrames = Math.max(1, Math.min(480, parseInt(body.maxFrames, 10) || 96));
    const fps = Math.max(1, Math.min(60, parseInt(body.fps, 10) || 12));
    const target = previewForgeTarget(req);
    try {
      const { mergeWanEngineIntoDeforumSettings, normalizeWanEngine } = await import(
        "./src/shared/wan-engine-config.mjs"
      );
      let baseSettings = {};
      if (fs.existsSync(deforumSettingsFile)) {
        try { baseSettings = JSON.parse(await fsp.readFile(deforumSettingsFile, "utf-8")); } catch (_e) { /* ignore */ }
      }
      const wanEngine = normalizeWanEngine(
        body.wanEngine && typeof body.wanEngine === "object" ? body.wanEngine : {},
      );
      const positive = String(
        body.prompt || baseSettings.prompts?.["0"] || baseSettings.animation_prompts_positive || "cinematic scene",
      ).trim();
      const settings = mergeWanEngineIntoDeforumSettings(
        {
          ...baseSettings,
          max_frames: maxFrames,
          fps,
          skip_video_creation: false,
          motion_preview_mode: false,
        },
        wanEngine,
        { positivePrompt: positive },
      );
      if (typeof fetch === "undefined") {
        return res.status(500).json({ error: "fetch not available" });
      }
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      let response;
      try {
        response = await fetch(`${target.url}/deforum_api/batches`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ deforum_settings: settings }),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(t);
      }
      if (!response.ok) {
        const text = await response.text();
        return res.status(502).json({ error: "wan batch submit failed", detail: text.slice(0, 300) });
      }
      const data = await response.json();
      wanGenerateBatchId = data.batch_id || null;
      wanGenerateRunning = true;
      if (wanGenerateBatchId) {
        persistRunJobSnapshot(wanGenerateBatchId, {
          kind: "wan_generate",
          maxFrames,
          fps,
          settings,
          node: target.node ? { name: target.node.name, url: target.node.url } : null,
        });
      }
      broadcast({ type: "wan_generate_started", batchId: wanGenerateBatchId, maxFrames, fps });
      console.log(`[wan] Started ${maxFrames}-frame Wan Video batch at ${fps}fps, batchId=${wanGenerateBatchId}`);
      res.json({
        ok: true,
        batchId: wanGenerateBatchId,
        maxFrames,
        fps,
        animation_mode: settings.animation_mode,
      });
      if (wanGenerateBatchId) {
        (async () => {
          for (let i = 0; i < 600; i++) {
            await sleep(2000);
            try {
              const pr = await fetch(`${target.url}/deforum_api/batches/${wanGenerateBatchId}`);
              if (!pr.ok) break;
              const pd = await pr.json();
              const st = String(pd.status || pd.state || "").toLowerCase();
              if (["completed", "failed", "cancelled", "canceled", "done"].includes(st)) {
                wanGenerateRunning = false;
                await updateRunManifest(wanGenerateBatchId, {
                  status: normalizeForgeRunStatus(st),
                  completed_at: new Date().toISOString(),
                });
                broadcast({ type: "wan_generate_done", batchId: wanGenerateBatchId, status: st });
                console.log(`[wan] Batch ${wanGenerateBatchId} ${st}`);
                break;
              }
            } catch (_e) { break; }
          }
          wanGenerateRunning = false;
        })();
      }
    } catch (err) {
      wanGenerateRunning = false;
      console.error("[api] wan generate error", err);
      res.status(502).json({ error: String(err.message || err) });
    } finally {
      target.release();
    }
  });

  app.get("/api/wan/generate/status", (_req, res) => {
    res.json({ running: wanGenerateRunning, batchId: wanGenerateBatchId });
  });

  /** Trigger Wan model download on Forge via a 1-frame Wan Video preview (wan_auto_download). */
  app.post("/api/wan/download-models", async (req, res) => {
    if (externalBlocked()) {
      return res.json({ ok: false, skipped: true, reason: "ci_offline" });
    }
    const body = req.body || {};
    const packageId = String(body.packageId || "vace-1.3b").trim();
    const target = previewForgeTarget(req);
    try {
      const {
        mergeWanEngineIntoDeforumSettings,
        normalizeWanEngine,
        wanEngineForDownloadPackage,
        getWanDownloadPackage,
      } = await import("./src/shared/wan-engine-config.mjs");
      const pkg = getWanDownloadPackage(packageId);
      const wanEngine = normalizeWanEngine(
        wanEngineForDownloadPackage(packageId, {
          ...(body.wanEngine && typeof body.wanEngine === "object" ? body.wanEngine : {}),
        }),
      );
      const positive = String(body.prompt || "defora wan model download probe").trim();
      const settings = mergeWanEngineIntoDeforumSettings(
        { W: 864, H: 480, prompts: { 0: positive } },
        wanEngine,
        { positivePrompt: positive },
      );
      const result = await renderDeforumPreview(settings, target);
      res.json({
        ok: !!(result && result.ok),
        packageId: pkg.id,
        hfRepo: pkg.hfRepo || null,
        hfCommand: pkg.hfCommand || null,
        downloadTriggered: true,
        ...result,
      });
    } catch (err) {
      let pkg = null;
      try {
        const { getWanDownloadPackage } = await import("./src/shared/wan-engine-config.mjs");
        pkg = getWanDownloadPackage(packageId);
      } catch (_e) { /* ignore */ }
      res.status(502).json({
        error: String(err.message || err),
        detail: err.detail,
        packageId,
        manual: true,
        hfCommand: pkg?.hfCommand || null,
      });
    } finally {
      target.release();
    }
  });

  /** Merge SVD engine UI state into Forge /svd_api/generate payload (no GPU). */
  app.post("/api/svd/merge-settings", async (req, res) => {
    const body = req.body || {};
    try {
      const { buildSvdGeneratePayload, normalizeSvdEngine, svdEngineSummary } = await import(
        "./src/shared/svd-engine-config.mjs"
      );
      const svdEngine = normalizeSvdEngine(
        body.svdEngine && typeof body.svdEngine === "object" ? body.svdEngine : {},
      );
      const payload = buildSvdGeneratePayload(svdEngine, {
        initImageBase64: body.initImage || svdEngine.svd_init_image || null,
        preview: !!body.preview,
      });
      res.json({ payload, svdEngine, summary: svdEngineSummary(svdEngine) });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  /** List SVD checkpoints on Forge and XT 1.1 availability. */
  app.get("/api/svd/checkpoints", async (req, res) => {
    if (externalBlocked()) {
      return res.json({ ok: false, skipped: true, reason: "ci_offline", checkpoints: [], xt11_available: false });
    }
    const target = previewForgeTarget(req);
    try {
      if (typeof fetch === "undefined") {
        return res.status(500).json({ error: "fetch not available" });
      }
      const response = await fetch(`${target.url}/svd_api/checkpoints`, {
        headers: { Accept: "application/json" },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return res.status(502).json({ error: "svd checkpoints failed", detail: data });
      }
      res.json({ ok: true, ...data });
    } catch (err) {
      res.status(502).json({ error: String(err.message || err) });
    } finally {
      target.release();
    }
  });

  /** Generate SVD video via Forge /svd_api/generate. */
  app.post("/api/svd/generate", async (req, res) => {
    if (externalBlocked()) {
      return res.json({ ok: false, skipped: true, reason: "ci_offline" });
    }
    const body = req.body || {};
    const target = previewForgeTarget(req);
    try {
      const { buildSvdGeneratePayload, normalizeSvdEngine } = await import(
        "./src/shared/svd-engine-config.mjs"
      );
      const svdEngine = normalizeSvdEngine(
        body.svdEngine && typeof body.svdEngine === "object" ? body.svdEngine : {},
      );
      const payload =
        body.payload && typeof body.payload === "object"
          ? body.payload
          : buildSvdGeneratePayload(svdEngine, {
              initImageBase64: body.initImage || svdEngine.svd_init_image || null,
              preview: !!body.preview,
            });
      if (!payload.init_image) {
        return res.status(400).json({ error: "init_image required for SVD generation" });
      }
      if (typeof fetch === "undefined") {
        return res.status(500).json({ error: "fetch not available" });
      }
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), body.preview ? 120000 : 600000);
      let response;
      try {
        response = await fetch(`${target.url}/svd_api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(t);
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return res.status(502).json({ error: data.error || "svd generate failed", detail: data });
      }
      res.json({ ok: true, ...data, svdEngine });
    } catch (err) {
      console.error("[api] svd generate error", err);
      res.status(502).json({ error: String(err.message || err) });
    } finally {
      target.release();
    }
  });

  /** Live SD-Forge sampling progress + preview image for in-flight preview renders. */
  app.get("/api/forge/progress", async (req, res) => {
    if (externalBlocked()) {
      return res.json({ ok: false, skipped: true, reason: "ci_offline", progressPct: null, previewImage: null });
    }
    const target = previewForgeTarget(req);
    const includeImage = req.query?.includeImage !== "0" && req.query?.skip_current_image !== "true";
    const batchId = String(req.query?.batchId || "").trim();
    const maxFrames = Math.max(1, parseInt(req.query?.maxFrames, 10) || 1);
    try {
      const { computeForgePreviewProgress } = await import("./src/shared/forge-preview-progress.mjs");
      const forgeProgress = await fetchForgeProgressFromTarget(target, { includeImage });
      const batchData = batchId ? await fetchDeforumBatchStatusFromTarget(target, batchId) : null;
      const computed = computeForgePreviewProgress(forgeProgress, batchData, { maxFrames });
      res.json({
        ok: true,
        node: target.node ? { name: target.node.name, id: target.node.id, url: target.node.url } : null,
        forge: forgeProgress,
        batch: batchData,
        ...computed,
      });
    } catch (err) {
      res.status(502).json({ ok: false, error: String(err.message || err), progressPct: null, previewImage: null });
    } finally {
      target.release();
    }
  });

  /** Render a single Deforum frame via Forge /deforum_api/batches (max_frames=1). */
  app.post("/api/deforum/preview", async (req, res) => {
    const body = req.body || {};
    const settings = body.settings && typeof body.settings === "object" ? body.settings : null;
    if (!settings) {
      return res.status(400).json({ error: "settings object required" });
    }
    if (externalBlocked()) {
      return res.json({ ok: false, skipped: true, reason: "ci_offline" });
    }
    const target = previewForgeTarget(req);
    try {
      const result = await renderDeforumPreview(settings, target, body.options_overrides || {});
      if (result && result.skipped) {
        return res.json(result);
      }
      if (result && result.batchId) {
        const meta = await readDeforumJobMeta();
        persistRunJobSnapshot(result.batchId, mergePromptStylesIntoSnapshot({
          kind: "deforum_preview",
          settings,
          options_overrides: body.options_overrides || {},
          node: result.node || null,
        }, body.promptStyles || meta.promptStyles || null));
        const previewStatus = normalizeForgeRunStatus(result.status || "completed");
        await updateRunManifest(result.batchId, {
          status: previewStatus,
          completed_at: new Date().toISOString(),
          preview_path: result.path || null,
        });
      }
      res.json(result);
    } catch (err) {
      if (!externalBlocked()) {
        console.error("[api] deforum preview error", err);
      }
      res.status(502).json({
        error: String(err.message || err),
        status: err.status,
        detail: err.detail,
        batch: err.batch,
        raw: err.raw,
      });
    } finally {
      target.release();
    }
  });

  let warmupBatchId = null;
  let warmupRunning = false;

  /** Kick off a short warmup animation (default 4s @ 12fps = 48 frames).
   *  Responds immediately with the batchId; frames stream to HLS as they render. */
  app.post("/api/deforum/warmup", async (req, res) => {
    if (warmupRunning) {
      return res.json({ ok: true, batchId: warmupBatchId, status: "already_running" });
    }
    if (isCiOffline()) {
      return res.json({ ok: false, status: "ci_offline", error: "External services disabled in CI" });
    }
    const body = req.body || {};
    const maxFrames = Math.max(1, Math.min(480, parseInt(body.maxFrames, 10) || 48));
    const fps = Math.max(1, Math.min(60, parseInt(body.fps, 10) || 12));
    const target = previewForgeTarget(req);
    try {
      let baseSettings = {};
      if (fs.existsSync(deforumSettingsFile)) {
        try { baseSettings = JSON.parse(await fsp.readFile(deforumSettingsFile, "utf-8")); } catch (_e) {}
      }
      const settings = {
        animation_mode: "2D",
        zoom: "0:(1.02)",
        translation_x: "0:(0)",
        translation_y: "0:(0)",
        angle: "0:(0)",
        noise_schedule: "0:(0.02)",
        strength_schedule: "0:(0.65)",
        cfg_scale_schedule: "0:(7)",
        steps_schedule: "0:(20)",
        ...baseSettings,
        max_frames: maxFrames,
        fps,
        skip_video_creation: false,
        motion_preview_mode: false,
      };
      if (!settings.prompts || !Object.keys(settings.prompts).length) {
        settings.prompts = { "0": settings.animation_prompts_positive || "cinematic scene, high quality, detailed" };
      }
      if (typeof fetch === "undefined") {
        return res.status(500).json({ error: "fetch not available" });
      }
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      let response;
      try {
        response = await fetch(`${target.url}/deforum_api/batches`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ deforum_settings: settings }),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(t);
      }
      if (!response.ok) {
        const text = await response.text();
        return res.status(502).json({ error: "warmup batch submit failed", detail: text.slice(0, 300) });
      }
      const data = await response.json();
      warmupBatchId = data.batch_id || null;
      warmupRunning = true;
      if (warmupBatchId) {
        const meta = await readDeforumJobMeta();
        persistRunJobSnapshot(warmupBatchId, mergePromptStylesIntoSnapshot({
          kind: "deforum_warmup",
          maxFrames,
          fps,
          settings,
          node: target.node ? { name: target.node.name, url: target.node.url } : null,
        }, meta.promptStyles || null));
      }
      broadcast({ type: "warmup_started", batchId: warmupBatchId, maxFrames, fps });
      console.log(`[warmup] Started ${maxFrames}-frame batch at ${fps}fps, batchId=${warmupBatchId}`);
      res.json({ ok: true, batchId: warmupBatchId, maxFrames, fps });
      // Clear running flag once Forge reports completion (best-effort background poll)
      if (warmupBatchId) {
        (async () => {
          for (let i = 0; i < 300; i++) {
            await sleep(2000);
            try {
              const pr = await fetch(`${target.url}/deforum_api/batches/${warmupBatchId}`);
              if (!pr.ok) break;
              const pd = await pr.json();
              const st = String(pd.status || pd.state || "").toLowerCase();
              if (["completed", "failed", "cancelled", "canceled", "done"].includes(st)) {
                warmupRunning = false;
                await updateRunManifest(warmupBatchId, {
                  status: normalizeForgeRunStatus(st),
                  completed_at: new Date().toISOString(),
                });
                broadcast({ type: "warmup_done", batchId: warmupBatchId, status: st });
                console.log(`[warmup] Batch ${warmupBatchId} ${st}`);
                break;
              }
            } catch (_e) { break; }
          }
          warmupRunning = false;
        })();
      }
    } catch (err) {
      warmupRunning = false;
      console.error("[api] warmup error", err);
      res.status(502).json({ error: String(err.message || err) });
    } finally {
      target.release();
    }
  });

  app.get("/api/deforum/warmup/status", (_req, res) => {
    res.json({ running: warmupRunning, batchId: warmupBatchId });
  });

  function publicForgeNode(node) {
    if (!node) return null;
    return { id: node.id, name: node.name, url: node.url };
  }

  async function fetchDeforumBatchesFromTarget(target, timeoutMs = 5000) {
    if (typeof fetch === "undefined") {
      throw new Error("fetch not available");
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const response = await fetch(`${target.url}/deforum_api/batches`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
      });
      if (!response.ok) {
        const text = await response.text();
        return {
          ok: false,
          node: publicForgeNode(target.node),
          url: target.url,
          error: `Forge batches unavailable (${response.status})`,
          detail: text.slice(0, 200),
          batches: [],
        };
      }
      const data = await response.json();
      const raw = Array.isArray(data?.batches) ? data.batches : (Array.isArray(data) ? data : []);
      const nodeInfo = publicForgeNode(target.node);
      const batches = raw.map((batch) => ({
        ...batch,
        _node: nodeInfo || { url: target.url },
      }));
      return { ok: true, node: nodeInfo, url: target.url, batches, error: null };
    } catch (err) {
      return {
        ok: false,
        node: publicForgeNode(target.node),
        url: target.url,
        error: err.message,
        batches: [],
      };
    } finally {
      clearTimeout(t);
    }
  }

  async function fetchAllDeforumBatches(preferredNodeId) {
    let targets = writableForgeTargets();
    if (preferredNodeId) {
      const match = targets.filter((target) => target.node && target.node.id === preferredNodeId);
      if (match.length) targets = match;
    }
    const results = await Promise.all(targets.map((target) => fetchDeforumBatchesFromTarget(target)));
    const batches = [];
    const nodes = [];
    const errors = [];
    for (const result of results) {
      if (result.node) nodes.push(result.node);
      else if (result.url) nodes.push({ url: result.url });
      if (result.ok) batches.push(...result.batches);
      else errors.push({ node: result.node, url: result.url, error: result.error, detail: result.detail || null });
    }
    return { batches, nodes, errors, allOk: errors.length === 0 };
  }

  async function cancelDeforumBatchOnTarget(target, batchId) {
    const attempts = [
      { method: "DELETE", url: `${target.url}/deforum_api/batches/${encodeURIComponent(batchId)}` },
      {
        method: "POST",
        url: `${target.url}/deforum_api/batches/${encodeURIComponent(batchId)}/cancel`,
        body: "{}",
      },
    ];
    const errors = [];
    for (const attempt of attempts) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const response = await fetch(attempt.url, {
          method: attempt.method,
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: attempt.body,
          signal: ctrl.signal,
        });
        if (response.ok || response.status === 202 || response.status === 204) {
          let data = null;
          try {
            data = await response.json();
          } catch (_e) {
            data = null;
          }
          return {
            ok: true,
            method: attempt.method,
            status: response.status,
            data,
            node: publicForgeNode(target.node),
            url: target.url,
          };
        }
        const text = await response.text();
        errors.push(`${attempt.method} ${response.status}: ${text.slice(0, 160)}`);
      } catch (err) {
        errors.push(`${attempt.method}: ${err.message}`);
      } finally {
        clearTimeout(t);
      }
    }
    return {
      ok: false,
      node: publicForgeNode(target.node),
      url: target.url,
      error: errors.join("; ") || "cancel failed",
    };
  }

  // List active Deforum batches from all SD-Forge GPUs (best-effort).
  // Used by RUNS browser so you can track queued/running/completed batches.
  app.get("/api/deforum/batches", async (req, res) => {
    try {
      const preferredNodeId = String(req.query?.nodeId || req.query?.preferredNode || "").trim();
      const allNodes = req.query?.all !== "0";
      if (!allNodes && preferredNodeId) {
        const target = forgeTarget(
          { ...req, query: { ...(req.query || {}), preferredNode: preferredNodeId } },
          { allowDirectPreferred: true }
        );
        try {
          const result = await fetchDeforumBatchesFromTarget(target);
          if (!result.ok) {
            return res.status(502).json({ error: result.error, detail: result.detail || null, node: result.node });
          }
          return res.json({ ok: true, node: result.node, nodes: result.node ? [result.node] : [], batches: result.batches, errors: [] });
        } finally {
          target.release();
        }
      }
      const { batches, nodes, errors, allOk } = await fetchAllDeforumBatches(preferredNodeId || null);
      res.json({
        ok: allOk || batches.length > 0,
        nodes,
        batches,
        errors,
      });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // Cancel a queued Deforum batch on a specific GPU node (best-effort).
  app.post("/api/deforum/batches/:batchId/cancel", async (req, res) => {
    const batchId = String(req.params.batchId || "").trim();
    if (!batchId) return res.status(400).json({ error: "batchId required" });
    const nodeId = String(req.query?.nodeId || req.body?.nodeId || "").trim();
    try {
      let targets = writableForgeTargets();
      if (nodeId) {
        targets = targets.filter((target) => target.node && target.node.id === nodeId);
        if (!targets.length) {
          return res.status(404).json({ error: `GPU node not found: ${nodeId}` });
        }
      } else {
        const listed = await fetchAllDeforumBatches();
        const match = listed.batches.find((batch) => {
          const id = batch.batch_id || batch.id || batch.batchId || "";
          return String(id) === batchId;
        });
        if (match && match._node?.id) {
          targets = targets.filter((target) => target.node && target.node.id === match._node.id);
        }
      }
      const results = await Promise.all(targets.map((target) => cancelDeforumBatchOnTarget(target, batchId)));
      const success = results.find((result) => result.ok);
      if (success) {
        return res.json({ ok: true, batchId, ...success });
      }
      return res.status(502).json({
        ok: false,
        batchId,
        error: results.map((result) => result.error).filter(Boolean).join("; ") || "cancel failed",
        attempts: results,
      });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // Shared settings for collaborative features
  const sharedSettingsFile = path.join(__dirname, "shared-settings.json");

  app.get("/api/shared-settings", async (_req, res) => {
    try {
      if (!require('fs').existsSync(sharedSettingsFile)) {
        return res.json({ settings: {} });
      }
      const data = await fsp.readFile(sharedSettingsFile, "utf-8");
      const settings = JSON.parse(data);
      res.json({ settings });
    } catch (err) {
      res.json({ settings: {} });
    }
  });

  app.post("/api/shared-settings", async (req, res) => {
    const { settings, updatedBy } = req.body || {};
    if (!settings) {
      return res.status(400).json({ error: "settings required" });
    }
    try {
      const currentSettings = require('fs').existsSync(sharedSettingsFile)
        ? JSON.parse(await fsp.readFile(sharedSettingsFile, "utf-8"))
        : {};
      
      const newSettings = {
        ...currentSettings,
        ...settings,
        lastUpdatedBy: updatedBy || "anonymous",
        lastUpdatedAt: new Date().toISOString(),
      };
      
      await fsp.writeFile(sharedSettingsFile, JSON.stringify(newSettings, null, 2), "utf-8");
      
      broadcast({
        type: "shared_settings",
        action: "updated",
        updatedBy: newSettings.lastUpdatedBy,
      });
      
      res.json({ ok: true });
    } catch (err) {
      console.error("[api] shared settings save error", err);
      res.status(500).json({ error: "could not save shared settings" });
    }
  });

  // Animation sequencer timelines (JSON on disk)
  app.get("/api/sequencer", async (_req, res) => {
    try {
      const files = await fsp.readdir(sequencersDir);
      const timelines = files
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(/\.json$/, ""));
      res.json({ timelines });
    } catch (err) {
      console.error("[api] sequencer list error", err);
      res.status(500).json({ error: "could not list sequencer timelines" });
    }
  });

  app.get("/api/sequencer/:name", async (req, res) => {
    try {
      const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, "");
      if (!name) return res.status(400).json({ error: "invalid timeline name" });
      const filePath = path.join(sequencersDir, `${name}.json`);
      const data = await fsp.readFile(filePath, "utf-8");
      const timeline = JSON.parse(data);
      res.json({ name, timeline });
    } catch (err) {
      if (err.code === "ENOENT") {
        res.status(404).json({ error: "timeline not found" });
      } else {
        console.error("[api] sequencer load error", err);
        res.status(500).json({ error: "could not load timeline" });
      }
    }
  });

  app.post("/api/sequencer/:name", async (req, res) => {
    try {
      const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, "");
      if (!name) return res.status(400).json({ error: "invalid timeline name" });
      const timeline = req.body;
      const errMsg = validateTimeline(timeline);
      if (errMsg) return res.status(400).json({ error: errMsg });
      const filePath = path.join(sequencersDir, `${name}.json`);
      await fsp.writeFile(filePath, JSON.stringify(timeline, null, 2), "utf-8");
      res.json({ ok: true, name });
    } catch (err) {
      console.error("[api] sequencer save error", err);
      res.status(500).json({ error: "could not save timeline" });
    }
  });

  app.delete("/api/sequencer/:name", async (req, res) => {
    try {
      const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, "");
      if (!name) return res.status(400).json({ error: "invalid timeline name" });
      const filePath = path.join(sequencersDir, `${name}.json`);
      await fsp.unlink(filePath);
      res.json({ ok: true });
    } catch (err) {
      if (err.code === "ENOENT") {
        res.status(404).json({ error: "timeline not found" });
      } else {
        console.error("[api] sequencer delete error", err);
        res.status(500).json({ error: "could not delete timeline" });
      }
    }
  });

  app.get("/api/plugins", async (_req, res) => {
    try {
      const manifestPath = path.join(pluginsDir, "manifest.json");
      const raw = await fsp.readFile(manifestPath, "utf-8");
      const parsed = JSON.parse(raw);
      const plugins = Array.isArray(parsed) ? parsed : parsed.plugins || [];
      res.json({ plugins });
    } catch (err) {
      if (err.code === "ENOENT") {
        return res.json({ plugins: [] });
      }
      console.error("[api] plugins list error", err);
      res.status(500).json({ error: "could not read plugin manifest" });
    }
  });

  app.get("/api/plugins/:type", async (req, res) => {
    const pluginType = req.params.type;
    try {
      const manifestPath = path.join(pluginsDir, "manifest.json");
      const raw = await fsp.readFile(manifestPath, "utf-8");
      const parsed = JSON.parse(raw);
      const allPlugins = Array.isArray(parsed) ? parsed : parsed.plugins || [];
      const filtered = allPlugins.filter(p => p.plugin_type === pluginType);
      res.json({ plugins: filtered, type: pluginType });
    } catch (err) {
      if (err.code === "ENOENT") {
        return res.json({ plugins: [], type: pluginType });
      }
      console.error("[api] plugins filter error", err);
      res.status(500).json({ error: "could not read plugin manifest" });
    }
  });

  app.post("/api/plugins/execute", async (req, res) => {
    const { plugin_name, parameters, input } = req.body || {};
    if (!plugin_name) {
      return res.status(400).json({ error: "plugin_name required" });
    }
    try {
      const manifestPath = path.join(pluginsDir, "manifest.json");
      const raw = await fsp.readFile(manifestPath, "utf-8");
      const parsed = JSON.parse(raw);
      const allPlugins = Array.isArray(parsed) ? parsed : parsed.plugins || [];
      const plugin = allPlugins.find(p => p.name === plugin_name);
      if (!plugin) {
        return res.status(404).json({ error: `Plugin not found: ${plugin_name}` });
      }
      const [modulePath, funcName] = plugin.entry_point.split(':');
      const mod = require(modulePath);
      const fn = mod[funcName];
      if (typeof fn !== 'function') {
        return res.status(500).json({ error: `Plugin entry point is not a function: ${funcName}` });
      }
      const mergedParams = { ...plugin.parameters, ...parameters };
      const result = fn(input, mergedParams);
      res.json({ success: true, plugin: plugin_name, result });
    } catch (err) {
      console.error(`[api] plugin execute error: ${plugin_name}`, err);
      res.status(500).json({ error: `Plugin execution failed: ${err.message}` });
    }
  });

  app.get("/api/plugins/modulators", async (_req, res) => {
    const modulators = [
      { id: "smooth", name: "Smooth", description: "Smooth parameter transitions", parameters: { smoothing: 0.5 } },
      { id: "step", name: "Step", description: "Quantize to discrete steps", parameters: { steps: 8, min: 0, max: 1 } },
      { id: "random", name: "Random", description: "Add controlled variance", parameters: { variance: 0.1 } },
    ];
    res.json({ modulators });
  });

  app.get("/api/plugins/mappings", async (_req, res) => {
    const mappings = [
      { id: "linear", name: "Linear", description: "Linear mapping" },
      { id: "exponential", name: "Exponential", description: "Exponential curve mapping" },
      { id: "logarithmic", name: "Logarithmic", description: "Logarithmic curve mapping" },
      { id: "sigmoid", name: "Sigmoid", description: "S-curve mapping for smooth transitions" },
    ];
    res.json({ mappings });
  });

  app.post("/api/img2img", async (req, res) => {
    const body = req.body || {};
    const init = body.init_image || body.initImage;
    if (!init || typeof init !== "string") {
      return res.status(400).json({ error: "init_image required (data URL or raw base64)" });
    }
    let b64 = init.trim();
    const dataUrl = /^data:image\/[^;]+;base64,(.+)$/i.exec(b64);
    if (dataUrl) b64 = dataUrl[1];

    let maskB64 = null;
    const maskRaw = body.mask_image || body.maskImage;
    if (maskRaw && typeof maskRaw === "string" && maskRaw.trim()) {
      maskB64 = maskRaw.trim();
      const maskDataUrl = /^data:image\/[^;]+;base64,(.+)$/i.exec(maskB64);
      if (maskDataUrl) maskB64 = maskDataUrl[1];
    }

    const target = forgeTarget(req);
    const forgeUrl = target.url;
    const steps = Math.min(100, Math.max(1, parseInt(body.steps, 10) || 28));
    const cfg = Math.min(30, Math.max(1, parseFloat(body.cfg_scale ?? body.cfgScale) || 7));
    const w = Math.min(2048, Math.max(64, parseInt(body.width, 10) || 1024));
    const h = Math.min(2048, Math.max(64, parseInt(body.height, 10) || 1024));
    const denoise = Math.min(1, Math.max(0, parseFloat(body.denoising_strength ?? body.denoisingStrength) || 0.55));
    const sampler = typeof body.sampler_name === "string" && body.sampler_name ? body.sampler_name : "Euler a";
    const seed = body.seed != null ? parseInt(body.seed, 10) : -1;

    const payload = {
      init_images: [b64],
      prompt: String(body.prompt || ""),
      negative_prompt: String(body.negative_prompt || body.negativePrompt || ""),
      steps,
      cfg_scale: cfg,
      width: w,
      height: h,
      denoising_strength: denoise,
      sampler_name: sampler,
      batch_size: 1,
      n_iter: 1,
      seed: Number.isFinite(seed) ? seed : -1,
      resize_mode: 0,
    };

    if (maskB64) {
      const maskBlur = Math.min(64, Math.max(0, parseInt(body.mask_blur ?? body.maskBlur, 10) || 4));
      const inpaintingFill = Math.min(3, Math.max(0, parseInt(body.inpainting_fill ?? body.inpaintingFill, 10) || 1));
      const ifr = body.inpaint_full_res ?? body.inpaintFullRes;
      const inpaintFullRes = !(ifr === false || ifr === "false" || ifr === 0 || ifr === "0");
      const pad = Math.min(256, Math.max(0, parseInt(body.inpaint_full_res_padding ?? body.inpaintFullResPadding, 10) || 32));
      payload.mask = maskB64;
      payload.mask_blur = maskBlur;
      payload.inpainting_fill = inpaintingFill;
      payload.inpaint_full_res = inpaintFullRes;
      payload.inpaint_full_res_padding = pad;
    }

    try {
      if (typeof fetch === "undefined") {
        return res.status(500).json({ error: "fetch not available in this Node build" });
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 600000);
      const response = await fetch(`${forgeUrl}/sdapi/v1/img2img`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) {
        const text = await response.text();
        return res.status(502).json({
          error: "Forge img2img failed",
          status: response.status,
          detail: text.slice(0, 500),
          node: target.node ? { name: target.node.name, url: target.node.url } : null,
        });
      }
      const data = await response.json();
      const images = data.images || [];
      if (!images.length) {
        return res.status(502).json({ error: "Forge returned no images", raw: data });
      }
      const outName = `i2i_${Date.now()}.png`;
      const outPath = path.join(uploadsDir, outName);
      let imgB64 = images[0];
      if (typeof imgB64 === "string" && imgB64.includes(",")) {
        imgB64 = imgB64.split(",", 2)[1];
      }
      const buf = Buffer.from(imgB64, "base64");
      await fsp.writeFile(outPath, buf);
      res.json({
        ok: true,
        path: `/uploads/${outName}`,
        info: data.info || null,
        node: target.node ? { name: target.node.name, url: target.node.url } : null,
      });
    } catch (err) {
      console.error("[api] img2img error", err);
      res.status(502).json({ error: String(err.message || err) });
    } finally {
      target.release();
    }
  });

  /** Single-frame txt2img preview (performance deck / parameter react mode). */
  app.post("/api/txt2img", async (req, res) => {
    const body = req.body || {};
    const target = forgeTarget(req);
    const forgeUrl = target.url;
    const steps = Math.min(100, Math.max(1, parseInt(body.steps, 10) || 12));
    const cfg = Math.min(30, Math.max(1, parseFloat(body.cfg_scale ?? body.cfgScale) || 7));
    const w = Math.min(2048, Math.max(64, parseInt(body.width, 10) || 1024));
    const h = Math.min(2048, Math.max(64, parseInt(body.height, 10) || 576));
    const sampler = typeof body.sampler_name === "string" && body.sampler_name ? body.sampler_name : "Euler a";
    const seed = body.seed != null ? parseInt(body.seed, 10) : -1;

    const payload = {
      prompt: String(body.prompt || body.positive || ""),
      negative_prompt: String(body.negative_prompt || body.negativePrompt || ""),
      steps,
      cfg_scale: cfg,
      width: w,
      height: h,
      sampler_name: sampler,
      batch_size: 1,
      n_iter: 1,
      seed: Number.isFinite(seed) ? seed : -1,
    };
    const fallbackSettings = buildTxt2imgFallbackSettings(body, payload);

    async function respondWithDeforumFallback(reason) {
      if (!fallbackSettings) return false;
      try {
        const result = await renderDeforumPreview(fallbackSettings, previewForgeTarget(req), body.options_overrides || {});
        if (result && result.batchId) {
          persistRunJobSnapshot(result.batchId, {
            kind: "txt2img_fallback",
            settings: fallbackSettings,
            options_overrides: body.options_overrides || {},
            node: result.node || null,
          });
          await updateRunManifest(result.batchId, {
            status: normalizeForgeRunStatus(result.status || "completed"),
            completed_at: new Date().toISOString(),
            preview_path: result.path || null,
          });
        }
        if (target.node) {
          gpuPool.logNodeRequest(target.node.id, {
            type: "generate",
            path: "/api/txt2img fallback",
            durationMs: 0,
            ok: true,
            error: reason || null,
          });
        }
        return res.json({ ...result, fallback: "deforum_preview" });
      } catch (fallbackErr) {
        console.error("[api] txt2img fallback error", fallbackErr);
        return res.status(502).json({
          error: String(fallbackErr.message || fallbackErr),
          status: fallbackErr.status,
          detail: fallbackErr.detail,
          batch: fallbackErr.batch,
          raw: fallbackErr.raw,
          upstream_error: reason || null,
        });
      }
    }

    try {
      if (externalBlocked()) {
        const bypassed = await respondWithDeforumFallback("CI offline");
        if (bypassed !== false) return;
        return res.status(503).json({ ok: false, error: "Forge preview unavailable in CI", ciOffline: true });
      }
      if (shouldBypassTxt2img(target)) {
        const bypassed = await respondWithDeforumFallback("txt2img temporarily bypassed after recent Forge failures");
        if (bypassed !== false) return;
      }
      if (typeof fetch === "undefined") {
        return res.status(500).json({ error: "fetch not available in this Node build" });
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 600000);
      const t0 = Date.now();
      let response;
      try {
        response = await fetch(`${forgeUrl}/sdapi/v1/txt2img`, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      if (target.node) {
        gpuPool.logNodeRequest(target.node.id, { type: "generate", path: "/sdapi/v1/txt2img", statusCode: response.status, durationMs: Date.now() - t0, ok: response.ok });
      }
      if (!response.ok) {
        const text = await response.text();
        recordTxt2imgFailure(target);
        const fallback = await respondWithDeforumFallback(`Forge txt2img failed (${response.status})`);
        if (fallback !== false) return;
        return res.status(502).json({ error: "Forge txt2img failed", status: response.status, detail: text.slice(0, 500) });
      }
      clearTxt2imgFailure(target);
      const data = await response.json();
      const images = data.images || [];
      if (!images.length) {
        return res.status(502).json({ error: "Forge returned no images", raw: data });
      }
      const outName = `preview_${Date.now()}.png`;
      const outPath = path.join(uploadsDir, outName);
      let imgB64 = images[0];
      if (typeof imgB64 === "string" && imgB64.includes(",")) {
        imgB64 = imgB64.split(",", 2)[1];
      }
      const buf = Buffer.from(imgB64, "base64");
      await fsp.writeFile(outPath, buf);
      res.json({
        ok: true,
        path: `/uploads/${outName}`,
        info: data.info || null,
        node: target.node ? { name: target.node.name, url: target.node.url } : null,
      });
    } catch (err) {
      if (!externalBlocked() && !err.ciOffline) {
        console.error("[api] txt2img error", err);
      }
      recordTxt2imgFailure(target);
      const fallback = await respondWithDeforumFallback(String(err.message || err));
      if (fallback !== false) return;
      if (externalBlocked()) {
        return res.status(503).json({ ok: false, error: "Forge preview unavailable in CI", ciOffline: true });
      }
      res.status(502).json({ error: String(err.message || err) });
    } finally {
      target.release();
    }
  });

  // ControlNet models API
  app.get("/api/controlnet/models", async (req, res) => {
    const placeholderModels = [
      { id: "canny", name: "Canny Edge", category: "edge" },
      { id: "depth", name: "Depth Map", category: "depth" },
      { id: "openpose", name: "OpenPose", category: "pose" },
      { id: "scribble", name: "Scribble", category: "line" },
      { id: "tile", name: "Tile/Blur", category: "style" },
      { id: "lineart", name: "Line Art", category: "line" },
      { id: "mlsd", name: "M-LSD Lines", category: "line" },
      { id: "normal", name: "Normal Map", category: "depth" },
      { id: "seg", name: "Segmentation", category: "semantic" },
    ];

    if (externalBlocked()) {
      return res.json({ models: placeholderModels, source: "placeholder", cached: false, ciOffline: true });
    }

    const target = forgeTarget(req);
    const forgeUrl = target.url;
    const fiveMinutes = 5 * 60 * 1000;

    try {
      // Try to fetch ControlNet models from SD-Forge API
      // Use native fetch (Node.js 18+) or fallback gracefully
      if (typeof fetch === 'undefined') {
        throw new Error('fetch not available');
      }
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000); // 2 second timeout
      
      const response = await fetch(`${forgeUrl}/controlnet/model_list`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeout);
      
      if (response.ok) {
        const data = await response.json();
        // SD-Forge returns { model_list: [...] }
        const modelList = data.model_list || data.models || [];
        const models = modelList.map((model, idx) => {
          const name = typeof model === 'string' ? model : (model.name || model.model_name || `Model ${idx + 1}`);
          return {
            id: name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
            name: name,
            category: categorizeControlNetModel(name)
          };
        });
        
        // Update API status
        apiStatus.sdForgeAvailable = true;
        apiStatus.lastChecked = new Date().toISOString();
        apiStatus.controlNetModels = models;
        apiStatus.controlNetModelsFetchedAt = Date.now();
        
        console.log(`[controlnet] Fetched ${models.length} models from SD-Forge`);
        return res.json({ models, source: 'sd-forge', cached: false });
      }
      throw new Error(`Forge controlnet/model_list returned ${response.status}`);
    } catch (err) {
      // API unavailable or timeout — serve short-lived cache, never fake selectable models
      apiStatus.sdForgeAvailable = false;
      apiStatus.lastChecked = new Date().toISOString();
      console.log(`[controlnet] SD-Forge API unavailable, using ${apiStatus.controlNetModels ? 'cached' : 'empty'} models: ${err.message}`);
      
      if (apiStatus.controlNetModels && apiStatus.controlNetModelsFetchedAt) {
        const cacheAge = Date.now() - apiStatus.controlNetModelsFetchedAt;
        if (cacheAge < fiveMinutes) {
          return res.json({
            models: apiStatus.controlNetModels,
            source: 'cache',
            cached: true,
            cacheAge: Math.floor(cacheAge / 1000),
          });
        }
      }
    } finally {
      target.release();
    }

    res.json({ models: [], source: 'unavailable', cached: false, error: 'Forge ControlNet models unavailable' });
  });

  const controlNetModuleFallback = [
    'none', 'canny', 'depth_midas', 'openpose', 'lineart_realistic', 'softedge_hed',
    'mlsd', 'normal_map', 'tile_colorfix', 'ip2p', 'reference_only',
  ];

  app.get("/api/controlnet/modules", async (req, res) => {
    if (externalBlocked()) {
      return res.json({ modules: controlNetModuleFallback, source: "placeholder", ciOffline: true });
    }

    const target = forgeTarget(req);
    const forgeUrl = target.url;

    try {
      if (typeof fetch === 'undefined') {
        throw new Error('fetch not available');
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(`${forgeUrl}/controlnet/module_list`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeout);
      if (response.ok) {
        const data = await response.json();
        const modules = data.module_list || data.modules || [];
        console.log(`[controlnet] Fetched ${modules.length} modules from SD-Forge`);
        return res.json({
          modules,
          moduleDetail: data.module_detail || {},
          source: 'sd-forge',
        });
      }
    } catch (err) {
      console.log(`[controlnet] module_list unavailable: ${err.message}`);
    } finally {
      target.release();
    }

    res.json({ modules: controlNetModuleFallback, source: 'placeholder' });
  });

  // Helper function to categorize ControlNet models
  function categorizeControlNetModel(name) {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('canny') || lowerName.includes('edge')) return 'edge';
    if (lowerName.includes('depth')) return 'depth';
    if (lowerName.includes('pose') || lowerName.includes('openpose')) return 'pose';
    if (lowerName.includes('scribble') || lowerName.includes('pidinet')) return 'line';
    if (lowerName.includes('tile') || lowerName.includes('blur')) return 'style';
    if (lowerName.includes('lineart') || lowerName.includes('mlsd')) return 'line';
    if (lowerName.includes('normal')) return 'depth';
    if (lowerName.includes('seg') || lowerName.includes('semantic')) return 'semantic';
    return 'other';
  }
  
  // ControlNet image upload endpoint (for webcam/screen capture)
  app.post("/api/controlnet/upload-image", async (req, res) => {
    const multer = require('multer');
    const upload = multer({ storage: multer.memoryStorage() });
    
    upload.single('image')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: "Image upload failed" });
      }
      
      if (!req.file) {
        return res.status(400).json({ error: "No image provided" });
      }
      
      const slot = req.body.slot || "CN1";
      const imageBuffer = req.file.buffer;
      
      try {
        const forgeHost = process.env.SD_FORGE_HOST || "192.168.2.101";
        const forgePort = process.env.SD_FORGE_PORT || "7860";
        const forgeUrl = `http://${forgeHost}:${forgePort}`;
        
        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('image', imageBuffer, {
          filename: req.file.originalname,
          contentType: req.file.mimetype,
        });
        formData.append('slot', slot);
        
        const response = await fetch(`${forgeUrl}/controlnet/upload`, {
          method: 'POST',
          body: formData,
          headers: formData.getHeaders(),
        });
        
        if (!response.ok) {
          throw new Error(`SD-Forge responded with ${response.status}`);
        }
        
        const result = await response.json();
        console.log(`[controlnet] Uploaded image for slot ${slot}`);
        res.json({ success: true, result });
      } catch (error) {
        console.error(`[controlnet] Upload failed: ${error.message}`);
        res.status(500).json({ error: "Failed to upload image to SD-Forge" });
      }
    });
  });
  
  // Refresh models endpoint - clears cache and forces re-fetch
  app.post("/api/models/refresh", (_req, res) => {
    apiStatus.controlNetModels = null;
    apiStatus.controlNetModelsFetchedAt = 0;
    apiStatus.loraModels = null;
    apiStatus.loraCacheValidUntil = 0;
    apiStatus.sdModels = null;
    apiStatus.forgeCacheValidUntil = 0;
    apiStatus.currentModel = null;
    apiStatus.lastChecked = null;
    console.log("[api] Model cache cleared, will refetch on next request");
    res.json({ success: true, message: "Model cache cleared" });
  });

  // SD Models (Checkpoints) API endpoints
  app.get("/api/sd-models", async (req, res) => {
    const placeholderModels = [
      {
        title: "SDXL Base",
        model_name: "sdxl_base_1.0.safetensors",
        hash: "placeholder_hash_1",
        sha256: null,
        filename: "sdxl_base_1.0.safetensors",
        config: null,
        metadata: {
          type: "SDXL",
          recommended_steps: 30,
          recommended_sampler: "DPM++ 2M Karras",
          base_resolution: 1024,
        }
      },
      {
        title: "SD 1.5",
        model_name: "v1-5-pruned.safetensors",
        hash: "placeholder_hash_2",
        sha256: null,
        filename: "v1-5-pruned.safetensors",
        config: null,
        metadata: {
          type: "SD 1.5",
          recommended_steps: 24,
          recommended_sampler: "Euler a",
          base_resolution: 512,
        }
      },
    ];

    if (externalBlocked()) {
      return res.json({ models: placeholderModels, source: "placeholder", cached: false, ciOffline: true });
    }

    const target = forgeTarget(req);
    const forgeUrl = target.url;
    try {
      // Try to fetch models from SD-Forge API
      if (typeof fetch === 'undefined') {
        throw new Error('fetch not available');
      }
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(`${forgeUrl}/sdapi/v1/sd-models`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeout);
      
      if (response.ok) {
        const models = await response.json();
        
        // Enrich with metadata if available
        const enrichedModels = models.map(model => ({
          ...model,
          metadata: extractModelMetadata(model)
        }));
        
        // Update API status
        apiStatus.sdForgeAvailable = true;
        apiStatus.lastChecked = new Date().toISOString();
        apiStatus.forgeCacheValidUntil = Date.now() + 5 * 60 * 1000;
        apiStatus.sdModels = enrichedModels;
        
        console.log(`[sd-models] Fetched ${enrichedModels.length} models from SD-Forge`);
        return res.json({ models: enrichedModels, source: 'sd-forge', cached: false });
      }
      throw new Error(`Forge sd-models returned ${response.status}`);
    } catch (err) {
      apiStatus.sdForgeAvailable = false;
      apiStatus.lastChecked = new Date().toISOString();
      console.log(`[sd-models] SD-Forge API unavailable, using ${apiStatus.sdModels ? 'cached' : 'empty'} models: ${err.message}`);
      
      if (apiStatus.sdModels && apiStatus.forgeCacheValidUntil > Date.now()) {
        const cacheAge = Math.floor((apiStatus.forgeCacheValidUntil - Date.now()) / 1000);
        return res.json({ models: apiStatus.sdModels, source: 'cache', cached: true, cacheAge });
      }
      return res.json({ models: [], source: 'unavailable', cached: false, error: 'Forge checkpoints unavailable' });
    } finally {
      target.release();
    }
  });

  async function switchSdModelOnForge(req, modelName) {
    const nextModel = typeof modelName === "string" ? modelName.trim() : "";
    if (!nextModel) {
      throw new Error("model_name is required");
    }
    const existing = gpuPool.findNodeWithModel(nextModel);
    if (existing && gpuPool.modelsMatch(existing.currentModel || existing.model, nextModel)) {
      apiStatus.currentModel = {
        model_name: nextModel,
        title: nextModel,
        metadata: extractModelMetadata({ model_name: nextModel, title: nextModel }),
      };
      console.log(`[sd-models] Model already on ${existing.name}: ${nextModel}`);
      broadcast({
        type: "sd_model",
        action: "switched",
        model: apiStatus.currentModel,
        skipped: true,
        node: { id: existing.id, name: existing.name },
      });
      return {
        success: true,
        skipped: true,
        message: `Already loaded on ${existing.name}`,
        model: apiStatus.currentModel,
        node: { id: existing.id, name: existing.name, url: existing.url },
      };
    }
    const target = gpuPool.selectPreloadNode(nextModel);
    if (!target) {
      throw new Error("No Forge node available to switch model");
    }
    const switchResult = await gpuPool.setForgeModelOnNode(target, nextModel);
    if (!switchResult.ok) {
      throw new Error(switchResult.error || `Failed to switch model on ${target.name}`);
    }
    apiStatus.currentModel = {
      model_name: nextModel,
      title: nextModel,
      metadata: extractModelMetadata({ model_name: nextModel, title: nextModel }),
    };
    console.log(`[sd-models] Switched to model on ${target.name}: ${nextModel}`);
    broadcast({
      type: "sd_model",
      action: "switched",
      model: apiStatus.currentModel,
      node: { id: target.id, name: target.name },
    });
    return {
      success: true,
      message: `Switched to ${nextModel} on ${target.name}`,
      model: apiStatus.currentModel,
      node: { id: target.id, name: target.name, url: target.url },
    };
  }

  // Get current SD model
  app.get("/api/sd-models/current", async (req, res) => {
    if (externalBlocked()) {
      return res.json({
        model: { model_name: "Unknown", title: "Unknown" },
        source: "placeholder",
        ciOffline: true,
      });
    }
    const target = forgeTarget(req, { allowDirectPreferred: true });
    const preferredNode = req?.query?.preferredNode || req?.body?.preferredNode;
    if (preferredNode && !target.node) {
      return res.status(404).json({ error: "Preferred Forge node not found" });
    }
    const forgeUrl = target.url;
    try {
      if (typeof fetch === 'undefined') {
        throw new Error('fetch not available');
      }
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      
      const response = await fetch(`${forgeUrl}/sdapi/v1/options`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeout);
      
      if (response.ok) {
        const options = await response.json();
        const currentModel = {
          model_name: options.sd_model_checkpoint || "Unknown",
          title: options.sd_model_checkpoint || "Unknown",
          metadata: extractModelMetadata({
            model_name: options.sd_model_checkpoint || "Unknown",
            title: options.sd_model_checkpoint || "Unknown",
          }),
        };
        
        apiStatus.currentModel = currentModel;
        console.log(`[sd-models] Current model: ${currentModel.model_name}`);
        return res.json({ model: currentModel, source: 'sd-forge' });
      }
      return res.json({ model: { model_name: "Unknown", title: "Unknown" }, source: 'placeholder' });
    } catch (err) {
      console.log(`[sd-models] Failed to get current model: ${err.message}`);
      
      if (apiStatus.currentModel) {
        return res.json({ model: apiStatus.currentModel, source: 'cache' });
      }
      return res.json({ model: { model_name: "Unknown", title: "Unknown" }, source: 'placeholder' });
    } finally {
      target.release();
    }
  });

  // Switch SD model
  app.post("/api/sd-models/switch", async (req, res) => {
    if (externalBlocked()) {
      return res.json({
        success: true,
        skipped: true,
        message: "External services disabled in CI",
        ciOffline: true,
      });
    }
    const { model_name } = req.body;
    
    if (!model_name) {
      return res.status(400).json({ error: "model_name is required" });
    }
    
    try {
      const result = await switchSdModelOnForge(req, model_name);
      return res.json(result);
    } catch (err) {
      console.log(`[sd-models] Failed to switch model: ${err.message}`);
      return res.status(500).json({ 
        error: "Failed to switch model", 
        message: err.message 
      });
    }
  });

  // Helper function to extract model metadata
  function extractModelMetadata(model) {
    const name = (model.title || model.model_name || "").toLowerCase();
    const metadata = {
      type: "Unknown",
      variant: "standard",
      recommended_steps: 24,
      recommended_sampler: "DPM++ 2M Karras",
      recommended_cfg_scale: 7,
      recommended_strength: 0.7,
      base_resolution: 512,
    };
    
    // Detect model type from name
    if (name.includes("turbo")) {
      metadata.variant = "turbo";
      metadata.recommended_sampler = "Euler a";
      metadata.recommended_cfg_scale = 1.0;
      if (name.includes("sdxl") || name.includes("xl")) {
        metadata.type = "SDXL Turbo";
        metadata.recommended_steps = 2;
        metadata.recommended_strength = 0.4;
        metadata.base_resolution = 1024;
      } else {
        metadata.type = "SD Turbo";
        metadata.recommended_steps = 1;
        metadata.recommended_strength = 0.3;
        metadata.base_resolution = 512;
      }
    } else if (name.includes("lightning")) {
      metadata.variant = "lightning";
      metadata.type = name.includes("sdxl") || name.includes("xl") ? "SDXL Lightning" : "Lightning";
      metadata.recommended_steps = 2;
      metadata.recommended_sampler = "Euler";
      metadata.recommended_cfg_scale = 1.0;
      metadata.recommended_strength = 0.45;
      metadata.base_resolution = name.includes("sdxl") || name.includes("xl") ? 1024 : 512;
    } else if (name.includes('sdxl') || name.includes('xl')) {
      metadata.type = "SDXL";
      metadata.recommended_steps = 30;
      metadata.base_resolution = 1024;
    } else if (name.includes('sd3') || name.includes('stable diffusion 3')) {
      metadata.type = "SD 3";
      metadata.recommended_steps = 28;
      metadata.base_resolution = 1024;
    } else if (name.includes('flux')) {
      metadata.type = "Flux";
      metadata.recommended_steps = 20;
      metadata.base_resolution = 1024;
      metadata.recommended_sampler = "Euler";
      metadata.recommended_cfg_scale = 1.0;
    } else if (name.includes('z-image') || name.includes('zimage')) {
      metadata.type = "Z-Image";
      metadata.recommended_steps = 20;
      metadata.base_resolution = 1024;
      metadata.recommended_sampler = "Euler";
      metadata.recommended_cfg_scale = 1.0;
    } else if (name.includes('1.5') || name.includes('v1-5')) {
      metadata.type = "SD 1.5";
      metadata.recommended_steps = 24;
      metadata.base_resolution = 512;
      metadata.recommended_sampler = "Euler a";
    } else if (name.includes('2.1') || name.includes('v2-1')) {
      metadata.type = "SD 2.1";
      metadata.recommended_steps = 26;
      metadata.base_resolution = 768;
    }
    
    // Copy any existing metadata from model
    if (model.metadata) {
      Object.assign(metadata, model.metadata);
    }
    
    return metadata;
  }

  // LoRA API endpoints
  app.get("/api/loras", async (req, res) => {
    const target = forgeTarget(req);
    const forgeUrl = target.url;
    const placeholderLoras = [
      {
        id: "lora_sdxl_lightning_1",
        name: "SDXL Lightning",
        path: "sdxl_lightning.safetensors",
        thumbnail: null,
        strength: 1.0,
      },
      {
        id: "lora_detail_tweaker_1",
        name: "Detail Tweaker",
        path: "detail_tweaker_v1.safetensors",
        thumbnail: null,
        strength: 0.8,
      },
      {
        id: "lora_style_anime_1",
        name: "Anime Style",
        path: "anime_style_xl.safetensors",
        thumbnail: null,
        strength: 1.0,
      },
      {
        id: "lora_photorealism_1",
        name: "Photorealism Enhancer",
        path: "photorealism_v2.safetensors",
        thumbnail: null,
        strength: 0.7,
      },
      {
        id: "lora_cyberpunk_1",
        name: "Cyberpunk Style",
        path: "cyberpunk_neon.safetensors",
        thumbnail: null,
        strength: 1.0,
      },
      {
        id: "lora_watercolor_1",
        name: "Watercolor Art",
        path: "watercolor_painting.safetensors",
        thumbnail: null,
        strength: 0.9,
      },
    ];

    if (externalBlocked()) {
      return res.json({ loras: placeholderLoras, source: "placeholder", cached: false, ciOffline: true });
    }

    try {
    if (apiStatus.loraModels && apiStatus.loraCacheValidUntil > Date.now()) {
      const cacheAge = Math.floor((apiStatus.loraCacheValidUntil - Date.now()) / 1000);
      return res.json({ loras: apiStatus.loraModels, source: 'cache', cached: true, cacheAge });
    }
    
    try {
      // Try to fetch LoRAs from SD-Forge API
      if (typeof fetch === 'undefined') {
        throw new Error('fetch not available');
      }
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000); // 2 second timeout
      
      const response = await fetch(`${forgeUrl}/sdapi/v1/loras`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeout);
      
      if (response.ok) {
        const loras = await response.json();
        // SD-Forge returns an array of lora objects
        const loraList = Array.isArray(loras) ? loras : [];
        const formattedLoras = loraList.map((lora, idx) => {
          const name = lora.name || lora.alias || `LoRA ${idx + 1}`;
          const path = lora.path || lora.filename || name;
          return {
            id: `lora_${idx}_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
            name: name,
            path: path,
            thumbnail: lora.preview || lora.thumbnail || null,
            strength: 1.0,
          };
        });
        apiStatus.loraModels = formattedLoras;
        apiStatus.loraCacheValidUntil = Date.now() + 5 * 60 * 1000;
        console.log(`[loras] Fetched ${formattedLoras.length} LoRAs from SD-Forge`);
        return res.json({ loras: formattedLoras, source: 'sd-forge' });
      }
      throw new Error(`Forge loras returned ${response.status}`);
    } catch (err) {
      // API unavailable or timeout — serve cache only, never fake selectable LoRAs
      console.log(`[loras] SD-Forge API unavailable, using ${apiStatus.loraModels ? 'cached' : 'empty'} LoRAs: ${err.message}`);
      if (apiStatus.loraModels) {
        return res.json({ loras: apiStatus.loraModels, source: 'cache', cached: true });
      }
    }
    
    res.json({ loras: [], source: 'unavailable', error: 'Forge LoRAs unavailable' });
    } finally {
      target.release();
    }
  });

  // Forge Settings API

  app.get("/api/forge/options", async (req, res) => {
    const target = forgeTarget(req, { allowDirectPreferred: true });
    const preferredNode = req?.query?.preferredNode || req?.body?.preferredNode;
    if (preferredNode && !target.node) {
      return res.status(404).json({ options: {}, available: false, error: "Preferred Forge node not found" });
    }
    const forgeUrl = target.url;
    try {
      if (typeof fetch === 'undefined') throw new Error('fetch not available');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${forgeUrl}/sdapi/v1/options`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const options = await response.json();
      apiStatus.sdForgeAvailable = true;
      return res.json({ options, available: true });
    } catch (err) {
      apiStatus.sdForgeAvailable = false;
      return res.json({ options: {}, available: false, error: err.message });
    } finally {
      target.release();
    }
  });

  app.post("/api/forge/options", async (req, res) => {
    const updates = req.body;
    const preferredNode = req?.query?.preferredNode || req?.body?.preferredNode;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: "Invalid options" });
    }
    if (preferredNode) delete updates.preferredNode;
    try {
      if (preferredNode) {
        const target = forgeTarget({ ...req, query: { ...(req.query || {}), preferredNode } }, { allowDirectPreferred: true });
        if (!target.node) {
          return res.status(404).json({ error: "Preferred Forge node not found" });
        }
        const sync = await postForgeOptionsToTarget(target, updates, 10000);
        return res.json({ success: true, partial: false, sync });
      }
      const sync = await applyForgeOptionsAcrossTargets(updates, 10000);
      return res.json({ success: true, partial: sync.partial, sync });
    } catch (err) {
      return res.status(502).json({ error: "Failed to update options", message: err.message });
    }
  });

  app.get("/api/forge/samplers", async (req, res) => {
    const target = forgeTarget(req, { allowDirectPreferred: true });
    const preferredNode = req?.query?.preferredNode || req?.body?.preferredNode;
    if (preferredNode && !target.node) {
      return res.status(404).json({ samplers: [], error: "Preferred Forge node not found" });
    }
    const forgeUrl = target.url;
    try {
      if (typeof fetch === 'undefined') throw new Error('fetch not available');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${forgeUrl}/sdapi/v1/samplers`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const samplers = await response.json();
      return res.json({ samplers });
    } catch (err) {
      return res.json({ samplers: [], error: err.message });
    } finally {
      target.release();
    }
  });

  app.get("/api/forge/schedulers", async (req, res) => {
    const target = forgeTarget(req, { allowDirectPreferred: true });
    const preferredNode = req?.query?.preferredNode || req?.body?.preferredNode;
    if (preferredNode && !target.node) {
      return res.status(404).json({ schedulers: [], error: "Preferred Forge node not found" });
    }
    const forgeUrl = target.url;
    try {
      if (typeof fetch === 'undefined') throw new Error('fetch not available');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${forgeUrl}/sdapi/v1/schedulers`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const schedulers = await response.json();
      return res.json({ schedulers });
    } catch (err) {
      return res.json({ schedulers: [], error: err.message });
    } finally {
      target.release();
    }
  });

  app.get("/api/forge/vae", async (req, res) => {
    const target = forgeTarget(req, { allowDirectPreferred: true });
    const preferredNode = req?.query?.preferredNode || req?.body?.preferredNode;
    if (preferredNode && !target.node) {
      return res.status(404).json({ vae: [], error: "Preferred Forge node not found" });
    }
    const forgeUrl = target.url;
    try {
      if (typeof fetch === 'undefined') throw new Error('fetch not available');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${forgeUrl}/sdapi/v1/vae`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const vaeList = await response.json();
      return res.json({ vae: vaeList });
    } catch (err) {
      return res.json({ vae: [], error: err.message });
    } finally {
      target.release();
    }
  });

  // Advanced Prompt System API endpoints
  
  // In-memory storage for prompt templates and libraries
  const promptLibrary = {
    templates: [
      {
        id: "cinematic_1",
        name: "Cinematic Shot",
        prompt: "cinematic shot of {subject}, {lighting}, professional color grading, film grain, shallow depth of field",
        negativePrompt: "amateur, snapshot, blurry, low quality",
        category: "photography",
        variables: ["subject", "lighting"],
        tags: ["cinematic", "professional", "photography"]
      },
      {
        id: "anime_1",
        name: "Anime Character",
        prompt: "{character_type} anime character, {art_style}, vibrant colors, detailed eyes",
        negativePrompt: "realistic, 3d, photograph, western cartoon",
        category: "anime",
        variables: ["character_type", "art_style"],
        tags: ["anime", "character", "illustration"]
      },
      {
        id: "landscape_1",
        name: "Epic Landscape",
        prompt: "{time_of_day} landscape, {terrain_type}, dramatic lighting, {weather}, cinematic composition",
        negativePrompt: "indoors, people, buildings, urban",
        category: "landscape",
        variables: ["time_of_day", "terrain_type", "weather"],
        tags: ["landscape", "nature", "scenic"]
      }
    ],
    wildcards: {
      "subject": ["person", "cat", "dog", "robot", "fantasy creature", "alien"],
      "lighting": ["golden hour", "studio lighting", "neon lights", "candlelight", "moonlight"],
      "character_type": ["warrior", "mage", "schoolgirl", "ninja", "princess"],
      "art_style": ["cel-shaded", "watercolor", "sketch", "digital art", "retro anime"],
      "time_of_day": ["sunrise", "sunset", "golden hour", "blue hour", "midday"],
      "terrain_type": ["mountains", "desert", "forest", "ocean", "snowy peaks"],
      "weather": ["clear sky", "dramatic clouds", "fog", "storm", "aurora"]
    },
    negativePresets: [
      {
        id: "quality_basic",
        name: "Basic Quality",
        prompt: "low quality, blurry, low resolution, pixelated"
      },
      {
        id: "quality_strict",
        name: "Strict Quality",
        prompt: "low quality, blurry, low resolution, pixelated, jpeg artifacts, watermark, signature, text, amateur"
      },
      {
        id: "anatomy_fix",
        name: "Anatomy Fixer",
        prompt: "bad anatomy, extra limbs, missing limbs, deformed hands, extra fingers, missing fingers"
      },
      {
        id: "realistic_avoid",
        name: "Avoid Realism",
        prompt: "photorealistic, photo, realistic, 3d render"
      }
    ]
  };

  // Get all prompt templates
  app.get("/api/prompts/templates", (_req, res) => {
    res.json({ 
      templates: promptLibrary.templates,
      count: promptLibrary.templates.length
    });
  });

  // Get single template by ID
  app.get("/api/prompts/templates/:id", (req, res) => {
    const template = promptLibrary.templates.find(t => t.id === req.params.id);
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    res.json({ template });
  });

  // Search templates by category or tags
  app.get("/api/prompts/templates/search", (req, res) => {
    const { category, tag, query } = req.query;
    let filtered = promptLibrary.templates;
    
    if (category) {
      filtered = filtered.filter(t => t.category === category);
    }
    if (tag) {
      filtered = filtered.filter(t => t.tags && t.tags.includes(tag));
    }
    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(t => 
        t.name.toLowerCase().includes(q) || 
        t.prompt.toLowerCase().includes(q)
      );
    }
    
    res.json({ templates: filtered, count: filtered.length });
  });

  // Add new template
  app.post("/api/prompts/templates", (req, res) => {
    const { name, prompt, negativePrompt, category, variables, tags } = req.body;
    
    if (!name || !prompt) {
      return res.status(400).json({ error: "name and prompt are required" });
    }
    
    const newTemplate = {
      id: `custom_${Date.now()}`,
      name,
      prompt,
      negativePrompt: negativePrompt || "",
      category: category || "custom",
      variables: variables || [],
      tags: tags || []
    };
    
    promptLibrary.templates.push(newTemplate);
    res.json({ template: newTemplate, message: "Template created successfully" });
  });

  // Get all wildcards
  app.get("/api/prompts/wildcards", (_req, res) => {
    res.json({ 
      wildcards: promptLibrary.wildcards,
      categories: Object.keys(promptLibrary.wildcards)
    });
  });

  // Get specific wildcard options
  app.get("/api/prompts/wildcards/:category", (req, res) => {
    const options = promptLibrary.wildcards[req.params.category];
    if (!options) {
      return res.status(404).json({ error: "Wildcard category not found" });
    }
    res.json({ category: req.params.category, options });
  });

  // Process template with variables and wildcards
  app.post("/api/prompts/process", (req, res) => {
    const { templateId, variables, useWildcards } = req.body;
    
    const template = promptLibrary.templates.find(t => t.id === templateId);
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    
    let processed = template.prompt;
    
    // Replace variables
    if (variables) {
      Object.keys(variables).forEach(key => {
        const regex = new RegExp(`\\{${key}\\}`, 'g');
        processed = processed.replace(regex, variables[key]);
      });
    }
    
    // Replace wildcards with random selections
    if (useWildcards) {
      Object.keys(promptLibrary.wildcards).forEach(category => {
        const regex = new RegExp(`\\{${category}\\}`, 'g');
        if (processed.match(regex)) {
          const options = promptLibrary.wildcards[category];
          const randomOption = options[Math.floor(Math.random() * options.length)];
          processed = processed.replace(regex, randomOption);
        }
      });
    }
    
    res.json({
      original: template.prompt,
      processed,
      negativePrompt: template.negativePrompt,
      usedTemplate: template.name
    });
  });

  // Get all negative prompt presets
  app.get("/api/prompts/negative-presets", (_req, res) => {
    res.json({ 
      presets: promptLibrary.negativePresets,
      count: promptLibrary.negativePresets.length
    });
  });

  // Combine multiple negative presets
  app.post("/api/prompts/negative-presets/combine", (req, res) => {
    const { presetIds } = req.body;
    
    if (!Array.isArray(presetIds) || presetIds.length === 0) {
      return res.status(400).json({ error: "presetIds array is required" });
    }
    
    const presets = promptLibrary.negativePresets.filter(p => presetIds.includes(p.id));
    if (presets.length === 0) {
      return res.status(404).json({ error: "No matching presets found" });
    }
    
    const combined = presets.map(p => p.prompt).join(", ");
    
    res.json({
      combined,
      usedPresets: presets.map(p => p.name),
      count: presets.length
    });
  });

  // Performance Optimization APIs
  
  // WebSocket message batching configuration
  const wsMessageBatcher = {
    enabled: true,
    batchInterval: 50, // milliseconds
    maxBatchSize: 10,
    pendingMessages: [],
    timer: null
  };

  // HLS segment cache
  const hlsCache = {
    enabled: true,
    maxAge: 30000, // 30 seconds
    segments: new Map(), // segment name -> {data, timestamp}
    maxSize: 50 // max cached segments
  };

  // Batch generation queue
  const batchQueue = {
    enabled: true,
    maxBatchSize: 4,
    pending: [],
    processing: false
  };

  // Get performance settings
  app.get("/api/performance/settings", (_req, res) => {
    res.json({
      websocket: {
        batching: wsMessageBatcher.enabled,
        batchInterval: wsMessageBatcher.batchInterval,
        maxBatchSize: wsMessageBatcher.maxBatchSize
      },
      hls: {
        caching: hlsCache.enabled,
        maxAge: hlsCache.maxAge,
        maxSize: hlsCache.maxSize,
        currentSize: hlsCache.segments.size
      },
      batchGeneration: {
        enabled: batchQueue.enabled,
        maxBatchSize: batchQueue.maxBatchSize,
        pendingCount: batchQueue.pending.length
      }
    });
  });

  // Update performance settings
  app.post("/api/performance/settings", (req, res) => {
    const { websocket, hls, batchGeneration } = req.body;
    
    if (websocket) {
      if (typeof websocket.batching === 'boolean') {
        wsMessageBatcher.enabled = websocket.batching;
      }
      if (typeof websocket.batchInterval === 'number' && websocket.batchInterval >= 10) {
        wsMessageBatcher.batchInterval = websocket.batchInterval;
      }
      if (typeof websocket.maxBatchSize === 'number' && websocket.maxBatchSize > 0) {
        wsMessageBatcher.maxBatchSize = websocket.maxBatchSize;
      }
    }
    
    if (hls) {
      if (typeof hls.caching === 'boolean') {
        hlsCache.enabled = hls.caching;
      }
      if (typeof hls.maxAge === 'number' && hls.maxAge > 0) {
        hlsCache.maxAge = hls.maxAge;
      }
      if (typeof hls.maxSize === 'number' && hls.maxSize > 0) {
        hlsCache.maxSize = hls.maxSize;
      }
    }
    
    if (batchGeneration) {
      if (typeof batchGeneration.enabled === 'boolean') {
        batchQueue.enabled = batchGeneration.enabled;
      }
      if (typeof batchGeneration.maxBatchSize === 'number' && batchGeneration.maxBatchSize > 0) {
        batchQueue.maxBatchSize = batchGeneration.maxBatchSize;
      }
    }
    
    res.json({ success: true, message: "Performance settings updated" });
  });

  // Clear HLS cache
  app.post("/api/performance/hls/clear-cache", (_req, res) => {
    const clearedCount = hlsCache.segments.size;
    hlsCache.segments.clear();
    console.log(`[hls-cache] Cleared ${clearedCount} cached segments`);
    res.json({ success: true, clearedCount });
  });

  // Get HLS cache stats
  app.get("/api/performance/hls/cache-stats", (_req, res) => {
    const now = Date.now();
    let validCount = 0;
    let expiredCount = 0;
    
    hlsCache.segments.forEach((entry) => {
      if (now - entry.timestamp < hlsCache.maxAge) {
        validCount++;
      } else {
        expiredCount++;
      }
    });
    
    res.json({
      total: hlsCache.segments.size,
      valid: validCount,
      expired: expiredCount,
      maxSize: hlsCache.maxSize,
      maxAge: hlsCache.maxAge
    });
  });

  // Batch generation API
  app.post("/api/performance/batch-generate", async (req, res) => {
    const { requests } = req.body;
    
    if (!Array.isArray(requests) || requests.length === 0) {
      return res.status(400).json({ error: "requests array is required" });
    }
    
    if (requests.length > batchQueue.maxBatchSize) {
      return res.status(400).json({ 
        error: `Batch size ${requests.length} exceeds maximum ${batchQueue.maxBatchSize}` 
      });
    }
    
    if (!batchQueue.enabled) {
      return res.status(503).json({ error: "Batch generation is disabled" });
    }
    
    // Add to queue
    const batchId = `batch_${Date.now()}`;
    const batch = {
      id: batchId,
      requests,
      status: 'queued',
      queuedAt: new Date().toISOString()
    };
    
    batchQueue.pending.push(batch);
    
    console.log(`[batch] Queued batch ${batchId} with ${requests.length} requests`);
    
    res.json({
      batchId,
      status: 'queued',
      requestCount: requests.length,
      position: batchQueue.pending.length
    });
  });

  // Get batch generation status
  app.get("/api/performance/batch-generate/:batchId", (req, res) => {
    const batch = batchQueue.pending.find(b => b.id === req.params.batchId);
    
    if (!batch) {
      return res.status(404).json({ error: "Batch not found" });
    }
    
    res.json({
      batchId: batch.id,
      status: batch.status,
      requestCount: batch.requests.length,
      queuedAt: batch.queuedAt,
      processedAt: batch.processedAt,
      completedAt: batch.completedAt
    });
  });

  // Get performance metrics
  app.get("/api/performance/metrics", (_req, res) => {
    const metrics = {
      websocket: {
        pendingMessages: wsMessageBatcher.pendingMessages.length,
        batchingEnabled: wsMessageBatcher.enabled
      },
      hls: {
        cachedSegments: hlsCache.segments.size,
        cachingEnabled: hlsCache.enabled
      },
      batchQueue: {
        pendingBatches: batchQueue.pending.length,
        enabled: batchQueue.enabled
      },
      timestamp: new Date().toISOString()
    };
    
    res.json(metrics);
  });

  gpuPool.attachRoutes(app);
  infrastructure.attachRoutes(app);

  // Runs browser API
  
  function loadRunManifest(runPath) {
    const manifestPath = path.join(runPath, "run.json");
    if (!fs.existsSync(manifestPath)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      return { ...data, run_id: path.basename(runPath), manifest_path: manifestPath };
    } catch {
      return null;
    }
  }

  async function manifestFromJobFile(runPath, name) {
    const jobPath = path.join(runPath, "defora-job.json");
    try {
      const raw = await fsp.readFile(jobPath, "utf-8");
      const job = JSON.parse(raw);
      const snap = job.snapshot || {};
      const meta = extractRunMetaFromSnapshot(snap);
      return {
        run_id: name,
        status: "queued",
        started_at: job.captured_at || new Date().toISOString(),
        ...meta,
        job,
        manifest_path: path.join(runPath, "run.json"),
        _fromJob: true,
      };
    } catch {
      return null;
    }
  }

  function parseRunFrameIndex(name) {
    const m = /^frame_(\d+)\.png$/i.exec(String(name || ""));
    return m ? parseInt(m[1], 10) : NaN;
  }

  function listRunFrameFiles(runPath) {
    try {
      if (!fs.existsSync(runPath)) return [];
      return fs
        .readdirSync(runPath)
        .filter((entry) => /^frame_\d+\.png$/i.test(entry))
        .sort((a, b) => {
          const ai = parseRunFrameIndex(a);
          const bi = parseRunFrameIndex(b);
          if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;
          return String(a).localeCompare(String(b));
        });
    } catch {
      return [];
    }
  }

  function resolveRunFramesTotal(manifest) {
    const snap = manifest?.job?.snapshot || manifest?.snapshot || {};
    const settings = snap.settings || {};
    for (const value of [
      manifest.frames_total,
      manifest.frame_count,
      manifest.length_frames,
      manifest.max_frames,
      settings.max_frames,
      snap.maxFrames,
    ]) {
      const n = parseInt(value, 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  }

  function computeRunFrameProgress(manifest, runPath) {
    const frameFiles = listRunFrameFiles(runPath);
    const framesDone = frameFiles.length;
    const latestFrame = framesDone ? frameFiles[frameFiles.length - 1] : null;
    let framesTotal = resolveRunFramesTotal(manifest);
    if (!framesTotal && latestFrame) {
      const idx = parseRunFrameIndex(latestFrame);
      if (Number.isFinite(idx) && idx > 0) framesTotal = idx;
    }
    let framesProgressPct = null;
    if (framesTotal && framesTotal > 0) {
      framesProgressPct = Math.min(100, Math.round((framesDone / framesTotal) * 100));
    } else if (framesDone > 0 && String(manifest.status || "").toLowerCase() === "completed") {
      framesTotal = framesDone;
      framesProgressPct = 100;
    }
    return {
      frameFiles,
      framesDone,
      framesTotal,
      latestFrame,
      framesProgressPct,
    };
  }

  async function enrichRunManifest(manifest, runPath) {
    const thumbPath = path.join(runPath, "thumb.png");
    let hasThumbFile = false;
    try {
      await fsp.access(thumbPath);
      hasThumbFile = true;
    } catch { /* no thumb */ }

    const progress = computeRunFrameProgress(manifest, runPath);
    manifest.frames_done = progress.framesDone;
    manifest.frames_total = progress.framesTotal;
    manifest.frames_progress_pct = progress.framesProgressPct;
    manifest.latest_frame = progress.latestFrame;
    manifest.has_thumbnail = !!(progress.latestFrame || hasThumbFile);
    manifest.thumb_rev = progress.latestFrame || (hasThumbFile ? "thumb.png" : null);

    if (manifest.last_frame) {
      try {
        await fsp.access(manifest.last_frame);
        manifest.last_frame_exists = true;
      } catch { /* missing */ }
    }
    return manifest;
  }

  async function listRuns() {
    try {
      await fsp.access(runsDir);
    } catch {
      return [];
    }
    const entries = await fsp.readdir(runsDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const runs = await Promise.all(
      dirs.map(async (name) => {
        const runPath = path.join(runsDir, name);
        const manifestPath = path.join(runPath, "run.json");
        try {
          const raw = await fsp.readFile(manifestPath, "utf-8");
          const data = JSON.parse(raw);
          const manifest = { ...data, run_id: name, manifest_path: manifestPath };
          return enrichRunManifest(manifest, runPath);
        } catch {
          const fromJob = await manifestFromJobFile(runPath, name);
          if (!fromJob) return null;
          return enrichRunManifest(fromJob, runPath);
        }
      })
    );
    return runs.filter(Boolean).sort((a, b) => (b.started_at || "").localeCompare(a.started_at || ""));
  }

  // Collaborative features API
  app.get("/api/collab/users", (_req, res) => {
    const users = Array.from(connectedUsers.values()).map(u => ({
      id: u.id,
      name: u.name,
      connectedAt: u.connectedAt,
    }));
    res.json({ users, count: users.length });
  });

  app.get("/api/collab/locks", (_req, res) => {
    const locks = {};
    for (const [param, lock] of parameterLocks.entries()) {
      locks[param] = { userId: lock.userId, userName: lock.userName };
    }
    res.json({ locks });
  });

  app.get("/api/collab/recordings", (_req, res) => {
    const recordingsPath = path.join(__dirname, "recordings");
    try {
      if (!require('fs').existsSync(recordingsPath)) {
        return res.json({ recordings: [] });
      }
      const files = require('fs').readdirSync(recordingsPath)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const stat = require('fs').statSync(path.join(recordingsPath, f));
          return {
            filename: f,
            size: stat.size,
            createdAt: stat.mtime.toISOString(),
          };
        });
      res.json({ recordings: files });
    } catch (err) {
      res.json({ recordings: [] });
    }
  });

  app.post("/api/collab/recordings/:filename/play", async (req, res) => {
    const { filename } = req.params;
    const recordingsPath = path.join(__dirname, "recordings");
    const filepath = path.join(recordingsPath, filename);
    try {
      const recording = JSON.parse(require('fs').readFileSync(filepath, 'utf-8'));
      broadcast({ type: "playback", status: "started", events: recording.events.length });
      for (const event of recording.events) {
        setTimeout(() => {
          if (event.type === "control") {
            broadcast({ type: "event", msg: "playback", payload: event.payload });
          }
        }, event.timestamp);
      }
      res.json({ success: true, events: recording.events.length });
    } catch (err) {
      res.status(404).json({ error: "Recording not found" });
    }
  });

  app.delete("/api/collab/recordings/:filename", async (req, res) => {
    const { filename } = req.params;
    const recordingsPath = path.join(__dirname, "recordings");
    const filepath = path.join(recordingsPath, filename);
    try {
      require('fs').unlinkSync(filepath);
      res.json({ success: true });
    } catch (err) {
      res.status(404).json({ error: "Recording not found" });
    }
  });

  // AI Assistant API endpoints (stdin JSON bridge — audit A-11)
  app.post("/api/ai/prompt-suggestions", async (req, res) => {
    const { current_prompt, category, limit } = req.body || {};
    if (!current_prompt) return res.status(400).json({ error: "current_prompt required" });
    try {
      const suggestions = await invokeAi("prompt_suggestions", { current_prompt, category, limit });
      res.json({ suggestions: suggestions || [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/ai/improve-prompt", async (req, res) => {
    const { current_prompt, style } = req.body || {};
    if (!current_prompt) return res.status(400).json({ error: "current_prompt required" });
    try {
      const improved = await invokeAi("improve_prompt", { current_prompt, style });
      res.json({ improved_prompt: typeof improved === "string" ? improved : String(improved || "") });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/ai/parameter-recommendations", async (req, res) => {
    const { current_params, style } = req.body || {};
    if (!current_params) return res.status(400).json({ error: "current_params required" });
    try {
      const recommendations = await invokeAi("parameter_recommendations", { current_params, style });
      res.json({ recommendations: recommendations || [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/ai/auto-tune", async (req, res) => {
    const { current_params, feedback_score } = req.body || {};
    if (!current_params || feedback_score === undefined) {
      return res.status(400).json({ error: "current_params and feedback_score required" });
    }
    try {
      const tuned_params = await invokeAi("auto_tune", { current_params, feedback_score });
      res.json({ tuned_params: tuned_params || current_params });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/ai/style-recommendations", async (req, res) => {
    const { current_prompt, limit } = req.body || {};
    if (!current_prompt) return res.status(400).json({ error: "current_prompt required" });
    try {
      const styles = await invokeAi("style_recommendations", { current_prompt, limit });
      res.json({ styles: styles || [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/ai/apply-style", async (req, res) => {
    const { current_prompt, current_negative, style_name } = req.body || {};
    if (!current_prompt || !style_name) {
      return res.status(400).json({ error: "current_prompt and style_name required" });
    }
    try {
      const result = await invokeAi("apply_style", { current_prompt, current_negative, style_name });
      res.json(result || { prompt: current_prompt, negative_prompt: current_negative });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/ai/analyze-frame", async (req, res) => {
    const { frame_data } = req.body || {};
    if (!frame_data) return res.status(400).json({ error: "frame_data required" });
    try {
      const result = await invokeAi("analyze_frame", { frame_data });
      res.json(result || { anomalies: [], is_ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/ai/anomaly-summary", async (_req, res) => {
    try {
      const summary = await invokeAi("anomaly_summary", {});
      res.json(summary || { total_frames: 0, anomalous_frames: 0, anomaly_rate: 0 });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/story/generate", async (req, res) => {
    try {
      const story = await generateStoryWithOllama(req.body || {});
      res.json(story);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  app.get("/api/runs/job-log", async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 80));
      const entries = await runsJobLogStore.read(limit);
      res.json({ entries, count: entries.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/runs/job-log", async (req, res) => {
    const body = req.body || {};
    try {
      let saved = null;
      if (body.kind === "story_llm_request" && body.clientRequest) {
        const model = body.ollamaRequest?.model || body.model || "";
        const log = await persistStoryLlmRequestLog(body.clientRequest, model);
        const recent = await runsJobLogStore.read(20);
        saved = recent.find((row) => row.id === log.logId)
          || storyLlm.storyLlmRequestLogEntry(log.clientRequest, log.ollamaRequest, { id: log.logId });
      } else {
        saved = await runsJobLogStore.append(body);
        if (saved) broadcast({ type: "runs_job_log", entry: saved });
      }
      res.json({ ok: true, entry: saved, llmLog: saved?.kind === "story_llm_request"
        ? { clientRequest: saved.clientRequest, ollamaRequest: saved.ollamaRequest, logId: saved.id }
        : null });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/runs/job-log", async (_req, res) => {
    try {
      await runsJobLogStore.clear();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Local LLM API endpoints
  let llmState = {
    type: process.env.LLM_TYPE || "ollama",
    serverUrl: process.env.OLLAMA_BASE_URL || "http://192.168.2.104:11434",
    loadedModel: process.env.OLLAMA_MODEL || null,
    running: false,
    childProcess: null,
    params: {
      maxTokens: 2048,
      temperature: 0.7,
      topP: 0.9,
      contextLength: 4096,
      gpuLayers: 35,
      threads: 8,
    },
  };

  app.get("/api/llm/status", async (_req, res) => {
    res.json({
      status: {
        connected: llmState.running,
        message: llmState.running ? "Running" : "Stopped",
      },
      loadedModel: llmState.loadedModel || "",
      memory: { used: 0, total: 0, percent: 0 },
    });
  });

  app.post("/api/llm/start", async (req, res) => {
    const { type, url } = req.body || {};
    if (llmState.running) {
      return res.json({ success: false, message: "LLM already running" });
    }
    llmState.type = type || llmState.type;
    llmState.serverUrl = url || llmState.serverUrl;
    res.json({ success: true, message: `LLM server start requested (${llmState.type})` });
  });

  app.post("/api/llm/stop", async (_req, res) => {
    if (!llmState.running) {
      return res.json({ success: false, message: "LLM not running" });
    }
    if (llmState.childProcess) {
      llmState.childProcess.kill();
      llmState.childProcess = null;
    }
    llmState.running = false;
    res.json({ success: true, message: "LLM server stopped" });
  });

  app.get("/api/llm/models", async (_req, res) => {
    try {
      if (llmState.type === "ollama") {
        const target = `${String(llmState.serverUrl || "").replace(/\/+$/, "")}/api/tags`;
        const response = await fetch(target, { method: "GET", signal: AbortSignal.timeout(5000) });
        const payload = await response.json();
        const models = (payload.models || []).map((model) => ({
          name: model.name,
          size: model.size != null ? `${(model.size / (1024 * 1024 * 1024)).toFixed(2)} GB` : "",
        }));
        return res.json({ models });
      }
      const modelsDir = path.join(__dirname, "llm-models");
      if (!require('fs').existsSync(modelsDir)) {
        return res.json({ models: [] });
      }
      const files = require('fs').readdirSync(modelsDir)
        .filter(f => f.endsWith('.gguf') || f.endsWith('.bin'))
        .map(f => {
          const stat = require('fs').statSync(path.join(modelsDir, f));
          return {
            name: f,
            size: (stat.size / (1024 * 1024 * 1024)).toFixed(2) + " GB",
          };
        });
      res.json({ models: files });
    } catch (err) {
      res.json({ models: [] });
    }
  });

  app.post("/api/llm/load", async (req, res) => {
    const { model, params } = req.body || {};
    if (!model) {
      return res.status(400).json({ error: "model required" });
    }
    llmState.loadedModel = model;
    if (params) {
      llmState.params = { ...llmState.params, ...params };
    }
    res.json({ success: true, message: `Model ${model} loaded` });
  });

  app.post("/api/llm/unload", async (_req, res) => {
    llmState.loadedModel = null;
    res.json({ success: true, message: "Model unloaded" });
  });

  app.post("/api/llm/config", async (req, res) => {
    const { type, serverUrl, params } = req.body || {};
    if (type) llmState.type = type;
    if (serverUrl) llmState.serverUrl = serverUrl;
    if (params) llmState.params = { ...llmState.params, ...params };
    res.json({ success: true, message: "Config saved" });
  });

  app.post("/api/llm/test", async (req, res) => {
    const { url } = req.body || {};
    const testUrl = url || llmState.serverUrl;
    try {
      const target =
        llmState.type === "ollama"
          ? `${String(testUrl || "").replace(/\/+$/, "")}/api/tags`
          : testUrl;
      const response = await fetch(target, { method: "GET", signal: AbortSignal.timeout(3000) });
      res.json({ success: response.ok, message: response.ok ? "Connection successful" : "Connection failed" });
    } catch (err) {
      res.json({ success: false, error: err.message });
    }
  });

  // Frame interpolation API endpoints
  app.post("/api/interpolate", async (req, res) => {
    const { input_dir, output_dir, factor, method } = req.body || {};
    if (!input_dir || !output_dir) {
      return res.status(400).json({ error: "input_dir and output_dir required" });
    }
    try {
      execPythonModule([
        "-m", "defora_cli.frame_interpolator", "interpolate",
        "--input-dir", input_dir,
        "--output-dir", output_dir,
        "--factor", String(factor || 2),
        "--method", method || "blend",
      ], (error, stdout, stderr) => {
        if (error) {
          return res.status(500).json({ error: stderr || stdout || error.message });
        }
        res.json({ success: true, message: stdout });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // WebRTC streaming API endpoints
  app.post("/api/webrtc/start", async (req, res) => {
    const { fps, resolution, port } = req.body || {};
    try {
      const framesDir = process.env.FRAMES_DIR || path.join(__dirname, "frames");
      const args = [
        "-m", "defora_cli.stream_helper", "webrtc",
        "--source", framesDir,
        "--fps", String(fps || 24),
      ];
      if (resolution) args.push("--resolution", resolution);
      if (port) args.push("--port", String(port));
      execPythonModule(args, (error, stdout, stderr) => {
        if (error) {
          return res.status(500).json({ error: stderr || stdout || error.message });
        }
        res.json({ success: true, message: stdout, url: `http://localhost:${port || 8088}` });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/webrtc/stop", async (_req, res) => {
    try {
      execPythonModule(["-m", "defora_cli.stream_helper", "stop-webrtc"], (error, stdout, stderr) => {
        if (error) {
          return res.status(500).json({ error: stderr || stdout || error.message });
        }
        res.json({ success: true, message: stdout });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/webrtc/status", async (_req, res) => {
    try {
      execPythonModule(["-m", "defora_cli.stream_helper", "webrtc-status"], (error, stdout) => {
        res.json({
          status: error ? "stopped" : "running",
          output: stdout,
        });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Advanced Synchronization API endpoints
  app.post("/api/sync/ableton-link", async (req, res) => {
    const { bpm, mediator_host, mediator_port, fps } = req.body || {};
    const mediator = resolveMediatorConnection(req, req.body || {});
    try {
      const args = ["-m", "defora_cli.ableton_link", "sync", "--bpm", String(bpm || 120)];
      args.push("--mediator-host", mediator_host || mediator.host);
      args.push("--mediator-port", String(mediator_port || mediator.port));
      if (fps) args.push("--fps", String(fps));
      execPythonModule(args, (error, stdout, stderr) => {
        if (error) {
          return res.status(500).json({ error: stderr || stdout || error.message });
        }
        res.json({ success: true, message: stdout });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/sync/ableton-link/status", async (_req, res) => {
    try {
      execPythonModule(["-m", "defora_cli.ableton_link", "status"], (error, stdout, stderr) => {
        if (error) {
          return res.json({ status: "stopped", error: stderr || stdout || error.message });
        }
        try {
          const status = JSON.parse(stdout);
          res.json({ status: "running", ...status });
        } catch (e) {
          res.json({ status: "unknown", output: stdout });
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sync/timecode", async (req, res) => {
    const { mode, fps, midi_device, mediator_host, mediator_port } = req.body || {};
    const mediator = resolveMediatorConnection(req, req.body || {});
    if (!mode || !["ltc", "mtc"].includes(mode)) {
      return res.status(400).json({ error: "mode required (ltc or mtc)" });
    }
    try {
      const args = ["-m", "defora_cli.timecode_sync", mode, "--fps", String(fps || 24)];
      if (midi_device) args.push("--midi-device", midi_device);
      args.push("--mediator-host", mediator_host || mediator.host);
      args.push("--mediator-port", String(mediator_port || mediator.port));
      execPythonModule(args, (error, stdout, stderr) => {
        if (error) {
          return res.status(500).json({ error: stderr || stdout || error.message });
        }
        res.json({ success: true, message: stdout });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/sync/timecode/status", async (_req, res) => {
    try {
      execPythonModule(["-m", "defora_cli.timecode_sync", "status"], (error, stdout, stderr) => {
        if (error) {
          return res.json({ status: "stopped", error: stderr || stdout || error.message });
        }
        try {
          const status = JSON.parse(stdout);
          res.json({ status: "running", ...status });
        } catch (e) {
          res.json({ status: "unknown", output: stdout });
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Cloud GPU API endpoints
  app.post("/api/cloud-gpu/provision", async (req, res) => {
    const { provider, gpu_type, pool_name, count, max_cost } = req.body || {};
    if (!provider || !gpu_type || !pool_name) {
      return res.status(400).json({ error: "provider, gpu_type, and pool_name required" });
    }
    try {
      const args = [
        "-m", "defora_cli.cloud_gpu", "provision",
        "--provider", provider,
        "--gpu-type", gpu_type,
        "--pool-name", pool_name,
      ];
      if (count) args.push("--count", String(count));
      if (max_cost) args.push("--max-cost", String(max_cost));
      execPythonModule(args, (error, stdout, stderr) => {
        if (error) {
          return res.status(500).json({ error: stderr || stdout || error.message });
        }
        res.json({ success: true, message: stdout });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/cloud-gpu/status", async (req, res) => {
    const { pool_name } = req.query || {};
    if (!pool_name) {
      return res.status(400).json({ error: "pool_name required" });
    }
    try {
      execPythonModule(
        ["-m", "defora_cli.cloud_gpu", "status", "--pool-name", String(pool_name)],
        (error, stdout, stderr) => {
          if (error) {
            return res.status(500).json({ error: stderr || stdout || error.message });
          }
          try {
            const status = JSON.parse(stdout);
            res.json(status);
          } catch (e) {
            res.json({ output: stdout });
          }
        }
      );
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cloud-gpu/stop", async (req, res) => {
    const { pool_name } = req.body || {};
    if (!pool_name) {
      return res.status(400).json({ error: "pool_name required" });
    }
    try {
      execPythonModule(
        ["-m", "defora_cli.cloud_gpu", "stop", "--pool-name", String(pool_name)],
        (error, stdout, stderr) => {
          if (error) {
            return res.status(500).json({ error: stderr || stdout || error.message });
          }
          res.json({ success: true, message: stdout });
        }
      );
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/cloud-gpu/cost-estimate", async (req, res) => {
    const { provider, gpu_type, hours } = req.query || {};
    if (!provider || !gpu_type) {
      return res.status(400).json({ error: "provider and gpu_type required" });
    }
    try {
      execPythonModule([
        "-m", "defora_cli.cloud_gpu", "cost-estimate",
        "--provider", provider,
        "--gpu-type", gpu_type,
        "--hours", String(hours || 8),
      ], (error, stdout, stderr) => {
        if (error) {
          return res.status(500).json({ error: stderr || stdout || error.message });
        }
        res.json({ estimate: stdout });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DMX Lighting Control API endpoints
  app.post("/api/dmx/start", async (req, res) => {
    const { interface_type, universe, fps, broadcast_ip } = req.body || {};
    if (!interface_type || !["artnet", "sacn", "openrgb"].includes(interface_type)) {
      return res.status(400).json({ error: "interface_type required (artnet, sacn, or openrgb)" });
    }
    try {
      const args = ["-m", "defora_cli.dmx_control", interface_type];
      if (universe) args.push("--universe", String(universe));
      if (fps) args.push("--fps", String(fps));
      if (broadcast_ip && interface_type === "artnet") args.push("--ip", broadcast_ip);
      execPythonModule(args, (error, stdout, stderr) => {
        if (error) {
          return res.status(500).json({ error: stderr || stdout || error.message });
        }
        res.json({ success: true, message: stdout });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/dmx/status", async (_req, res) => {
    try {
      execPythonModule(["-m", "defora_cli.dmx_control", "status"], (error, stdout, stderr) => {
        if (error) {
          return res.json({ status: "stopped", error: stderr || stdout || error.message });
        }
        try {
          const status = JSON.parse(stdout);
          res.json({ status: "running", ...status });
        } catch (e) {
          res.json({ status: "unknown", output: stdout });
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/runs/launch-demo", async (req, res) => {
    try {
      const runId = `demo-${Date.now().toString(36)}`;
      const fps = 24;
      const maxFrames = 24;
      const videoName = "demo-output.mp4";
      const videoPath = path.join(uploadsDir, videoName);
      try {
        await fsp.mkdir(uploadsDir, { recursive: true });
        if (!fs.existsSync(videoPath)) {
          await fsp.writeFile(videoPath, Buffer.from("defora-demo-mp4"));
        }
      } catch (_e) {
        /* best-effort demo video for e2e */
      }
      const snapshot = {
        kind: "demo",
        maxFrames,
        fps,
        settings: {
          max_frames: maxFrames,
          fps,
          tag: "demo",
          sd_model_checkpoint: "demo-model",
          animation_prompts_positive: "e2e demo run",
        },
      };
      await persistRunJobSnapshot(runId, snapshot);
      await updateRunManifest(runId, {
        status: "running",
        tag: "demo",
        model: "demo-model",
        frame_count: maxFrames,
        fps,
        prompt_positive: "e2e demo run",
      });
      broadcast({ type: "run_demo_started", runId });
      setTimeout(async () => {
        await updateRunManifest(runId, {
          status: "completed",
          completed_at: new Date().toISOString(),
          output_video: videoPath,
          fps,
          frame_count: maxFrames,
        });
        broadcast({ type: "run_demo_done", runId, status: "completed" });
      }, 1200);
      res.json({ ok: true, run_id: runId, status: "running", fps, maxFrames });
    } catch (err) {
      res.status(500).json({ error: err.message || "demo launch failed" });
    }
  });

  app.get("/api/runs", async (req, res) => {
    const runs = await listRuns();
    const { status, tag, model, search, sort, order } = req.query;
    
    let filtered = runs;
    
    if (status) {
      filtered = filtered.filter(r => r.status === status);
    }
    if (tag) {
      filtered = filtered.filter(r => r.tag && r.tag.toLowerCase().includes(tag.toLowerCase()));
    }
    if (model) {
      filtered = filtered.filter(r => r.model && r.model.toLowerCase().includes(model.toLowerCase()));
    }
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
    
    if (sort) {
      const reverse = order === "desc";
      filtered.sort((a, b) => {
        let va = a[sort] || "";
        let vb = b[sort] || "";
        if (typeof va === "number" && typeof vb === "number") {
          return reverse ? vb - va : va - vb;
        }
        va = String(va).toLowerCase();
        vb = String(vb).toLowerCase();
        return reverse ? vb.localeCompare(va) : va.localeCompare(vb);
      });
    }
    
    res.json({ runs: filtered, total: runs.length, filtered: filtered.length });
  });

  function safeRunArtifactPath(runPath, fileName) {
    const base = path.basename(String(fileName || ""));
    if (!base || base.includes("..")) return null;
    const resolved = path.resolve(runPath, base);
    const runResolved = path.resolve(runPath);
    if (resolved !== runResolved && !resolved.startsWith(runResolved + path.sep)) return null;
    return resolved;
  }

  function collectRunOutputs(runPath, runId, manifest = {}) {
    const progress = computeRunFrameProgress(manifest, runPath);
    const frames = progress.frameFiles;
    const videos = [];
    try {
      if (fs.existsSync(runPath)) {
        for (const entry of fs.readdirSync(runPath)) {
          const ext = path.extname(entry).toLowerCase();
          if (VIDEO_EXT.has(ext)) videos.push(entry);
        }
      }
    } catch (_e) {
      /* ignore unreadable run dir */
    }
    videos.sort();

    const outputs = [];
    const runKey = encodeURIComponent(runId);
    for (const name of videos) {
      const artifactPath = safeRunArtifactPath(runPath, name);
      outputs.push({
        kind: "video",
        name,
        url: `/api/runs/${runKey}/video/${encodeURIComponent(name)}`,
        browse_path: artifactPath || path.join(runPath, name),
        rootId: "runs",
      });
    }

    const runResolved = path.resolve(runPath);
    const runRoot = rootForResolvedPath(runResolved, videoSwarmRoots());
    if (frames.length || fs.existsSync(runPath)) {
      outputs.push({
        kind: "frames",
        count: frames.length,
        browse_path: runResolved,
        rootId: runRoot?.id || "runs",
        browse_url: `/api/video-swarm/browse?path=${encodeURIComponent(runResolved)}&rootId=${encodeURIComponent(runRoot?.id || "runs")}`,
      });
    }

    for (const field of ["output_video", "video_path", "output_path", "output", "preview_path"]) {
      const raw = manifest[field];
      if (!raw || typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("/frames/")) {
        outputs.push({
          kind: "preview_frame",
          name: path.basename(trimmed),
          url: trimmed,
          source: field,
        });
        continue;
      }
      const resolved = resolveVideoSwarmPath(trimmed, null);
      if (!resolved) continue;
      try {
        if (!fs.existsSync(resolved)) continue;
      } catch (_e) {
        continue;
      }
      const ext = path.extname(resolved).toLowerCase();
      const root = rootForResolvedPath(resolved, videoSwarmRoots());
      if (VIDEO_EXT.has(ext)) {
        const exists = outputs.some((o) => o.kind === "video" && o.url.includes(encodeURIComponent(path.basename(resolved))));
        if (!exists) {
          outputs.push({
            kind: "video",
            name: path.basename(resolved),
            url: `/api/video-swarm/file?path=${encodeURIComponent(resolved)}${root ? `&rootId=${encodeURIComponent(root.id)}` : ""}`,
            browse_path: resolved,
            rootId: root?.id || null,
            source: field,
          });
        }
      }
    }

    const primaryVideo = outputs.find((o) => o.kind === "video") || null;
    const framesOutput = outputs.find((o) => o.kind === "frames") || null;
    return {
      frames,
      frame_count: frames.length,
      frames_done: progress.framesDone,
      frames_total: progress.framesTotal,
      frames_progress_pct: progress.framesProgressPct,
      latest_frame: progress.latestFrame,
      videos,
      outputs,
      primary_video: primaryVideo,
      has_frames: frames.length > 0,
      has_video: outputs.some((o) => o.kind === "video"),
      has_thumbnail: !!(progress.latestFrame || fs.existsSync(path.join(runPath, "thumb.png"))),
      thumb_rev: progress.latestFrame || null,
      frames_browse_url: framesOutput?.browse_url || null,
    };
  }

  app.get("/api/runs/:runId", (req, res) => {
    const runPath = path.join(runsDir, req.params.runId);
    const manifest = loadRunManifest(runPath);
    if (!manifest) {
      return res.status(404).json({ error: "Run not found" });
    }

    if (!manifest.job) {
      const jobPath = path.join(runPath, "defora-job.json");
      if (fs.existsSync(jobPath)) {
        try {
          manifest.job = JSON.parse(fs.readFileSync(jobPath, "utf-8"));
        } catch (_e) {
          /* ignore invalid job file */
        }
      }
    }

    const artifacts = collectRunOutputs(runPath, manifest.run_id, manifest);
    res.json({ ...manifest, ...artifacts });
  });

  app.get("/api/runs/:runId/thumb", (req, res) => {
    const runPath = path.join(runsDir, req.params.runId);
    const frameFiles = listRunFrameFiles(runPath);
    if (frameFiles.length > 0) {
      return res.sendFile(path.join(runPath, frameFiles[frameFiles.length - 1]));
    }
    const thumbPath = path.join(runPath, "thumb.png");
    if (fs.existsSync(thumbPath)) {
      return res.sendFile(thumbPath);
    }
    return res.status(404).json({ error: "No thumbnail found" });
  });

  app.get("/api/runs/:runId/frames/:frameName", (req, res) => {
    const runPath = path.join(runsDir, req.params.runId);
    const framePath = safeRunArtifactPath(runPath, req.params.frameName);
    if (!framePath || !fs.existsSync(framePath)) {
      return res.status(404).json({ error: "Frame not found" });
    }
    res.sendFile(framePath);
  });

  app.get("/api/runs/:runId/video/:fileName", (req, res) => {
    const runPath = path.join(runsDir, req.params.runId);
    const videoPath = safeRunArtifactPath(runPath, req.params.fileName);
    if (!videoPath || !fs.existsSync(videoPath)) {
      return res.status(404).json({ error: "Video not found" });
    }
    const ext = path.extname(videoPath).toLowerCase();
    if (!VIDEO_EXT.has(ext)) {
      return res.status(404).json({ error: "Not a video file" });
    }
    const type =
      ext === ".webm" ? "video/webm"
        : ext === ".mov" ? "video/quicktime"
          : "video/mp4";
    res.type(type);
    res.sendFile(videoPath);
  });

  app.put("/api/runs/:runId", (req, res) => {
    const runPath = path.join(runsDir, req.params.runId);
    const manifestPath = path.join(runPath, "run.json");
    if (!fs.existsSync(manifestPath)) {
      return res.status(404).json({ error: "Run not found" });
    }
    
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      const { tag, notes, metadata } = req.body;
      if (tag !== undefined) manifest.tag = tag;
      if (notes !== undefined) manifest.notes = notes;
      if (metadata !== undefined) manifest.metadata = { ...manifest.metadata, ...metadata };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/runs/:runId", (req, res) => {
    const runPath = path.join(runsDir, req.params.runId);
    if (!fs.existsSync(runPath)) {
      return res.status(404).json({ error: "Run not found" });
    }
    
    try {
      fs.rmSync(runPath, { recursive: true, force: true });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  const RUN_COMPARE_FIELDS = [
    "status", "model", "frame_count", "seed", "steps", "strength", "cfg", "tag", "notes",
    "prompt_positive", "prompt_negative", "started_at",
  ];

  const { diffPromptLines } = require("./shared/prompt-diff.cjs");

  function buildRunComparison(runIds, runs) {
    const selected = runIds
      .map((id) => runs.find((r) => r.run_id === id))
      .filter(Boolean);
    const matrix = {};
    for (const field of RUN_COMPARE_FIELDS) {
      matrix[field] = {};
      for (const run of selected) {
        matrix[field][run.run_id] = run[field] != null ? run[field] : null;
      }
    }
    const result = { run_ids: selected.map((r) => r.run_id), fields: RUN_COMPARE_FIELDS, matrix, runs: selected };
    if (selected.length === 2) {
      const [runA, runB] = selected;
      result.prompt_diffs = {
        run_a: runA.run_id,
        run_b: runB.run_id,
        prompt_positive: diffPromptLines(runA.prompt_positive, runB.prompt_positive),
        prompt_negative: diffPromptLines(runA.prompt_negative, runB.prompt_negative),
      };
    }
    return result;
  }

  app.post("/api/runs/compare", async (req, res) => {
    const { run_ids: runIds, format } = req.body || {};
    if (!Array.isArray(runIds) || runIds.length < 2) {
      return res.status(400).json({ error: "run_ids array with at least 2 ids required" });
    }
    if (runIds.length > 8) {
      return res.status(400).json({ error: "maximum 8 runs per comparison" });
    }
    const runs = await listRuns();
    const comparison = buildRunComparison(runIds, runs);
    if (comparison.runs.length < 2) {
      return res.status(404).json({ error: "fewer than 2 valid run ids" });
    }
    if (format === "csv") {
      const header = ["field", ...comparison.run_ids];
      const rows = [header.join(",")];
      for (const field of comparison.fields) {
        const row = [field, ...comparison.run_ids.map((id) => {
          const val = comparison.matrix[field][id];
          return `"${String(val != null ? val : "").replace(/"/g, '""')}"`;
        })];
        rows.push(row.join(","));
      }
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=runs_comparison.csv");
      return res.send(rows.join("\n"));
    }
    res.json({ comparison });
  });

  app.get("/api/runs/export", async (req, res) => {
    const runs = await listRuns();
    const format = req.query.format || "json";
    
    if (format === "csv") {
      const headers = ["run_id", "status", "started_at", "model", "frame_count", "tag", "seed", "steps", "strength", "cfg", "notes", "prompt_positive", "prompt_negative"];
      const csvRows = [headers.join(",")];
      for (const run of runs) {
        const row = headers.map(h => {
          const val = run[h] !== undefined ? String(run[h]).replace(/"/g, '""') : "";
          return `"${val}"`;
        });
        csvRows.push(row.join(","));
      }
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=runs_export.csv");
      res.send(csvRows.join("\n"));
    } else {
      res.json({ runs });
    }
  });

  app.post("/api/runs/:runId/rerun", async (req, res) => {
    const runPath = path.join(runsDir, req.params.runId);
    const manifest = loadRunManifest(runPath);
    if (!manifest) {
      return res.status(404).json({ error: "Run not found" });
    }
    
    const { overrides } = req.body || {};
    const rerunRequest = {
      mode: "rerun",
      run_id: manifest.run_id,
      original_manifest: manifest,
      overrides: overrides || {},
      created_at: new Date().toISOString(),
    };
    
    const requestPath = path.join(runPath, "rerun_request.json");
    fs.writeFileSync(requestPath, JSON.stringify(rerunRequest, null, 2));
    
    res.json({ success: true, request_path: requestPath });
  });

  app.post("/api/runs/:runId/continue", async (req, res) => {
    const runPath = path.join(runsDir, req.params.runId);
    const manifest = loadRunManifest(runPath);
    if (!manifest) {
      return res.status(404).json({ error: "Run not found" });
    }
    
    const { overrides, from_frame } = req.body || {};
    const continueRequest = {
      mode: "continue",
      run_id: manifest.run_id,
      original_manifest: manifest,
      from_frame: from_frame || manifest.frame_count,
      overrides: overrides || {},
      created_at: new Date().toISOString(),
    };
    
    const requestPath = path.join(runPath, "continue_request.json");
    fs.writeFileSync(requestPath, JSON.stringify(continueRequest, null, 2));
    
    res.json({ success: true, request_path: requestPath });
  });

  const server = app.listen(port, () => {
    const actualPort = server.address().port;
    console.log(`[web] API/WS listening on ${actualPort}`);
  });
  const actualPort = () => server.address() && server.address().port;
  const wss = new WebSocket.Server({ server, path: "/ws" });

  let amqpConn = null;
  let channel = null;
  async function setupQueue() {
    if (!enableMq) return;
    try {
      amqpConn = await amqp.connect(rabbitUrl);
      channel = await amqpConn.createChannel();
      await channel.assertQueue(queue, { durable: false });
      console.log("[mq] Connected to RabbitMQ");
    } catch (err) {
      console.error("[mq] connection failed", err);
      setTimeout(setupQueue, 2000);
    }
  }
  setupQueue();

  // Enhanced broadcast with batching support
  function broadcast(obj) {
    if (wsMessageBatcher.enabled && obj?.type !== "frame") {
      wsMessageBatcher.pendingMessages.push(obj);
      
      // Clear existing timer
      if (wsMessageBatcher.timer) {
        clearTimeout(wsMessageBatcher.timer);
      }
      
      // Send batch if it's full or set timer for interval
      if (wsMessageBatcher.pendingMessages.length >= wsMessageBatcher.maxBatchSize) {
        flushMessageBatch();
      } else {
        wsMessageBatcher.timer = setTimeout(flushMessageBatch, wsMessageBatcher.batchInterval);
      }
    } else {
      // Direct send without batching
      const msg = JSON.stringify(obj);
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(msg);
      });
    }
  }

  function flushMessageBatch() {
    if (wsMessageBatcher.pendingMessages.length === 0) return;
    
    const batch = {
      type: "batch",
      messages: wsMessageBatcher.pendingMessages,
      count: wsMessageBatcher.pendingMessages.length,
      timestamp: Date.now()
    };
    
    const msg = JSON.stringify(batch);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
    
    wsMessageBatcher.pendingMessages = [];
    wsMessageBatcher.timer = null;
  }

  // Collaborative features: user presence, session recording, parameter locking
  const connectedUsers = new Map();
  const parameterLocks = new Map();
  let sessionRecording = null;
  let sessionRecordingActive = false;

  function startSessionRecording() {
    sessionRecording = {
      startTime: Date.now(),
      events: [],
    };
    sessionRecordingActive = true;
    console.log("[collab] Session recording started");
  }

  function stopSessionRecording() {
    sessionRecordingActive = false;
    if (sessionRecording) {
      const recordingPath = path.join(__dirname, "recordings");
      if (!require('fs').existsSync(recordingPath)) {
        require('fs').mkdirSync(recordingPath, { recursive: true });
      }
      const filename = `session_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      const filepath = path.join(recordingPath, filename);
      require('fs').writeFileSync(filepath, JSON.stringify(sessionRecording, null, 2));
      console.log(`[collab] Session recording saved to ${filepath}`);
      sessionRecording = null;
    }
  }

  function recordEvent(event) {
    if (sessionRecordingActive && sessionRecording) {
      sessionRecording.events.push({
        timestamp: Date.now() - sessionRecording.startTime,
        ...event,
      });
    }
  }

  function broadcastUserPresence() {
    const users = Array.from(connectedUsers.values()).map(u => ({
      id: u.id,
      name: u.name,
      connectedAt: u.connectedAt,
      lockedParams: Array.from(parameterLocks.entries())
        .filter(([_, lock]) => lock.userId === u.id)
        .map(([param, _]) => param),
    }));
    broadcast({ type: "presence", users });
  }

  wss.on("connection", (ws) => {
    const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    connectedUsers.set(userId, {
      id: userId,
      name: `User ${connectedUsers.size + 1}`,
      ws,
      connectedAt: new Date().toISOString(),
    });

    ws.send(JSON.stringify({ 
      type: "hello", 
      msg: "Connected to defora web control",
      userId,
    }));
    
    broadcastUserPresence();

    ws.on("message", async (raw) => {
      try {
        const payload = JSON.parse(raw.toString());
        
        // Handle collaborative messages
        if (payload.type === "identify") {
          const user = connectedUsers.get(userId);
          if (user) {
            user.name = payload.name || user.name;
            broadcastUserPresence();
          }
          return;
        }
        
        if (payload.type === "lock_param") {
          const { param } = payload;
          if (parameterLocks.has(param)) {
            const lock = parameterLocks.get(param);
            ws.send(JSON.stringify({ 
              type: "error", 
              msg: `Parameter "${param}" is locked by ${lock.userName}` 
            }));
            return;
          }
          const user = connectedUsers.get(userId);
          parameterLocks.set(param, { userId, userName: user?.name || 'Unknown' });
          recordEvent({ type: "lock", param, userId });
          broadcastUserPresence();
          return;
        }
        
        if (payload.type === "unlock_param") {
          const { param } = payload;
          const lock = parameterLocks.get(param);
          if (lock && lock.userId === userId) {
            parameterLocks.delete(param);
            recordEvent({ type: "unlock", param, userId });
            broadcastUserPresence();
          }
          return;
        }
        
        if (payload.type === "start_recording") {
          startSessionRecording();
          ws.send(JSON.stringify({ type: "recording", status: "started" }));
          return;
        }
        
        if (payload.type === "stop_recording") {
          stopSessionRecording();
          ws.send(JSON.stringify({ type: "recording", status: "stopped" }));
          return;
        }
        
        if (payload.type === "playback_recording") {
          const { recordingFile } = payload;
          const recordingsPath = path.join(__dirname, "recordings");
          const filepath = path.join(recordingsPath, recordingFile);
          try {
            const recording = JSON.parse(require('fs').readFileSync(filepath, 'utf-8'));
            ws.send(JSON.stringify({ 
              type: "playback", 
              status: "started",
              events: recording.events.length,
            }));
            // Playback events with timing
            for (const event of recording.events) {
              setTimeout(() => {
                if (event.type === "control") {
                  broadcast({ type: "event", msg: "playback", payload: event.payload });
                }
              }, event.timestamp);
            }
          } catch (err) {
            ws.send(JSON.stringify({ type: "error", msg: "Recording not found" }));
          }
          return;
        }
        
        if (payload.type === "list_recordings") {
          const recordingsPath = path.join(__dirname, "recordings");
          try {
            const files = require('fs').readdirSync(recordingsPath)
              .filter(f => f.endsWith('.json'))
              .map(f => ({
                filename: f,
                size: require('fs').statSync(path.join(recordingsPath, f)).size,
              }));
            ws.send(JSON.stringify({ type: "recordings", files }));
          } catch (err) {
            ws.send(JSON.stringify({ type: "recordings", files: [] }));
          }
          return;
        }
        
        if (payload.type !== "control") return;
        if (controlToken && payload.token !== controlToken) {
          ws.send(JSON.stringify({ type: "error", msg: "unauthorized" }));
          return;
        }
        
        // Check if any parameter in the control message is locked
        const lockedParams = [];
        if (payload.payload) {
          for (const param of Object.keys(payload.payload)) {
            if (parameterLocks.has(param)) {
              const lock = parameterLocks.get(param);
              if (lock.userId !== userId) {
                lockedParams.push({ param, lockedBy: lock.userName });
              }
            }
          }
        }
        
        if (lockedParams.length > 0) {
          ws.send(JSON.stringify({ 
            type: "error", 
            msg: "Parameters locked",
            locked: lockedParams,
          }));
          return;
        }
        
        if (!payload.controlType || typeof payload.payload !== "object") {
          ws.send(JSON.stringify({ type: "error", msg: "invalid schema" }));
          return;
        }
        const msg = { controlType: payload.controlType, payload: payload.payload };
        if (channel) {
          channel.sendToQueue(queue, Buffer.from(JSON.stringify(msg)));
        }
        broadcast({ type: "event", msg: "control forwarded", payload: msg });
        recordEvent({ type: "control", payload: msg, userId });
      } catch (err) {
        console.error("bad ws message", err);
      }
    });

    ws.on("close", () => {
      // Release all locks held by this user
      for (const [param, lock] of parameterLocks.entries()) {
        if (lock.userId === userId) {
          parameterLocks.delete(param);
        }
      }
      connectedUsers.delete(userId);
      broadcastUserPresence();
    });
  });

  let forgePollTimer = null;
  const sdForgePollMs = parseInt(process.env.SD_FORGE_POLL_MS || "0", 10);
  if (Number.isFinite(sdForgePollMs) && sdForgePollMs > 0) {
    probeSdForge().catch(() => {});
    forgePollTimer = setInterval(() => {
      probeSdForge().catch(() => {});
    }, sdForgePollMs);
  }

  let lastPlaylistMtime = 0;
  const pollTimer = setInterval(async () => {
    try {
      const updated = await readPlaylistUpdatedMs();
      if (updated != null && updated > lastPlaylistMtime) {
        lastPlaylistMtime = updated;
        broadcast({ type: "stream", src: hlsStream, updated });
      }
    } catch (err) {
      console.error("[hls] poll error", err);
    }
  }, 2000);

  let frameWatcher;
  try {
    fs.mkdirSync(framesDir, { recursive: true });
    frameWatcher = fs.watch(framesDir, { persistent: false }, (_, filename) => {
      if (!filename || !FRAME_FILE_RE.test(filename)) return;
      const match = FRAME_FILE_RE.exec(filename);
      const frame = match ? parseInt(match[1], 10) : null;
      const item = {
        src: `/frames/${filename}?v=${Date.now()}`,
        name: filename,
        frame,
        mtime: Date.now(),
      };
      updateFramesIndexCache(item);
      fsp.stat(framesDir)
        .then((stat) => {
          framesIndexCache.dirMtime = stat.mtimeMs;
          framesIndexCache.builtAt = Date.now();
        })
        .catch(() => {});
      broadcast({ type: "frame", file: item.src, item });
    });
  } catch (err) {
    console.error("[frames] watch error", err);
  }

  const close = async () => {
    clearInterval(pollTimer);
    if (forgePollTimer) clearInterval(forgePollTimer);
    clearInterval(cleanupTimer);
    if (wsMessageBatcher.timer) {
      clearTimeout(wsMessageBatcher.timer);
      wsMessageBatcher.timer = null;
    }
    if (gpuPool && typeof gpuPool.close === "function") gpuPool.close();
    if (frameWatcher && frameWatcher.close) frameWatcher.close();
    wss.clients.forEach((c) => {
      try {
        c.close();
      } catch (_) {}
    });
    await new Promise((resolve) => wss.close(resolve));
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    if (channel) {
      try {
        await channel.close();
      } catch (_) {}
    }
    if (amqpConn) {
      try {
        await amqpConn.close();
      } catch (_) {}
    }
  };

  return { app, server, wss, close, port: actualPort() };
}

if (require.main === module) {
  start();
}

module.exports = { start };
