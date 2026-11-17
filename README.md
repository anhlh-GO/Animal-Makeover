# Animal Makeover ASMR — HTML5 port

Web version of *Animal Makeover ASMR MiniGames* 0.3.2 (com.kkz.animal.skincare.games), rebuilt from the original
Unity build's own assets: sprites, audio, fonts, particle settings, animation clips and every scene's layout and
step configuration. Splash, main menu (level selection, settings) and all 9 makeovers are playable:
Cat, Watermelon, Alligator, Parrot, Husky, ButterFly, Panda, Bunny, PolarBear. Ads are removed; locked looks and
levels open for free.

- Run: serve this folder with any static server and open `index.html`.
- Live: https://anhlh-go.github.io/Animal-Makeover/
- Android: https://github.com/anhlh-GO/Animal-Makeover/releases/latest/download/Animal-Makeover.apk (built by `.github/workflows/apk.yml`, WebView wrapper in `android/`)
- Dev: `?scene=level2`..`level10` opens a level directly, `&step=N` skips to step group N, `&bot=1` autoplays, `?nofx=1` turns the shader effects off.

Layout: `js/engine.js render.js input.js fx.js anim.js` = small Unity-scene runtime on Canvas2D;
`js/lf_core.js lf_scratch.js lf_steps.js lf_misc.js` = the game's data-driven LevelFlow step framework re-implemented;
`js/skinfx.js` = the game's skin-press / hair / sway sprite shaders (ported GLSL, WebGL2);
`js/game.js` = splash/menu/progress; `data/` exported scenes and configs; `assets/` textures (webp), audio (mp3), fonts;
`tools/` the Python exporters (UnityPy + IL2CPP metadata v31 reader).
