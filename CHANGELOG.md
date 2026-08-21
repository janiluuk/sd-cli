# Changelog

All notable changes to this project will be documented in this file.


## [0.6.76] - 2026-08-21

## What's Changed

- refactor: replace vimage2/vimage5 references with generic gpu-host naming in gpu-pool.json (f2829ca)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.75...v0.6.76


## [0.6.75] - 2026-06-17

## What's Changed

- docs: restore README tour screenshots from pre-refresh captures (76aaafe)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.74...v0.6.75


## [0.6.74] - 2026-06-03

## What's Changed

- fix(test): add DeforumControlNetPanel stub with data-testid to app-definition (784e118)
- ci: upgrade Node.js from 18 to 22 LTS (0a11bfb)
- fix(test): convert ESM spec files to CJS+loadEsm for Node 18 CI (2f63fac)
- fix(ci): resolve symlink before computing repo root in run_tests.sh (4048ef9)
- feat(web): ControlNet, styles, Forge preview progress, and library video source (5f75827)
- feat(web): GlassPanel polish and remove duplicate top nav (X2/X3–X4) (d730c26)
- feat(web): process preview requests through a FIFO queue (80fa093)
- docs: refresh UI screenshots for current shell layout (3c3a0c4)
- Reorganize repo: tools/, design docs, and screenshot cleanup (208e3e3)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.73...v0.6.74


## [0.6.73] - 2026-06-03

## What's Changed

- feat(web): bottom drawer toggle, engine defaults, and UI flow docs (c3abaf2)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.72...v0.6.73


## [0.6.72] - 2026-06-02

## What's Changed

- fix(test): relax Playwright strict locators for duplicated dock UI (3d44c22)
- fix(test): tolerate duplicate morph hint in Playwright smoke (c06e4c8)
- fix(test): dedupe nav tabs in Playwright smoke (bddc3e7)
- fix(web): repair LiveView template closing tags (279bd2a)
- fix(web): link LoRA hint to LIVE crossfader drawer (e906a8a)
- fix(test): stub media playback and absolute fetch in jsdom ui tests (5ff61bf)
- assets(web): add ThreeBackground texture sprites (5552922)
- UI: add animated loading indicators across refresh actions (e1f0104)
- fix(web): harden Playwright CI for runs Past tab and upload fixture (9cea022)
- fix(web): align Playwright E2E with top-nav and runs browser tabs (34bd2dd)
- Move main nav and drawers to top; put frame rail under System → Frames. (e86931f)
- Move crossfader to bottom drawer and pin engine controls on Live panel. (185de8a)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.71...v0.6.72


## [0.6.71] - 2026-06-02

## What's Changed

- feat(web): WAN engine panel, I2V init, and 96-frame E2E tests (83db497)
- feat(web): roadmap batch — compositor phase 3, AnimateLCM LoRAs, UX polish (34173f8)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.70...v0.6.71


## [0.6.70] - 2026-06-02

## What's Changed

- feat(web): AnimateLCM motion LoRA selector in engine panel controls (72796ef)
- feat(web): wire AnimateLCM engine into animation engine panel (7d73e8a)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.69...v0.6.70


## [0.6.69] - 2026-06-02

## What's Changed

- perf(web): speed up screenshot E2E and preview frame polling (103c539)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.68...v0.6.69


## [0.6.68] - 2026-06-02

## What's Changed

- docs: refresh README tour screenshots for June 2026 UI (1443cdd)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.67...v0.6.68


## [0.6.67] - 2026-06-01

## What's Changed

- chore(web): refresh batch-1 run fixture timestamps (df73c6f)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.66...v0.6.67


## [0.6.66] - 2026-06-01

## What's Changed

- feat(web): GPU mediator probes, FreeCut embed fix, and vimage2 stack helper (6c55b16)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.65...v0.6.66


## [0.6.65] - 2026-06-01

## What's Changed

- fix(scripts): encoder sh float backoff and post-deploy stack health check (19909d6)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.64...v0.6.65


## [0.6.64] - 2026-06-01

## What's Changed

- fix(web): skip txt2img Forge fetch in CI offline mode (51baded)
- feat(web): IA phases 3–5 discoverability, library Files tab, and cleanup (7ceb409)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.63...v0.6.64


## [0.6.63] - 2026-06-01

## What's Changed

