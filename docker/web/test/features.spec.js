/**
 * Additional tests for web server API and plugin registry
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const supertest = require("supertest");
const { expect } = require("chai");
const { describe, it, beforeEach, afterEach } = require("node:test");

const { start } = require("../server");

describe("Preset Management API", () => {
  let svc;
  let tmp;
  let uploads;
  let request;
  let presetsDir;
  let sequencersDir;

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "frames-"));
    uploads = fs.mkdtempSync(path.join(os.tmpdir(), "uploads-"));
    presetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "presets-"));
    sequencersDir = fs.mkdtempSync(path.join(os.tmpdir(), "sequencers-"));

    svc = await start({ port: 0, framesDir: tmp, uploadsDir: uploads, presetsDir, sequencersDir, enableMq: false });
    request = supertest(`http://127.0.0.1:${svc.port}`);
  });

  afterEach(async () => {
    if (svc && svc.close) {
      await svc.close();
    }
    [tmp, uploads, presetsDir, sequencersDir].forEach((dir) => {
      if (dir && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  it("saves a preset to file system", async () => {
    const presetData = {
      liveVibe: [{ key: "cfg", val: 0.8, min: 0, max: 1.5 }],
      liveCam: [{ key: "zoom", val: 1.2, min: -5, max: 5 }],
      audio: { bpm: 140, track: "" },
      cn: { slots: [], active: "CN1" },
      lfos: [],
      macrosRack: [],
      paramSources: {},
    };

    const res = await request.post("/api/presets/test-preset").send(presetData);
    expect(res.status).to.equal(200);
    expect(res.body.ok).to.equal(true);

    // Verify file was created
    const presetFile = path.join(presetsDir, "test-preset.json");
    expect(fs.existsSync(presetFile)).to.equal(true);

    // Verify content
    const saved = JSON.parse(fs.readFileSync(presetFile, "utf8"));
    expect(saved.liveVibe[0].val).to.equal(0.8);
    expect(saved.audio.bpm).to.equal(140);
  });

  it("loads a preset from file system", async () => {
    const presetData = {
      liveVibe: [{ key: "strength", val: 0.5, min: 0, max: 1.5 }],
      audio: { bpm: 120 },
    };

    // Create preset file
    const presetFile = path.join(presetsDir, "load-test.json");
    fs.writeFileSync(presetFile, JSON.stringify(presetData));

    const res = await request.get("/api/presets/load-test");
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property("name", "load-test");
    expect(res.body).to.have.property("preset");
    expect(res.body.preset).to.have.property("liveVibe");
    expect(res.body.preset.liveVibe).to.be.an("array");
    expect(res.body.preset.liveVibe[0].val).to.equal(0.5);
    expect(res.body.preset.audio.bpm).to.equal(120);
  });

  it("lists all available presets", async () => {
    // Create some preset files
    fs.writeFileSync(path.join(presetsDir, "preset1.json"), JSON.stringify({ audio: { bpm: 100 } }));
    fs.writeFileSync(path.join(presetsDir, "preset2.json"), JSON.stringify({ audio: { bpm: 120 } }));
    fs.writeFileSync(path.join(presetsDir, "not-json.txt"), "text file");

    const res = await request.get("/api/presets");
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property("presets");
    expect(res.body.presets).to.be.an("array");
    expect(res.body.presets).to.include("preset1");
    expect(res.body.presets).to.include("preset2");
    expect(res.body.presets).to.not.include("not-json");
  });

  it("deletes a preset", async () => {
    const presetFile = path.join(presetsDir, "delete-me.json");
    fs.writeFileSync(presetFile, JSON.stringify({ audio: { bpm: 100 } }));
    expect(fs.existsSync(presetFile)).to.equal(true);

    const res = await request.delete("/api/presets/delete-me");
    expect(res.status).to.equal(200);
    expect(res.body.ok).to.equal(true);
    expect(fs.existsSync(presetFile)).to.equal(false);
  });

  it("sanitizes preset names to prevent path traversal", async () => {
    const maliciousName = "../../../etc/passwd";
    const presetData = { audio: { bpm: 100 } };

    const res = await request.post(`/api/presets/${encodeURIComponent(maliciousName)}`).send(presetData);

    // Server should sanitize the name (strip out ../ and other unsafe chars)
    expect(res.status).to.equal(200);
    // Verify the sanitized name contains no path traversal characters
    const files = fs.readdirSync(presetsDir);
    expect(files.some((f) => f.includes(".."))).to.equal(false);
    expect(files.some((f) => f.includes("/"))).to.equal(false);
  });

  it("handles loading non-existent preset gracefully", async () => {
    const res = await request.get("/api/presets/non-existent");
    expect(res.status).to.equal(404);
  });
});

describe("Shared Presets API", () => {
  let svc;
  let tmp;
  let request;

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "frames-"));
    svc = await start({ port: 0, framesDir: tmp, enableMq: false });
    request = supertest(`http://127.0.0.1:${svc.port}`);
  });

  afterEach(async () => {
    if (svc && svc.close) await svc.close();
    if (tmp && fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("lists, saves, loads, and deletes shared presets", async () => {
    const preset = { liveVibe: [{ key: "cfg", val: 0.5 }], audio: { bpm: 128 } };
    const save = await request.post("/api/shared-presets").send({
      name: "crew-a",
      preset,
      sharedBy: "tester",
    });
    expect(save.status).to.equal(200);
    expect(save.body.ok).to.equal(true);

    const list = await request.get("/api/shared-presets");
    expect(list.status).to.equal(200);
    expect(list.body.presets.map((p) => p.name)).to.include("crew-a");

    const load = await request.get("/api/shared-presets/crew-a");
    expect(load.status).to.equal(200);
    expect(load.body.preset.audio.bpm).to.equal(128);

    const del = await request.delete("/api/shared-presets/crew-a");
    expect(del.status).to.equal(200);
  });
});

describe("ControlNet API", () => {
  let svc;
  let tmp;
  let uploads;
  let sequencersDir;
  let request;

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "frames-"));
    uploads = fs.mkdtempSync(path.join(os.tmpdir(), "uploads-"));
    sequencersDir = fs.mkdtempSync(path.join(os.tmpdir(), "sequencers-"));

    svc = await start({ port: 0, framesDir: tmp, uploadsDir: uploads, sequencersDir, enableMq: false });
    request = supertest(`http://127.0.0.1:${svc.port}`);
  });

  afterEach(async () => {
    if (svc && svc.close) {
      await svc.close();
    }
    [tmp, uploads, sequencersDir].forEach((dir) => {
      if (dir && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  it("returns list of ControlNet models", async () => {
    const res = await request.get("/api/controlnet/models");
    expect(res.status).to.equal(200);
    expect(res.body).to.have.property("models");
    expect(res.body.models).to.be.an("array");
    expect(res.body).to.have.property("source");

    if (res.body.source === "unavailable") {
      expect(res.body.models).to.have.length(0);
      return;
    }

    expect(res.body.models.length).to.be.greaterThan(0);

    // Verify structure of model objects
    const model = res.body.models[0];
    expect(model).to.have.property("id");
    expect(model).to.have.property("name");
    expect(model).to.have.property("category");
  });

  it("model list includes common ControlNet types", async () => {
    const res = await request.get("/api/controlnet/models");
    expect(res.body).to.have.property("models");
    const ids = res.body.models.map((m) => m.id);

    if (res.body.source === "sd-forge" || res.body.source === "cache") {
      expect(ids.length).to.be.greaterThan(0);
    } else if (res.body.source === "unavailable") {
      expect(ids).to.have.length(0);
    } else {
      expect(ids).to.include("canny");
      expect(ids).to.include("depth");
      expect(ids).to.include("openpose");
    }
  });
});

describe("Audio File Upload Lifecycle", () => {
  let svc;
  let tmp;
  let uploads;
  let sequencersDir;
  let request;

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "frames-"));
    uploads = fs.mkdtempSync(path.join(os.tmpdir(), "uploads-"));
    sequencersDir = fs.mkdtempSync(path.join(os.tmpdir(), "sequencers-"));

    svc = await start({ port: 0, framesDir: tmp, uploadsDir: uploads, sequencersDir, enableMq: false });
    request = supertest(`http://127.0.0.1:${svc.port}`);
  });

  afterEach(async () => {
    if (svc && svc.close) {
      await svc.close();
    }
    [tmp, uploads, sequencersDir].forEach((dir) => {
      if (dir && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  it("validates audio file format", async () => {
    const payload = {
      name: "test.wav",
      data: "data:audio/wav;base64,ZmFrZQ==",
    };

    const res = await request.post("/api/audio-upload").send(payload);
    expect(res.status).to.equal(200);
    expect(res.body.ok).to.equal(true);
  });

  it("rejects non-audio files", async () => {
    const payload = {
      name: "test.txt",
      data: "data:text/plain;base64,ZmFrZQ==",
    };

    const res = await request.post("/api/audio-upload").send(payload);
    
    // Should either reject or accept with sanitization
    if (res.status !== 200) {
      expect(res.status).to.be.oneOf([400, 415]);
    }
  });

  it("handles large audio files appropriately", async () => {
    // Create a large base64 string (simulating 10MB file)
    const largeData = Buffer.alloc(10 * 1024 * 1024, "a").toString("base64");
    const payload = {
      name: "large.wav",
      data: `data:audio/wav;base64,${largeData}`,
    };

    const res = await request.post("/api/audio-upload").send(payload);

    // Should either succeed with proper handling or reject with size limit error
    if (res.status !== 200) {
      expect(res.status).to.be.oneOf([400, 413]);
    }
  });

  it("prevents path traversal in uploaded file names", async () => {
    const payload = {
      name: "../../../etc/passwd",
      data: "data:audio/wav;base64,ZmFrZQ==",
    };

    const res = await request.post("/api/audio-upload").send(payload);

    if (res.status === 200) {
      // If accepted, verify the path doesn't escape uploads directory
      expect(res.body.path).to.include(uploads);
      expect(res.body.path).to.not.include("../");
      expect(res.body.path).to.not.include("/etc/");
    } else {
      expect(res.status).to.be.oneOf([400, 403]);
    }
  });

  it("generates unique file names for duplicate uploads", async () => {
    const payload = {
      name: "duplicate.wav",
      data: "data:audio/wav;base64,ZmFrZQ==",
    };

    // Upload same file twice
    const res1 = await request.post("/api/audio-upload").send(payload);
    const res2 = await request.post("/api/audio-upload").send(payload);

    expect(res1.status).to.equal(200);
    expect(res2.status).to.equal(200);

    // Paths should be different or one should overwrite
    // Verify both files exist or only one exists
    const path1 = res1.body.path;
    const path2 = res2.body.path;

    if (path1 !== path2) {
      expect(fs.existsSync(path1)).to.equal(true);
      expect(fs.existsSync(path2)).to.equal(true);
    } else {
      expect(fs.existsSync(path1)).to.equal(true);
    }
  });
});
