# Build & deploy

The London Trainer is published as part of the **`wisdom-reader`** static site on
Render, which serves every app under `wisdom/` (the readers, the chess trainers,
the health log, the source-bias graph) from one build. This document explains how
a change reaches production and, most importantly, how to diagnose a failed
deploy — because the pipeline has one recurring failure mode that is worth
understanding before you touch it.

## How a change ships

1. You edit files under `wisdom/londonsacrifice/`.
2. The session's auto-sync step (`scripts/auto_sync.sh`, wired to the Stop hook
   in `.claude/settings.json`) commits the change and pushes to `main` — **but
   only if the deploy preflight passes** (see the guard below).
3. Render watches `main` (`autoDeployTrigger: commit` in `render.yaml`) and
   rebuilds `wisdom-reader` when files matching its `buildFilter.paths` change.
4. The build runs the `buildCommand` in `render.yaml`: a series of Python reader
   builders (soft — `|| echo skip`), then **hard gates** (`|| exit 1`) that
   validate the public tree, then it publishes `.render/wisdom` as the site root.
5. The live site is `https://wisdom-reader.onrender.com/londonsacrifice/`.

## The publish boundary (fail-closed)

Files under `wisdom/` are **private to the repository unless explicitly
published.** The allowlist is `scripts/wisdom_public_manifest.mjs`
(`PUBLIC_ENTRIES`). `scripts/build_wisdom_public_tree.mjs` copies only allowlisted
files into `.render/wisdom`; `scripts/validate_wisdom_public_tree.mjs` then checks
that the staged tree is internally consistent (every file a service worker
precaches and every module an app imports must actually be present);
`scripts/validate_wisdom_public_privacy.mjs` checks that no private data leaked.
All three are hard gates — a failure stops publication, by design.

For the two chess trainers the manifest does **not** list files by hand. It
derives each app's publish set from that app's own `sw.js` precache SHELL:

```js
// scripts/wisdom_public_manifest.mjs
const CHESS_FILES = chessAppFiles("chess-openings");
const LONDON_SACRIFICE_FILES = chessAppFiles("londonsacrifice");
```

`chessAppFiles()` parses `const SHELL = [ ... ]` out of the app's `sw.js`. This
matters: **the precache list is the single source of truth for what a chess app
ships.** Add a runtime file to `sw.js` (which you must do anyway for the PWA to
work offline) and it is automatically published. There is no second list to keep
in sync.

## The recurring failure mode (and why it is now fixed)

Historically the manifest was a hand-maintained list, and the deploy broke every
time a chess app gained a new runtime file:

- A new file (`data/puzzles.js`, later `ui/classify.js`) gets referenced by
  `sw.js` (precache) and `ui/main.js` (import).
- The auto-sync commits that referencing code but **not** a manifest edit.
- Render builds, `build_wisdom_public_tree.mjs` omits the unlisted file, and
  `validate_wisdom_public_tree.mjs` fails with, e.g.:

  ```
  FAIL londonsacrifice/sw.js has missing precache reference:
       /londonsacrifice/ui/classify.js -> londonsacrifice/ui/classify.js
  FAIL londonsacrifice/ui/main.js has missing module reference:
       ./classify.js -> londonsacrifice/ui/classify.js
  ```

- The build exits 1. Render emails a failure. It recurs on every subsequent
  auto-sync commit until someone edits the manifest.

Deriving the publish set from `sw.js` removes the drift entirely: the referencing
list and the publish list are now the same list.

## The push guard

Even with the drift gone, a push can still carry other breakage (a syntax error
in generated data, a genuinely new privacy leak). `scripts/auto_sync.sh` runs
`scripts/preflight_wisdom_deploy.sh` before pushing. The preflight reproduces
**Render's exact view** — `git archive HEAD | tar -x` into a temp dir, so only
committed content is checked, with no local or git-ignored files — and runs the
same three hard gates. If any fail, the push is **held**: the work stays committed
locally, a clear message is logged, and the next stop retries once it is clean.

This is why the preflight uses a clean checkout, not the working tree: a stale,
git-ignored `wisdom/health/data/*.ndjson` will trip the privacy gate locally but
never exists on Render, and uncommitted edits are not what deploys. Only `HEAD`
is. Judging the deploy on anything else produces false alarms.

## Diagnosing a failed deploy

Do not guess. Reproduce Render's build locally and read the real error.

1. **Run the preflight** — it is the fastest faithful reproduction:

   ```sh
   bash scripts/preflight_wisdom_deploy.sh
   ```

   It prints the exact gate that fails and the offending file, or
   `preflight: wisdom-reader deploy is clean`.

2. **If you need the full build** (a Python reader builder is failing, not a
   gate), run the `buildCommand` from `render.yaml` step by step in a clean
   checkout. The Python steps are soft (`|| echo skip`); only the `|| exit 1`
   node/python gates fail the build.

3. **Check what is actually live** — deploys may have been failing, so the live
   site can be stale. A new file is the cleanest signal:

   ```sh
   curl -s -o /dev/null -w "%{http_code}\n" \
     https://wisdom-reader.onrender.com/londonsacrifice/ui/classify.js   # 200 = current
   curl -s https://wisdom-reader.onrender.com/londonsacrifice/sw.js | grep CACHE
   ```

   Bump the `sw.js` cache version (`const CACHE`) whenever a shell file changes,
   so an installed PWA upgrades; a unit test asserts the version and shell
   completeness (see [testing.md](testing.md)).

4. **Confirm the deploy went green, do not assume the push fixed it.** Render
   builds asynchronously. After pushing, poll a new asset until it returns 200,
   then load the live page and check the console is clean.

## Scope note

The preflight guards `wisdom-reader` specifically. The other Render service in
this repo, `fish-game` (a Docker web service), has its own build and is not
covered here; a change that only touches `wisdom/` cannot affect it.