- feat(web): engine Deforum settings, panel docks, and IA flow docs (253ffec)
- feat(web): left modulation panel, compositor defaults, and XY latch mode (3e4e31d)
- fix(web): library fullscreen close and record-during-generation E2E (f8fc15c)
- test(playwright): assert WebGL layer via layers sidebar on startup (cdc3059)
- fix(web): audio reactive panel and Playwright smoke after nav changes (0e4b880)
- test(playwright): expect six top nav tabs after UX nav cleanup (26ec3d1)
- fix(web): use .mjs for motion-axis-options so Node 18 can import it (11be8ed)
- fix(test): load motion-axis-options via loadEsm for Node 18 CI (4e73d3b)
- chore(screenshots): refresh UI audit captures for May 2026 UX branch (fe63e67)
- feat(web): library browser, audio-reactive bands, and compact XY motion pads (72dc580)
- feat(ux): layers right-edge sidebar, Scenes, nav cleanup (fcc1d20)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.62...v0.6.63


## [0.6.62] - 2026-05-31

## What's Changed

- feat(web): per-layer engine controls in animation drawer tabs (1bee722)
- feat(web): split engine drawer into layer settings and compositor tabs (22194d9)
- chore(test): add visual E2E verify-video-flow for runs browser + editor (3ad5157)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.61...v0.6.62


## [0.6.61] - 2026-05-31

## What's Changed

- chore(screenshots): refresh all tab screenshots with animated sea background (4965985)
- chore: refresh UI screenshots after LIVE and Deforum layout updates. (950208e)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.60...v0.6.61


## [0.6.60] - 2026-05-31

## What's Changed

- feat(plan): retrieve creaprompt extension and document integration plan (77f03cc)
- fix(web): copy shared/ into Docker image for server.js requires (4148c09)
- docs(web): add CreaPrompt integration plan and source CSV bundle (56379e5)
- feat(web): full-bleed stage, layer opacity controls, and Deforum params panel (12a7bf1)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.59...v0.6.60


## [0.6.59] - 2026-05-31

## What's Changed

- chore(web): rebuild public assets, fix gpu-pool model name format (ff4540f)
- refactor(web): move src utils to src/utils/, add AUDIO mini-bar meters (aa9d570)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.58...v0.6.59


## [0.6.58] - 2026-05-31

## What's Changed

- fix(web): scope morph enable click in Playwright smoke test (a47bf29)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.57...v0.6.58


## [0.6.57] - 2026-05-31

## What's Changed

- fix(web): scope morph enable click in Playwright smoke test (15d6ba5)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.56...v0.6.57


## [0.6.56] - 2026-05-31

## What's Changed

- fix(ci): install ffmpeg before Playwright E2E suite (6a6c7f0)
- style(web): mono generate dock sync readout and dock chrome (ac5c58d)
- feat(ux): LIVE HUD dock, AUDIO tab polish, and model source pills (7cb0a46)
- fix(web): update Playwright smoke for 8-tab nav and LIVE morph HUD (fec9ab5)
- fix(web): support getter/setter computed props in video-controls tests (a9d253e)
- feat(ux): library workspace overlay, recent-runs rail, token sweep (cf713c2)
- fix(web): restore compositor/plugin logic and update tests for UX migration (9fe4781)
- feat(ux): motion hero stage and consolidate prompt morph on LIVE (51ca041)
- docs: update migration notes with layout refactor progress; remove design.zip (f5066df)
- feat(ux): layout — side-panel drawer, wider menus, taller sequencer, engine controls inline (f8c49ca)
- feat(ux): steps 3+4 — LIVE morph/modulating HUDs + MODULATION teal active state (ec06024)
- feat(ux): steps 1+2 — promote AUDIO/RUNS/GENERATE tabs, remove Perf drawer (5a9a420)
- feat(web): motion readout mono token and hero pad layout (Mo4) (c1d4549)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.55...v0.6.56


## [0.6.55] - 2026-05-30

## What's Changed

- fix(web): library browser uploads root and local dev storage paths (c27728a)
- Update (89e84b2)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.54...v0.6.55


## [0.6.54] - 2026-05-30

## What's Changed

