# Jerry's Blitz Coach

Phone-first review and drills from Jerry's public Chess.com game history.

**Live site:** https://jerryshi042003.github.io/chess/

The app turns real games into opening summaries, mistake-pattern drills, and
move-by-move review. The shipped browser data is the same reviewed public data
used by the site; there are no account credentials, write APIs, or private
workspace notes in this repository.

## Run locally

Serve this directory with any static file server and open its root. Production
uses plain HTML, CSS, and JavaScript and works without a database or paid
runtime. The service worker is scoped to `/chess/` for GitHub Pages.

## Public boundary

This standalone repo contains the deployable Chess product only. The broader
private research pipeline, raw account exports, and unrelated Wisdom content
remain outside it.
