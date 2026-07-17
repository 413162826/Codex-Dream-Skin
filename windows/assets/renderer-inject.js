((cssText, artDataUrl, rawConfig) => {
  const STATE_KEY = "__CODEX_DREAM_SKIN_STATE__";
  const STYLE_ID = "codex-dream-skin-style";
  const CHROME_ID = "codex-dream-skin-chrome";
  const CONTROLS_ID = "codex-dream-skin-controls";
  const SETTINGS_KEY = "codex-dream-skin-user-settings-v1";
  const WALLPAPER_DB_NAME = "codex-dream-skin-local-assets";
  const WALLPAPER_STORE_NAME = "wallpapers";
  const MAX_LOCAL_WALLPAPER_BYTES = 16 * 1024 * 1024;
  const MAX_LOCAL_WALLPAPER_DIMENSION = 16384;
  const MAX_LOCAL_WALLPAPER_PIXELS = 50_000_000;
  const LOCAL_WALLPAPER_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/avif",
  ]);
  const DEFAULT_SETTINGS = {
    transparency: 70,
    brightness: 100,
    sharpness: 100,
    motion: true,
    readingMode: true,
  };
  const ROOT_CLASSES = [
    "codex-dream-skin",
    "dream-theme-light",
    "dream-theme-dark",
    "dream-art-wide",
    "dream-art-standard",
    "dream-focus-left",
    "dream-focus-center",
    "dream-focus-right",
    "dream-safe-left",
    "dream-safe-center",
    "dream-safe-right",
    "dream-safe-none",
    "dream-task-ambient",
    "dream-task-banner",
    "dream-task-off",
    "dream-motion-enabled",
    "dream-motion-disabled",
    "dream-reading-enabled",
    "dream-reading-disabled",
  ];
  const ROOT_PROPERTIES = [
    "--dream-art",
    "--dream-art-position",
    "--dream-focus-x",
    "--dream-focus-y",
    "--dream-accent",
    "--dream-accent-ink",
    "--dream-image-luma",
    "--dream-user-main-alpha",
    "--dream-user-main-mid-alpha",
    "--dream-user-main-far-alpha",
    "--dream-user-sidebar-alpha",
    "--dream-user-control-alpha",
    "--dream-user-task-edge-alpha",
    "--dream-user-task-mid-alpha",
    "--dream-user-task-far-alpha",
    "--dream-wallpaper-brightness",
    "--dream-wallpaper-blur",
  ];
  const HOME_UTILITY_CLASS = "dream-home-utility";
  const installToken = {};
  let samplingNativeShell = false;
  let observer = null;
  window.__CODEX_DREAM_SKIN_DISABLED__ = false;

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value)));
  const luminance = (red, green, blue) => {
    const linear = [red, green, blue].map((value) => {
      const channel = value / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    });
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  };
  const defaultProfile = {
    appearance: "dark",
    accent: [108, 131, 142],
    focusX: .5,
    focusY: .5,
    aspect: 1.6,
    luma: .32,
    safeArea: "center",
  };

  const normalizeConfig = (value) => {
    const config = value && typeof value === "object" ? value : {};
    const art = config.art && typeof config.art === "object" ? config.art : {};
    const hasNumber = (candidate) =>
      (typeof candidate === "number" || (typeof candidate === "string" && candidate.trim() !== "")) &&
      Number.isFinite(Number(candidate));
    const requestedAccent = typeof config?.palette?.accent === "string"
      ? config.palette.accent.trim()
      : "";
    const safeAccent = /^(?:#[\da-f]{3,8}|(?:rgb|hsl|oklch|oklab)\([^;{}]{1,96}\))$/i.test(requestedAccent)
      ? requestedAccent
      : null;
    const appearance = ["auto", "light", "dark"].includes(config.appearance)
      ? config.appearance
      : "auto";
    const safeArea = ["auto", "left", "right", "center", "none"].includes(art.safeArea)
      ? art.safeArea
      : "auto";
    const taskMode = ["auto", "ambient", "banner", "off"].includes(art.taskMode)
      ? art.taskMode
      : "auto";
    const metadataRatio = Number(config?.artMetadata?.ratio);
    const rawThemeId = typeof config.id === "string" ? config.id.trim() : "";
    const themeId = /^[\w.-]{1,120}$/u.test(rawThemeId) ? rawThemeId : "active";
    return {
      themeId,
      themeName: typeof config.name === "string" && config.name.trim()
        ? config.name.trim().slice(0, 120)
        : "主题壁纸",
      appearance,
      safeArea,
      taskMode,
      focusX: hasNumber(art.focusX) ? clamp(art.focusX) : null,
      focusY: hasNumber(art.focusY) ? clamp(art.focusY) : null,
      accent: safeAccent,
      initialAspect: Number.isFinite(metadataRatio) && metadataRatio > 0 ? metadataRatio : null,
    };
  };

  const previous = window[STATE_KEY];
  if (previous?.observer) previous.observer.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  for (const url of new Set([
    previous?.artUrl,
    previous?.injectedArtUrl,
    previous?.localArtUrl,
  ].filter(Boolean))) URL.revokeObjectURL(url);
  document.getElementById(CONTROLS_ID)?.remove();
  const injectedArtUrl = (() => {
    const comma = artDataUrl.indexOf(",");
    const binary = atob(artDataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const mime = /^data:([^;,]+)/.exec(artDataUrl)?.[1] || "image/png";
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  })();
  let localArtUrl = null;
  let activeArtUrl = injectedArtUrl;
  const config = normalizeConfig(rawConfig);
  const readUserSettings = () => {
    let stored = {};
    try { stored = JSON.parse(window.localStorage?.getItem(SETTINGS_KEY) || "{}"); } catch {}
    const numberWithin = (value, fallback, min, max) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Math.round(clamp(numeric, min, max)) : fallback;
    };
    return {
      transparency: numberWithin(stored.transparency, DEFAULT_SETTINGS.transparency, 22, 88),
      brightness: numberWithin(stored.brightness, DEFAULT_SETTINGS.brightness, 55, 115),
      sharpness: numberWithin(stored.sharpness, DEFAULT_SETTINGS.sharpness, 20, 100),
      motion: typeof stored.motion === "boolean" ? stored.motion : DEFAULT_SETTINGS.motion,
      readingMode: typeof stored.readingMode === "boolean"
        ? stored.readingMode
        : DEFAULT_SETTINGS.readingMode,
    };
  };
  const userSettings = readUserSettings();
  const persistUserSettings = () => {
    try { window.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(userSettings)); } catch {}
  };
  const applyUserSettings = (root) => {
    const mainAlpha = clamp(1 - userSettings.transparency / 100, .12, .78);
    const percent = (value) => `${Math.round(clamp(value) * 100)}%`;
    root.style.setProperty("--dream-user-main-alpha", percent(mainAlpha));
    root.style.setProperty("--dream-user-main-mid-alpha", percent(mainAlpha * .68));
    root.style.setProperty("--dream-user-main-far-alpha", percent(mainAlpha * .36));
    root.style.setProperty("--dream-user-sidebar-alpha", percent(Math.min(.9, mainAlpha + .16)));
    root.style.setProperty("--dream-user-control-alpha", percent(Math.min(.96, mainAlpha + .5)));
    root.style.setProperty("--dream-user-task-edge-alpha", percent(Math.min(.92, mainAlpha + .56)));
    root.style.setProperty("--dream-user-task-mid-alpha", percent(Math.min(.88, mainAlpha + .48)));
    root.style.setProperty("--dream-user-task-far-alpha", percent(Math.min(.82, mainAlpha + .36)));
    root.style.setProperty(
      "--dream-wallpaper-brightness",
      (userSettings.brightness / 100).toFixed(2),
    );
    root.style.setProperty(
      "--dream-wallpaper-blur",
      `${clamp((100 - userSettings.sharpness) / 20, 0, 4).toFixed(2)}px`,
    );
    root.classList.toggle("dream-motion-enabled", userSettings.motion);
    root.classList.toggle("dream-motion-disabled", !userSettings.motion);
    root.classList.toggle("dream-reading-enabled", userSettings.readingMode);
    root.classList.toggle("dream-reading-disabled", !userSettings.readingMode);
    persistUserSettings();
  };
  let profile = {
    ...defaultProfile,
    aspect: config.initialAspect ?? defaultProfile.aspect,
  };
  const existingStyle = document.getElementById(STYLE_ID);
  if (existingStyle) {
    existingStyle.textContent = cssText;
    existingStyle.dataset.dreamVersion = "4";
  }

  const analyzeArt = (url = activeArtUrl) => new Promise((resolve) => {
    if (typeof Image !== "function") {
      resolve(defaultProfile);
      return;
    }
    const image = new Image();
    image.onload = () => {
      try {
        const width = 48;
        const height = Math.max(12, Math.round(width * image.naturalHeight / image.naturalWidth));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext?.("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas is unavailable");
        context.drawImage(image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        let count = 0;
        let totalRed = 0;
        let totalGreen = 0;
        let totalBlue = 0;
        let totalBrightness = 0;
        const samples = [];
        const sampleMap = new Array(width * height);
        for (let offset = 0; offset < pixels.length; offset += 4) {
          if (pixels[offset + 3] < 96) continue;
          const red = pixels[offset];
          const green = pixels[offset + 1];
          const blue = pixels[offset + 2];
          const light = (.2126 * red + .7152 * green + .0722 * blue) / 255;
          const sample = { red, green, blue, light, index: offset / 4 };
          samples.push(sample);
          sampleMap[sample.index] = sample;
          totalRed += red;
          totalGreen += green;
          totalBlue += blue;
          totalBrightness += light;
          count += 1;
        }
        if (!count) throw new Error("Image contains no opaque pixels");
        const average = [totalRed / count, totalGreen / count, totalBlue / count];
        const averageBrightness = totalBrightness / count;
        const information = (start, end) => {
          let total = 0;
          let totalSquared = 0;
          let edges = 0;
          let edgeCount = 0;
          let sampleCount = 0;
          for (let y = 0; y < height; y += 1) {
            for (let x = start; x < end; x += 1) {
              const sample = sampleMap[y * width + x];
              if (!sample) continue;
              total += sample.light;
              totalSquared += sample.light * sample.light;
              sampleCount += 1;
              const previousSample = x > start ? sampleMap[y * width + x - 1] : null;
              const above = y > 0 ? sampleMap[(y - 1) * width + x] : null;
              if (previousSample) { edges += Math.abs(sample.light - previousSample.light); edgeCount += 1; }
              if (above) { edges += Math.abs(sample.light - above.light); edgeCount += 1; }
            }
          }
          const mean = sampleCount ? total / sampleCount : 0;
          const variance = sampleCount ? Math.max(0, totalSquared / sampleCount - mean * mean) : 1;
          return Math.sqrt(variance) * .58 + (edgeCount ? edges / edgeCount : 1) * .42;
        };
        const zoneWidth = Math.max(1, Math.floor(width * .38));
        const leftInformation = information(0, zoneWidth);
        const rightInformation = information(width - zoneWidth, width);
        let safeArea = "center";
        if (leftInformation < rightInformation * .86) safeArea = "left";
        else if (rightInformation < leftInformation * .86) safeArea = "right";
        let focusWeight = 0;
        let focusX = 0;
        let focusY = 0;
        let accentWeight = 0;
        let accent = [0, 0, 0];
        for (const sample of samples) {
          const x = sample.index % width;
          const y = Math.floor(sample.index / width);
          const difference = Math.sqrt(
            (sample.red - average[0]) ** 2 +
            (sample.green - average[1]) ** 2 +
            (sample.blue - average[2]) ** 2,
          ) / 441.7;
          const saliency = .03 + difference ** 1.35;
          focusX += (x / Math.max(1, width - 1)) * saliency;
          focusY += (y / Math.max(1, height - 1)) * saliency;
          focusWeight += saliency;
          const max = Math.max(sample.red, sample.green, sample.blue);
          const min = Math.min(sample.red, sample.green, sample.blue);
          const saturation = max ? (max - min) / max : 0;
          const usableLight = 1 - Math.min(1, Math.abs(sample.light - .46) / .54);
          const weight = saturation ** 2 * (.15 + usableLight);
          accent[0] += sample.red * weight;
          accent[1] += sample.green * weight;
          accent[2] += sample.blue * weight;
          accentWeight += weight;
        }
        const resolvedAccent = accentWeight > 1
          ? accent.map((channel) => Math.round(channel / accentWeight))
          : average.map((channel) => Math.round(channel));
        let resolvedFocusX = clamp(focusX / focusWeight);
        if (safeArea === "left") resolvedFocusX = Math.max(.64, resolvedFocusX);
        if (safeArea === "right") resolvedFocusX = Math.min(.36, resolvedFocusX);
        resolve({
          appearance: averageBrightness >= .58 ? "light" : "dark",
          accent: resolvedAccent,
          focusX: resolvedFocusX,
          focusY: clamp(focusY / focusWeight),
          aspect: image.naturalWidth / Math.max(1, image.naturalHeight),
          luma: clamp(averageBrightness),
          safeArea,
        });
      } catch {
        resolve(defaultProfile);
      }
    };
    image.onerror = () => resolve(defaultProfile);
    image.src = url;
  });

  const wallpaperState = { name: config.themeName, error: false };
  const wallpaperStoreKey = `theme:${config.themeId}`;
  let artGeneration = 0;
  const isCurrentInstall = () =>
    window[STATE_KEY]?.installToken === installToken && !window.__CODEX_DREAM_SKIN_DISABLED__;
  const updateWallpaperStatus = () => {
    if (!isCurrentInstall()) return;
    const output = document.querySelector?.("[data-dream-wallpaper-status]");
    if (!output) return;
    output.value = wallpaperState.name;
    output.textContent = wallpaperState.name;
    output.title = wallpaperState.name;
    output.classList?.toggle?.("is-error", wallpaperState.error);
  };
  const openWallpaperDatabase = () => new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("当前环境不支持本地壁纸存储"));
      return;
    }
    const request = window.indexedDB.open(WALLPAPER_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(WALLPAPER_STORE_NAME)) {
        database.createObjectStore(WALLPAPER_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("本地壁纸存储打开失败"));
  });
  const readSavedWallpaper = async () => {
    if (!window.indexedDB) return null;
    const database = await openWallpaperDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction(WALLPAPER_STORE_NAME, "readonly")
          .objectStore(WALLPAPER_STORE_NAME).get(wallpaperStoreKey);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  };
  const writeSavedWallpaper = async (record) => {
    const database = await openWallpaperDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(WALLPAPER_STORE_NAME, "readwrite");
        transaction.objectStore(WALLPAPER_STORE_NAME).put(record, wallpaperStoreKey);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  };
  const removeSavedWallpaper = async () => {
    if (!window.indexedDB) return;
    const database = await openWallpaperDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(WALLPAPER_STORE_NAME, "readwrite");
        transaction.objectStore(WALLPAPER_STORE_NAME).delete(wallpaperStoreKey);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  };
  const refreshProfileForArt = (url) => {
    activeArtUrl = url;
    const generation = ++artGeneration;
    profile = {
      ...defaultProfile,
      aspect: config.initialAspect ?? defaultProfile.aspect,
    };
    const root = document.documentElement;
    const state = window[STATE_KEY];
    if (state?.installToken === installToken) state.activeArtUrl = url;
    if (root?.classList?.contains?.("codex-dream-skin")) applyProfile(root);
    analyzeArt(url).then((result) => {
      const state = window[STATE_KEY];
      if (generation !== artGeneration || state?.installToken !== installToken ||
        window.__CODEX_DREAM_SKIN_DISABLED__) return;
      profile = result;
      state.profile = result;
      state.activeArtUrl = activeArtUrl;
      ensure();
    });
  };
  const applyLocalWallpaper = (record) => {
    if (!isCurrentInstall()) return false;
    if (localArtUrl) URL.revokeObjectURL(localArtUrl);
    localArtUrl = null;
    if (record?.blob instanceof Blob) {
      localArtUrl = URL.createObjectURL(record.blob);
      wallpaperState.name = record.name || "应用内壁纸";
      wallpaperState.error = false;
      refreshProfileForArt(localArtUrl);
    } else {
      wallpaperState.name = config.themeName;
      wallpaperState.error = false;
      refreshProfileForArt(injectedArtUrl);
    }
    const state = window[STATE_KEY];
    if (state) state.localArtUrl = localArtUrl;
    updateWallpaperStatus();
    return true;
  };
  const validateLocalWallpaper = async (file) => {
    if (!file || !LOCAL_WALLPAPER_TYPES.has(file.type)) {
      throw new Error("请选择 PNG、JPEG、WebP、GIF 或 AVIF 图片");
    }
    if (file.size < 1 || file.size > MAX_LOCAL_WALLPAPER_BYTES) {
      throw new Error("壁纸大小必须在 16 MB 以内");
    }
    const previewUrl = URL.createObjectURL(file);
    try {
      await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          const width = image.naturalWidth;
          const height = image.naturalHeight;
          if (width < 1 || height < 1 ||
            width > MAX_LOCAL_WALLPAPER_DIMENSION ||
            height > MAX_LOCAL_WALLPAPER_DIMENSION ||
            width * height > MAX_LOCAL_WALLPAPER_PIXELS) {
            reject(new Error("图片尺寸不能超过 16384px 或 5000 万像素"));
            return;
          }
          resolve();
        };
        image.onerror = () => reject(new Error("图片无法读取"));
        image.src = previewUrl;
      });
    } finally {
      URL.revokeObjectURL(previewUrl);
    }
  };
  const createControls = () => {
    const existing = document.getElementById(CONTROLS_ID);
    if (existing) return existing;
    const controls = document.createElement("div");
    controls.id = CONTROLS_ID;
    controls.innerHTML = `
      <section class="dream-controls__panel" hidden aria-label="Dream Skin 外观设置">
        <header class="dream-controls__header">
          <strong>Dream Skin</strong>
          <span>实时调节</span>
        </header>
        <label class="dream-control-row">
          <span>界面透明度</span>
          <input data-dream-setting="transparency" type="range" min="22" max="88" step="1">
          <output data-dream-output="transparency"></output>
        </label>
        <label class="dream-control-row">
          <span>背景亮度</span>
          <input data-dream-setting="brightness" type="range" min="55" max="115" step="1">
          <output data-dream-output="brightness"></output>
        </label>
        <label class="dream-control-row">
          <span>背景清晰度</span>
          <input data-dream-setting="sharpness" type="range" min="20" max="100" step="1">
          <output data-dream-output="sharpness"></output>
        </label>
        <label class="dream-switch-row">
          <span>动态氛围</span>
          <input data-dream-setting="motion" type="checkbox">
          <span class="dream-switch" aria-hidden="true"></span>
          <output data-dream-output="motion"></output>
        </label>
        <label class="dream-switch-row">
          <span>正文增强</span>
          <input data-dream-setting="readingMode" type="checkbox">
          <span class="dream-switch" aria-hidden="true"></span>
          <output data-dream-output="readingMode"></output>
        </label>
        <div class="dream-wallpaper-row">
          <input data-dream-wallpaper-input type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif">
          <button data-dream-wallpaper-select type="button">更换壁纸</button>
          <output data-dream-wallpaper-status aria-live="polite"></output>
        </div>
        <button class="dream-controls__reset" type="button">恢复当前主题</button>
      </section>
      <button class="dream-controls__toggle" type="button" title="调节 Dream Skin"
        aria-label="调节 Dream Skin" aria-expanded="false">
        <span aria-hidden="true">◐</span><span>外观</span>
      </button>
    `;
    if (typeof controls.querySelector !== "function") {
      controls.remove();
      return null;
    }
    const panel = controls.querySelector(".dream-controls__panel");
    const toggle = controls.querySelector(".dream-controls__toggle");
    const wallpaperInput = controls.querySelector("[data-dream-wallpaper-input]");
    const wallpaperSelect = controls.querySelector("[data-dream-wallpaper-select]");
    const syncControls = () => {
      for (const key of ["transparency", "brightness", "sharpness"]) {
        const input = controls.querySelector(`[data-dream-setting="${key}"]`);
        const output = controls.querySelector(`[data-dream-output="${key}"]`);
        input.value = String(userSettings[key]);
        output.value = `${userSettings[key]}%`;
      }
      for (const key of ["motion", "readingMode"]) {
        const input = controls.querySelector(`[data-dream-setting="${key}"]`);
        const output = controls.querySelector(`[data-dream-output="${key}"]`);
        input.checked = userSettings[key];
        output.value = userSettings[key] ? "开启" : "关闭";
      }
    };
    toggle.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute("aria-expanded", String(!panel.hidden));
    });
    controls.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || panel.hidden) return;
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      toggle.focus();
    });
    for (const key of ["transparency", "brightness", "sharpness"]) {
      controls.querySelector(`[data-dream-setting="${key}"]`).addEventListener("input", (event) => {
        userSettings[key] = Number(event.currentTarget.value);
        syncControls();
        applyUserSettings(document.documentElement);
      });
    }
    for (const key of ["motion", "readingMode"]) {
      controls.querySelector(`[data-dream-setting="${key}"]`).addEventListener("change", (event) => {
        userSettings[key] = Boolean(event.currentTarget.checked);
        syncControls();
        applyUserSettings(document.documentElement);
      });
    }
    wallpaperSelect.addEventListener("click", () => wallpaperInput.click());
    wallpaperInput.addEventListener("change", async () => {
      const file = wallpaperInput.files?.[0];
      wallpaperInput.value = "";
      if (!file) return;
      wallpaperSelect.disabled = true;
      wallpaperState.name = "正在保存…";
      wallpaperState.error = false;
      updateWallpaperStatus();
      try {
        await validateLocalWallpaper(file);
        if (!isCurrentInstall()) return;
        const record = {
          blob: file.slice(0, file.size, file.type),
          name: file.name,
          type: file.type,
          size: file.size,
          updatedAt: Date.now(),
        };
        await writeSavedWallpaper(record);
        if (!isCurrentInstall()) return;
        applyLocalWallpaper(record);
      } catch (error) {
        wallpaperState.name = error?.message || "壁纸更换失败";
        wallpaperState.error = true;
        updateWallpaperStatus();
      } finally {
        wallpaperSelect.disabled = false;
      }
    });
    controls.querySelector(".dream-controls__reset").addEventListener("click", async () => {
      try {
        await removeSavedWallpaper();
        if (!isCurrentInstall()) return;
        applyLocalWallpaper(null);
      } catch (error) {
        wallpaperState.name = error?.message || "恢复主题壁纸失败";
        wallpaperState.error = true;
        updateWallpaperStatus();
      }
    });
    syncControls();
    document.body.appendChild(controls);
    updateWallpaperStatus();
    return controls;
  };

  const detectShellAppearance = () => {
    const root = document.documentElement;
    const body = document.body;
    const classes = `${root?.className || ""} ${body?.className || ""}`
      .toLowerCase()
      .replace(/\bdream-theme-(?:dark|light)\b/g, "");
    if (/\b(dark|electron-dark|theme-dark|appearance-dark)\b/.test(classes)) return "dark";
    if (/\b(light|electron-light|theme-light|appearance-light)\b/.test(classes)) return "light";

    const dataTheme = (
      root?.getAttribute?.("data-theme") ||
      root?.getAttribute?.("data-appearance") ||
      root?.getAttribute?.("data-color-mode") ||
      body?.getAttribute?.("data-theme") ||
      body?.getAttribute?.("data-appearance") ||
      ""
    ).toLowerCase();
    if (dataTheme.includes("dark")) return "dark";
    if (dataTheme.includes("light")) return "light";

    try {
      const hadSkin = root?.classList?.contains?.("codex-dream-skin");
      const savedSkinClasses = hadSkin
        ? ROOT_CLASSES.filter((className) => root.classList.contains(className))
        : [];
      samplingNativeShell = true;
      if (hadSkin) root.classList.remove(...ROOT_CLASSES);
      try {
        const colorScheme = getComputedStyle(root).colorScheme || "";
        if (colorScheme.includes("dark") && !colorScheme.includes("light")) return "dark";
        if (colorScheme.includes("light") && !colorScheme.includes("dark")) return "light";
      } finally {
        if (hadSkin) root.classList.add(...savedSkinClasses);
        observer?.takeRecords?.();
        samplingNativeShell = false;
      }
    } catch {
      samplingNativeShell = false;
    }
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {}
    return "light";
  };

  const clearSkinDom = () => {
    const root = document.documentElement;
    root?.classList.remove(...ROOT_CLASSES);
    for (const property of ROOT_PROPERTIES) root?.style.removeProperty(property);
    document.querySelectorAll(".dream-home").forEach((node) => node.classList.remove("dream-home"));
    document.querySelectorAll(".dream-task").forEach((node) => node.classList.remove("dream-task"));
    document.querySelectorAll(".dream-home-shell").forEach((node) => node.classList.remove("dream-home-shell"));
    document.querySelectorAll(`.${HOME_UTILITY_CLASS}`).forEach((node) => node.classList.remove(HOME_UTILITY_CLASS));
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    document.getElementById(CONTROLS_ID)?.remove();
  };

  const applyProfile = (root) => {
    const focusX = config.focusX ?? profile.focusX;
    const focusY = config.focusY ?? profile.focusY;
    const appearance = config.appearance === "auto" ? detectShellAppearance() : config.appearance;
    const focus = focusX < .4 ? "left" : focusX > .6 ? "right" : "center";
    const safeArea = config.safeArea === "auto" ? (profile.safeArea ||
      (focus === "left" ? "right" : focus === "right" ? "left" : "center")) : config.safeArea;
    const taskMode = config.taskMode === "auto"
      ? profile.aspect >= 2.25 ? "banner" : "ambient"
      : config.taskMode;
    const accent = config.accent || `rgb(${profile.accent.join(" ")})`;
    const accentInk = luminance(...profile.accent) > .42 ? "rgb(26 24 28)" : "rgb(250 248 251)";
    root.classList.toggle("dream-theme-light", appearance === "light");
    root.classList.toggle("dream-theme-dark", appearance === "dark");
    root.classList.toggle("dream-art-wide", profile.aspect >= 1.75);
    root.classList.toggle("dream-art-standard", profile.aspect < 1.75);
    for (const value of ["left", "center", "right"]) {
      root.classList.toggle(`dream-focus-${value}`, focus === value);
    }
    for (const value of ["left", "center", "right", "none"]) {
      root.classList.toggle(`dream-safe-${value}`, safeArea === value);
    }
    for (const value of ["ambient", "banner", "off"]) {
      root.classList.toggle(`dream-task-${value}`, taskMode === value);
    }
    root.style.setProperty("--dream-art", `url("${activeArtUrl}")`);
    root.style.setProperty("--dream-art-position", `${Math.round(focusX * 100)}% ${Math.round(focusY * 100)}%`);
    root.style.setProperty("--dream-focus-x", String(focusX));
    root.style.setProperty("--dream-focus-y", String(focusY));
    root.style.setProperty("--dream-accent", accent);
    root.style.setProperty("--dream-accent-ink", accentInk);
    root.style.setProperty("--dream-image-luma", profile.luma.toFixed(3));
    applyUserSettings(root);
  };

  const ensure = () => {
    if (window.__CODEX_DREAM_SKIN_DISABLED__) return;
    const root = document.documentElement;
    if (!root || !document.body) return;

    const shellMain = document.querySelector("main.main-surface");
    const shellSidebar = document.querySelector("aside.app-shell-left-panel");
    if (!shellMain || !shellSidebar) {
      clearSkinDom();
      return;
    }

    root.classList.add("codex-dream-skin");
    applyProfile(root);

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || root).appendChild(style);
    }
    if (style.dataset.dreamVersion !== "4") {
      style.textContent = cssText;
      style.dataset.dreamVersion = "4";
    }

    const home = document.querySelector('[role="main"]:has([data-testid="home-icon"])');
    for (const candidate of document.querySelectorAll('[role="main"]')) {
      candidate.classList.toggle("dream-home", candidate === home);
      candidate.classList.toggle("dream-task", candidate !== home);
    }
    const utilityBars = new Set(home ? home.querySelectorAll('[class*="_homeUtilityBar_"]') : []);
    for (const candidate of document.querySelectorAll(`.${HOME_UTILITY_CLASS}`)) {
      if (!utilityBars.has(candidate)) candidate.classList.remove(HOME_UTILITY_CLASS);
    }
    for (const candidate of utilityBars) candidate.classList.add(HOME_UTILITY_CLASS);
    shellMain.classList.toggle("dream-home-shell", Boolean(home));

    let chrome = document.getElementById(CHROME_ID);
    if (!chrome || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.setAttribute("aria-hidden", "true");
      document.body.appendChild(chrome);
    }
    if (chrome.dataset.dreamMotionVersion !== "1") {
      chrome.innerHTML = `
        <span class="dream-ambient dream-ambient--dust-near"></span>
        <span class="dream-ambient dream-ambient--dust-far"></span>
        <span class="dream-ambient dream-ambient--glow-primary"></span>
        <span class="dream-ambient dream-ambient--glow-soft"></span>
      `;
      chrome.dataset.dreamMotionVersion = "1";
    }
    chrome.classList.toggle("dream-home-shell", Boolean(home));
    createControls();
  };

  const cleanup = () => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken) return false;
    window.__CODEX_DREAM_SKIN_DISABLED__ = true;
    clearSkinDom();
    state?.observer?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    for (const url of new Set([
      state?.artUrl,
      state?.injectedArtUrl,
      state?.localArtUrl,
    ].filter(Boolean))) URL.revokeObjectURL(url);
    delete window[STATE_KEY];
    return true;
  };

  const scheduler = { timeout: null };
  const scheduleEnsure = () => {
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.timeout = setTimeout(() => {
      scheduler.timeout = null;
      ensure();
    }, 180);
  };
  observer = new MutationObserver(() => {
    if (samplingNativeShell) return;
    scheduleEnsure();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "data-theme", "data-appearance", "data-color-mode"],
  });
  const timer = setInterval(ensure, 5000);
  window[STATE_KEY] = {
    ensure,
    cleanup,
    observer,
    timer,
    scheduler,
    artUrl: injectedArtUrl,
    injectedArtUrl,
    localArtUrl,
    activeArtUrl,
    profile,
    config,
    userSettings,
    installToken,
    version: "1.3.0",
  };
  ensure();
  refreshProfileForArt(activeArtUrl);
  void readSavedWallpaper().then((record) => {
    if (!isCurrentInstall()) return;
    if (record) applyLocalWallpaper(record);
  }).catch((error) => {
    wallpaperState.name = error?.message || "本地壁纸读取失败";
    wallpaperState.error = true;
    updateWallpaperStatus();
  });
  return { installed: true, version: "1.3.0", adaptive: true, controls: true };
})(__DREAM_CSS_JSON__, __DREAM_ART_JSON__, __DREAM_THEME_JSON__)