- feat(web): UX migration U-21–U-29 with annotated screenshots (#87) (cbaba8a)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.53...v0.6.54


## [0.6.53] - 2026-05-30

## What's Changed

- feat(web): preview compositor, animation engine plugins, and motion sequencer (#86) (53f1f3e)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.52...v0.6.53


## [0.6.52] - 2026-05-29

## What's Changed

- Feat/motion sequencer vimage3 streaming (#85) (68965f8)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.51...v0.6.52


## [0.6.51] - 2026-05-29

## What's Changed

- feat(ui): 4-panel overlay menu system with tabs at top (#84) (ff833be)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.50...v0.6.51


## [0.6.50] - 2026-05-29

## What's Changed

- Feat/motion sequencer vimage3 streaming (#81) (a7e4cfb)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.49...v0.6.50


## [0.6.49] - 2026-05-29

## What's Changed

- Fix web UI test harness for library browser and CI parity. (#82) (9629ee6)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.48...v0.6.49


## [0.6.48] - 2026-05-29

## What's Changed

- Live UI: top nav/drawers, unified crossfader, frames in Runs monitor (#83) (0b33f34)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.47...v0.6.48


## [0.6.47] - 2026-05-29

## What's Changed

- Use sane Deforum defaults for max_frames and CFG schedules. (26024ee)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.46...v0.6.47


## [0.6.46] - 2026-05-29

## What's Changed

- fix (38154a4)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.45...v0.6.46


## [0.6.45] - 2026-05-29

## What's Changed

- Add (ccdc17f)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.44...v0.6.45


## [0.6.44] - 2026-05-29

## What's Changed

- deforum (1ae55e1)
- Fix (0ffea87)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.43...v0.6.44


## [0.6.43] - 2026-05-29

## What's Changed

- test (789e04e)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.42...v0.6.43


## [0.6.42] - 2026-05-29

## What's Changed

- Feat/bottom nav (#80) (ceed343)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.41...v0.6.42


## [0.6.41] - 2026-05-29

## What's Changed

- Feat/motion sequencer vimage3 streaming (#78) (f12c892)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.40...v0.6.41


## [0.6.40] - 2026-05-29

## What's Changed

- Feat/bottom nav (#79) (d2f9562)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.39...v0.6.40


## [0.6.39] - 2026-05-29

## What's Changed

- Fixes (8748714)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.38...v0.6.39


## [0.6.38] - 2026-05-29

## What's Changed

- feat(ui): bottom navigation bar — fixed, centered, enlarged tabs (#77) (1a714aa)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.37...v0.6.38


## [0.6.37] - 2026-05-29

## What's Changed

- chore: rebuild assets for bottom nav (eabd779)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.36...v0.6.37


## [0.6.36] - 2026-05-29

## What's Changed

- feat(ui): move tab nav to fixed bottom bar, centered and enlarged (fc890fe)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.35...v0.6.36


## [0.6.35] - 2026-05-29

## What's Changed

- Fresh screenshots, rewritten UI annotations, design system doc, CI ESM fixes (#75) (8aee9cc)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.34...v0.6.35


## [0.6.34] - 2026-05-29

## What's Changed

- fix(web): restore WebGL animation by keeping Three.js out of Vue reactivity (#76) (b69049d)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.33...v0.6.34


## [0.6.33] - 2026-05-28

## What's Changed

- fix(web): restore WebGL animation by keeping Three.js out of Vue reactivity (#73) (c048d2d)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.32...v0.6.33


## [0.6.32] - 2026-05-28

## What's Changed

- fix(web): restore WebGL animation by keeping Three.js out of Vue reactivity (#72) (574f2a1)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.31...v0.6.32


## [0.6.31] - 2026-05-28

## What's Changed

- feat(web): instrument UI — MOTION layout, design system, audio reactive meters (#71) (18efeb0)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.30...v0.6.31


## [0.6.30] - 2026-05-28

## What's Changed

- perf(forge): ~3x generation speed — Lightning 2-step, no-half-vae, live preview off (#70) (f6a68a5)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.29...v0.6.30


## [0.6.29] - 2026-05-28

## What's Changed

- Feat/e2e recording and UI unification (#69) (2c4483e)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.28...v0.6.29


## [0.6.28] - 2026-05-28

## What's Changed

- feat(web): WebGL-first preview compositor and runs storage E2E (#68) (dc3bf48)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.27...v0.6.28


## [0.6.27] - 2026-05-27

## What's Changed

- chore(web): add UI tab screenshots and refresh built index entry (29e866b)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.26...v0.6.27


## [0.6.26] - 2026-05-27

## What's Changed

- test(web): Playwright E2E for recording + clip metadata (#67) (2efa57f)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.25...v0.6.26


## [0.6.25] - 2026-05-27

## What's Changed

- feat(web): motion sequencer layout, vimage3 HLS, and frame pipeline tuning (#66) (edd3e1f)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.24...v0.6.25


## [0.6.24] - 2026-05-27

## What's Changed

- feat(web): GPU active jobs panel, batch kill, and motion path preview (c89e2fd)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.23...v0.6.24


## [0.6.23] - 2026-05-27

## What's Changed

- feat(web): motion sequencer, WebGL startup, and Library runs browser (#65) (6338c7f)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.22...v0.6.23


## [0.6.22] - 2026-05-27

## What's Changed

- feat(web): motion sequencer tab, performance controls, and WebGL startup (#64) (573fea7)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.21...v0.6.22


## [0.6.21] - 2026-05-27

## What's Changed

- fix(web): repair storage browser paths and default to browser (#63) (880ba3d)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.20...v0.6.21


## [0.6.20] - 2026-05-27

## What's Changed

- feat(web): service health + restore-gated session resume (#61) (aeb6540)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.19...v0.6.20


## [0.6.19] - 2026-05-27

## What's Changed

- fix(nginx): align hls_path so /hls/live/deforum.m3u8 resolves correctly (a9e4343)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.18...v0.6.19


## [0.6.18] - 2026-05-27

## What's Changed

- feat(web): HLS fast-start + UI restore prompt + job snapshots (#60) (616d8ff)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.17...v0.6.18


## [0.6.17] - 2026-05-27

## What's Changed

- feat(web): streamline LIVE player layers and tools library (#59) (8606064)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.16...v0.6.17


## [0.6.16] - 2026-05-27

## What's Changed

- Feat/web UI refactor preview latency (#53) (0159dba)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.15...v0.6.16


## [0.6.15] - 2026-05-27

## What's Changed

- feat(web): LIVE sources, GPU instancing, and Three.js modulation routing (#55) (2c11861)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.14...v0.6.15


## [0.6.14] - 2026-05-27

## What's Changed

- feat(web): LIVE sub-tabs, GPU instancing standby, and video-swarm sources (#54) (5f5bcc5)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.13...v0.6.14


## [0.6.13] - 2026-05-27

## What's Changed

- Feat/web status gpu collab (#51) (2f12fc7)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.12...v0.6.13


## [0.6.12] - 2026-05-27

## What's Changed

- feat(web): split modulation audio into tabs and refresh prompts/engine UI (#52) (d5ccea5)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.11...v0.6.12


## [0.6.11] - 2026-05-27

## What's Changed

- Feat/web UI refactor preview latency (#49) (69cd485)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.10...v0.6.11


## [0.6.10] - 2026-05-27

## What's Changed

- Feat/web status gpu collab (#50) (09de0ac)
- update(web): refresh control surfaces and add library browsing (#47) (dc84ffc)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.9...v0.6.10


## [0.6.9] - 2026-05-26

## What's Changed

- update(web): refine live controls and GPU node editing (#48) (0e0873f)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.8...v0.6.9


## [0.6.8] - 2026-05-26

## What's Changed

- feat(web): reorganize the UI and speed up preview feedback (#46) (e019dce)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.7...v0.6.8


## [0.6.7] - 2026-05-26

## What's Changed

- Cursor/web UI tour readme (#45) (38788c9)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.6...v0.6.7


## [0.6.6] - 2026-05-26

## What's Changed

- Update README.md (564a22a)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.5...v0.6.6


## [0.6.5] - 2026-05-26

## What's Changed

- Add files via upload (4e64490)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.4...v0.6.5


## [0.6.4] - 2026-05-26

## What's Changed

- Rename live-tab.png to main.png (8446fb5)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.3...v0.6.4


## [0.6.3] - 2026-05-26

## What's Changed

- feat(web): finish browser UI pass and refresh docs (#44) (653c7fb)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.2...v0.6.3


## [0.6.2] - 2026-05-26

## What's Changed

- feat(web): finish browser UI pass and refresh docs (#43) (9b28141)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.1...v0.6.2


## [0.6.1] - 2026-05-26

## What's Changed

- fix: split ROOT assignment and cd to fix unbound variable error under set -u (4b2d19a)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.6.0...v0.6.1


## [0.6.0] - 2026-05-26

## What's Changed

- Cursor/live preview loading deforum defaults (#42) (53f2831)
- Cursor/live preview loading deforum defaults (#41) (11aca87)
- Cursor/live preview loading deforum defaults (#40) (60515bb)
- fix: reduce LIVE preview width (4fb5d49)
- feat: log generation requests (deforum preview + txt2img) to gpu node log (a6a9dfa)
- chore: gitignore built assets, remove stale asset files (80c91e2)
- fix: P1 LIVE stage layout + P2 spacing bugs (c16c118)
- feat: GPU pool node cards with per-node request log + stability fixes (d027d2f)
- feat: log distributed GPU node requests (5343277)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.5.6...v0.6.0


## [0.5.6] - 2026-05-26

## What's Changed

- fix: wire Engine settings to deforumSettings, add OOM guard, realistic defaults (0255497)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.5.5...v0.5.6


## [0.5.5] - 2026-05-26

## What's Changed

- UI migration: GENERATE timeline hero, all remaining views restyled + distributed Forge sync (#39) (efb7fda)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.5.4...v0.5.5


## [0.5.4] - 2026-05-26

## What's Changed

- fix forge model sync and external forge defaults (a7ac172)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.5.3...v0.5.4


## [0.5.3] - 2026-05-26

## What's Changed

- Update README.md (20710d2)
- chore: bump version to 0.5.2 [skip ci] (13ec6d5)
- Mediator merge (#38) (fab76ef)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.5.2...v0.5.3


## [0.5.2] - 2026-05-26

## What's Changed

- Mediator merge (#38) (fab76ef)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.5.2...v0.5.2


## [0.5.2] - 2026-05-26

## What's Changed

- Fixes (be876ab)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.5.1...v0.5.2


## [0.5.1] - 2026-05-26

## What's Changed

- fix(web): copy modules dir and seed gpu-pool with vimage2/vimage5 (5ebb112)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.5.0...v0.5.1


## [0.5.0] - 2026-05-26

## What's Changed

- feat(web): Step 8 — remove legacy token aliases from :root (aad3e00)
- feat(web): Step 7 — token consistency pass for inline styles in App.vue (e0efa64)
- feat(web): Step 6 — token consistency pass, all hex replaced in style.css (46f0b79)
- feat(web): Step 5 — pinned params (📌) in LIVE Parameters drawer (2fc48eb)
- feat(web): Step 4 — MODULATION view adopts Waveform + TargetCell (4ebed58)
- feat(web): Step 3 — LIVE HUD strip docked below video (e40c9a2)
- feat(web): Step 2 — design tokens, shared components, header restyle (8b34861)
- docs: add UI_MIGRATION_NOTES.md for instrument redesign (§0 discovery) (0c68514)
- fix(ci): align Playwright install and writable frames dir for smoke (3ce855b)
- fix(web): keep utils as ESM for Vite, inline them in app-definition (1da919d)
- fix(web): use CommonJS for utils required by app-definition tests (17e2c04)
- fix(tests): spawn Node server for API perf tests (097f551)
- chore: gitignore docker/web/uploads generated previews (7229c93)
- feat(roadmap): runs compare export, GPU pool forge routing, nightly E2E (5ae990d)
- feat(gpu-pool): multi-GPU load balancing and control panel (2ae6aa2)
- feat(web): post-audit polish — shared presets, collab UI, apiFetch (3936e27)
- fix(tests): run web server live smoke against Node server.js (5ca1a39)
- feat: close remaining audit items and CI hardening (93fe7eb)
- ci: add Sparkki-style production deploy workflow and scripts (21af41b)
- feat: audit remediation, Deforum settings panel, and refreshed UI screenshots (b06e197)
- feat: add DMX lighting control integration (c992de2)
- feat: implement advanced synchronization, VR/AR, and cloud GPU integration (4157917)
- feat: add WebRTC support for ultra-low latency streaming (86d3545)
- feat: add prompt strength scheduling over time (56cc860)
- feat: add shared presets and settings for collaborative features (953d487)
- feat: add frame interpolation for smoother output (f35c928)
- feat: add local LLM settings section with model management (19e8184)
- feat: implement advanced streaming, mobile support, and AI-assisted workflows (3515b4a)
- feat: implement roadmap items - plugin system, collaborative features, img2img enhancements (3912d4a)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.4.1...v0.5.0


## [0.4.1] - 2026-05-23

## What's Changed

- Roadmap audit remediation, Deforum settings panel, and UI screenshots (#36) (956a3f2)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.4.0...v0.4.1


## [0.4.0] - 2026-05-19

## What's Changed

- feat: implement roadmap items - plugins, collaboration, streaming, AI, mobile (#35) (b81791f)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.3.7...v0.4.0


## [0.3.7] - 2026-05-18

## What's Changed

- chore: update app-definition.js, test-app.html, and screenshots (9f5121f)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.3.6...v0.3.7


## [0.3.6] - 2026-05-18

## What's Changed

- feat(runs): add runs browser UI with filtering, sorting, export, and comparison (63137cc)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.3.5...v0.3.6


## [0.3.5] - 2026-05-18

## What's Changed

- fix: A/V sync, spectrogram, and test compatibility fixes (#34) (6bcb861)
- test: add runs filtering and new feature tests (#33) (0948401)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.3.4...v0.3.5


## [0.3.4] - 2026-05-18

## What's Changed

- feat(ui): add timeline viz, keyboard shortcuts, param reset, motion style persistence (#32) (ad50316)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.3.3...v0.3.4


## [0.3.3] - 2026-05-17

## What's Changed

- feat(ui): move LORA and CONTROLNET as sub-tabs under PROMPTS (5acba0a)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.3.2...v0.3.3


## [0.3.2] - 2026-05-17

## What's Changed

- chore: add deploy.sh for rsync + docker compose to remote host (43886ea)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.3.1...v0.3.2


## [0.3.1] - 2026-05-17

## What's Changed

- feat(ui): restructure tabs with sub-pills for PARAMETERS and SETTINGS (625fbeb)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.3.0...v0.3.1


## [0.3.0] - 2026-05-17

## What's Changed

- feat: add FORGE settings tab and fix Docker healthchecks (#31) (81c3ad6)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.2.11...v0.3.0


## [0.2.11] - 2026-05-15

## What's Changed

- Fix (6b3a903)
- chore: bump version to 0.2.10 [skip ci] (41bbc53)
- feat(web): Forge status, sequencer, img2img, spectral viz, scene markers (#30) (91c825e)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.2.10...v0.2.11


## [0.2.10] - 2026-05-04

## What's Changed

- feat(web): Forge status, sequencer, img2img, spectral viz, scene markers (#30) (91c825e)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.2.10...v0.2.10


## [0.2.9] - 2026-05-04

## What's Changed

- Add SD-Forge poll/status UI; align README, ROADMAP, WEB_UI tabs (#28) (11452df)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.2.8...v0.2.9


## [0.2.8] - 2026-02-01

## What's Changed

- Implement prompt strength scheduling, advanced weighting syntax, and SD-Forge attention syntax for defora project (c0dcbf3)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.2.7...v0.2.8


## [0.2.7] - 2026-01-25

## What's Changed

- Add project roadmap and implement all incomplete features with comprehensive test coverage, advanced workflow management, model management, prompt system, performance optimizations, distributed generation, and turbo model stack (#27) (1f9476e)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.2.6...v0.2.7


## [0.2.6] - 2026-01-24

## What's Changed

- Update screenshots for web and TUI interfaces (#26) (6c97192)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.2.5...v0.2.6


## [0.2.5] - 2026-01-17

## What's Changed

- Add LoRA browser with enhanced DJ-style crossfader and dynamic visual feedback for live performance (#25) (c2b9671)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.2.4...v0.2.5


## [0.2.4] - 2026-01-14

## What's Changed

- Add websockets to requirements.txt to fix CI test failures (8a2651a)
- Address code review feedback: improve test parameter consistency (5e0b5ab)
- Add tests for CLI panel to verify parameter handling logic (a826451)
- Add ncurses TUI screenshots and enhance README with feature highlights (1c06fe2)
- Initial plan (1c36d39)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.2.3...v0.2.4


## [0.2.3] - 2026-01-14

## What's Changed

- Fix failing tests: update selectors for FrameSync styling (186e8fe)
- Update all tab screenshots with compact 16:9 layout and session overlay (32d3b8d)
- Refactor video player: 16:9 aspect ratio, compact preview, stylish control panel, session overlay (1fe9694)
- Add conditional icon for record button (⏺ when recording, ● when idle) (82597fd)
- Update all tab screenshots with new video control layout (db4f2fb)
- Reorganize video controls: preview bar below video, centered play/record buttons with active states (49abb49)
- Fix: Improve async state handling and stream ID generation (b1a5370)
- Add custom video controls with FrameSync styling and placeholder thumbnails (e00bf9a)
- Refactor: Move inline styles to CSS classes for better maintainability (5d0383c)
- Update all tab screenshots with unified FrameSync styling (c759ad6)
- Apply FrameSync styling to all tabs for visual consistency (d47fb19)
- Initial plan (1d3de79)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.2.2...v0.2.3


## [0.2.2] - 2026-01-14

## What's Changed

- Fix test hanging: clear cleanup interval timer on server close (3dea123)
- Fix hanging tests: add timeouts and skip option for Docker tests (77c65d5)
- Address code review feedback: fix hardcoded paths and fetch import (355b5f4)
- Delete FEATURES_STATUS.md after implementing all actionable tasks (2e442a7)
- Add Docker stack integration tests (9601f11)
- Implement audio upload improvements, ControlNet live API, and frame seeder graceful shutdown (c8ef34a)
- Initial plan (0b8d554)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.2.1...v0.2.2


## [0.2.1] - 2026-01-14

## What's Changed

- Add comprehensive API documentation and troubleshooting guide (7883b95)
- Initial plan (b597631)

**Full Changelog**: https://github.com/janiluuk/defora/compare/v0.2.0...v0.2.1


## [0.2.0] - 2026-01-14

## What's Changed

- fix: safely handle package-lock.json in version commit (9f6a30e)
- feat: improve automated release workflow with better safeguards (23eae5f)
- Initial plan (a3046db)
- Address PR review comments: spelling, security, tests (81a86b5)
- Initial plan (717fb62)
- Fix failing tests: update UI tests for unified MODULATION tab (c7fec84)
- Add automated release workflow with changelog generation (3fd7985)
- Update documentation for unified MODULATION tab (10ff1da)
- Combine AUDIO, MOD, and FEATURES into unified MODULATION tab with FrameSync styling (81ab830)
- Fix code review feedback: improve Cosine SVG and replace deprecated substr() (915fb9f)
- Address PR review comments: improve security, add documentation, enhance tests (03d6a13)
- Add screenshots for all 8 UI tabs (5e65bb4)
- Initial plan (fa8b2f4)
- Address code review feedback and cleanup (99c1a48)
- Add encoder quality presets and frame seeder patterns (4c1d690)
- Add volume management documentation and scripts (daa84ad)
- Add comprehensive web API tests (8e278e1)
- Add librosa dependency and enable audio tests (f05194e)
- Initial plan (8551ebc)
- Streamline modulation UI layout (9d8cf8f)
- Enable real audio uploads and update tests (15085ae)
- Refine audio modulation controls (d27c145)
- Refine audio modulation controls (0b3ebff)
- Refine audio modulation controls (7797eb8)
- Rework FrameSync features layout (1069300)
- Rework FrameSync features layout (9554829)
- Clarify that models must be downloaded manually, not from Forge UI (08b5520)
- Refine setup script with better image checking and clearer error handling (bd3223a)
- Improve setup script efficiency and add clarifying comments (38d2264)
- Add automated setup script for SD-Forge first-time configuration (6cc80fd)
- Improve health check reliability and add security documentation (ccf7a77)
- Remove redundant COMMANDLINE_ARGS and clarify custom flag documentation (cd9ff3c)
- Add documentation for SD-Forge docker configuration and update features status (81b89f5)
- Add proper SD-Forge startup configuration with GPU support and extensions (0bafa63)
- Initial plan (9faf4a0)
- Remove pycache files from git tracking (d9f2189)
- Changes before error encountered (6f7c233)
- Changes before error encountered (19730e7)
- Initial plan (d3066f7)
- Implement Docker health checks for all services (Phase 4.2) (e0c13a9)
- Implement MIDI mapping persistence with localStorage (1fab980)
- Implement motion presets with parameter values and tests (bde6ad3)
- Add docker/web README documenting npm install requirement (9c1b82d)
- Remove node_modules from git tracking - should be installed via npm (0513845)
- Refactor time helper and clarify 1/8 note limitation (07907d6)
- Fix 1/8 note trigger logic in beat sync (9a4e069)
- Implement beat sync feature with visual feedback (af00c41)
- Add clarifying comment for translation scaling (2d57fe6)
- Fix touch event handling and improve code clarity (1e9a0a7)
- Add node_modules to .gitignore and remove from tracking (bf270f1)
- Implement XY pad interaction and prompt sending in web UI (454a36a)
- Add numpy and scipy dependencies, enable audio modulator tests (9961764)
- Initial plan (812b9d7)
- Add comprehensive architecture documentation (c3fa18e)
- Address code review feedback - improve error handling and efficiency (8a7d4ce)
- Add setup verification and complete documentation (50a72db)
- Add deforumation submodule and frame-seeder component (76796e9)
- Initial plan (859ee65)
- Add ASCII preview (e338560)
- Update tests (47595b5)
- Fix tests (b8dfe66)
- Add more examples (46ca2a8)
- Update for LFO editor (a8477e1)
- Fixes (42f24ef)
- Add mediator (30c332e)
- Improve streaming stack (e04ef39)
- Update README.md (8824af9)
- Update README.md (e45986f)
- Fix tests (6a548ca)
- Update docker compoe stack and dashboard (95decfe)
- Add tests (bca57e3)
-   - Added full-screen Defora TUI layout (sd_cli/defora_tui.py + ./defora_tui)     matching the multi-tab mockups.   - Rebuilt the web UI with the new layout (video left, control rack right,     context bottom), including LIVE/PROMPTS/MOTION/AUDIO/BEATS/CN/SETTINGS and     WebMIDI tab.   - Added comprehensive web UI smoke tests (tabs, sliders/presets, morph table,     macro rack, MIDI mappings).   - CI runs Python tests and web UI tests on push/PR (.github/workflows/ci.yml).   - README updated with branding, logo, TUI entrypoint, and env notes; logo     added under assets/defora_logo.svg. (523c681)
- Add initial build (bd8da0e)
- Add reference (34cee03)
- Clarify working directory requirements for example scripts (6a31512)
- Refine example scripts: add configurability and clearer documentation (1f3c0db)
- Fix code review issues: clean up requirements.txt and unused code (239a06b)
- Add comprehensive documentation and examples (4a71312)
- Initial plan (197e532)
- Use round() instead of int() for duration-to-frames calculation (5d009fd)
- Add .gitignore to exclude build artifacts and __pycache__ (1a77b56)
- Add --duration parameter for Deforum animations (6e6d2ad)
- Initial plan (3f0f8e9)
- first commit (f6b1293)

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Automated release workflow with changelog generation
- Comprehensive web API test suite (preset management, ControlNet, audio upload)
- Volume management scripts (backup, restore, cleanup, monitoring)
- Encoder quality presets (low, medium, high, ultra)
- Frame seeder patterns (timestamp, colorbars, checkerboard, gradient, text)
- Unified MODULATION tab with FrameSync styling
- Visual icons and emoji for improved UX
- librosa dependency for audio reactive modulation

### Changed
- Combined AUDIO/BEATS, MODULATION, and FEATURES tabs into unified MODULATION tab
- Reduced UI from 8 tabs to 6 tabs
- Applied FrameSync dark blue/orange theme to modulation interface
- Improved visual language with waveform icons (〰 △ ⟋ ▭ ◈)

### Fixed
- Enabled previously skipped audio reactive modulator tests
- Security improvements in preset management and file uploads

### Documentation
- WEB_UI_TABS.md - Complete UI tab documentation
- VOLUME_MANAGEMENT.md - Docker volume backup/restore procedures
- ENCODER_QUALITY.md - Quality preset documentation
- FRAME_SEEDER_PATTERNS.md - Test pattern documentation

## [0.1.0] - Initial Release

### Added
- Initial Defora project structure
- Web UI with LIVE, PROMPTS, MOTION, AUDIO/BEATS, MODULATION, FEATURES, CN, SETTINGS tabs
- Docker-based architecture
- Real-time parameter control via WebSocket
- MIDI mapping support
- Audio-reactive modulation
- LFO modulators
- Beat macros
- ControlNet integration
- Frame generation pipeline
- HLS streaming support
