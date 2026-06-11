const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
let ws;
const colorThief = new ColorThief();

let currentThumbnail = "";
let serverPosition = 0;
let localPosition = 0;
let duration = 0;
let lastSyncTime = performance.now();
let isPlaying = false;
let swipeLock = false;

function connect() {
  ws = new WebSocket(wsUrl);
  ws.onmessage = (event) => updateUI(normalizeSongInfo(JSON.parse(event.data)));
  ws.onclose = () => setTimeout(connect, 2000);
  ws.onerror = (err) => {
    console.error("WS error:", err);
    ws.close();
  };
}

function normalizeSongInfo(data) {
  if (
    "position_secs" in data ||
    "length_secs" in data ||
    "album_art_base64" in data
  ) {
    const albumArt = data.album_art_base64 || "";
    return {
      title: data.title || "",
      artist: data.artist || "",
      status: data.is_playing ? "PLAYING" : "PAUSED",
      position: data.position_secs || 0,
      duration: data.length_secs || 0,
      layout: "dynamic",
      alignment: "bottom-right",
      animation: "swipe",
      thumbnail: albumArt ? `data:image/png;base64,${albumArt}` : "",
    };
  }

  return data;
}

function updateUI(data) {
  const wasPlaying = isPlaying;
  isPlaying = data.status === "PLAYING";
  duration = data.duration;
  const animMode = data.animation || "swipe";
  if (!document.body.classList.contains("anim-mode-" + animMode)) {
    document.body.classList.remove("anim-mode-smooth", "anim-mode-swipe");
    document.body.classList.add("anim-mode-" + animMode);
  }

  let activeLayout = data.layout;
  let songChanged = false;
  let titleEl = document.getElementById("w-title");
  if (titleEl && titleEl.innerText !== data.title) {
    songChanged = true;
  }

  if (activeLayout === "dynamic") {
    if (songChanged || !window.dynamicTimer) {
      activeLayout = "compact";
      if (window.dynamicTimer) clearTimeout(window.dynamicTimer);
      window.dynamicTimer = setTimeout(() => {
        document.body.className =
          "thin " + (data.alignment || "") + " anim-mode-" + animMode;
        morphLayout();
      }, 6000);
    } else {
      if (document.body.classList.contains("compact")) activeLayout = "compact";
      else if (document.body.classList.contains("thin")) activeLayout = "thin";
      else activeLayout = "compact";
    }
  } else {
    if (window.dynamicTimer) {
      clearTimeout(window.dynamicTimer);
      window.dynamicTimer = null;
    }
  }

  if (activeLayout || data.alignment) {
    let currentClasses = Array.from(document.body.classList).filter(
      (c) => c !== "anim-mode-smooth" && c !== "anim-mode-swipe",
    );
    let newClasses = [];
    if (activeLayout && activeLayout !== "dynamic")
      newClasses.push(activeLayout);
    if (data.alignment) newClasses.push(data.alignment);

    let shouldUpdate = false;
    if (currentClasses.length !== newClasses.length) shouldUpdate = true;
    else {
      currentClasses.sort();
      const newSorted = [...newClasses].sort();
      for (let i = 0; i < currentClasses.length; i++) {
        if (currentClasses[i] !== newSorted[i]) shouldUpdate = true;
      }
    }

    if (shouldUpdate) {
      document.body.className = newClasses.join(" ") + " anim-mode-" + animMode;
      morphLayout();
    }
  }

  if (data.position !== serverPosition || isPlaying !== wasPlaying) {
    serverPosition = data.position;
    localPosition = data.position;
    lastSyncTime = performance.now();
  }

  document.querySelectorAll(".js-play-path").forEach((el) => {
    if (isPlaying) el.setAttribute("d", "M6 19h4V5H6v14zm8-14v14h4V5h-4z");
    else el.setAttribute("d", "M8 5v14l11-7z");
  });

  if (songChanged) {
    if (animMode === "swipe" && !swipeLock) {
      triggerSwipe(data.title, data.artist);
    } else if (animMode === "smooth") {
      triggerSmooth(data.title, data.artist);
    }
  }

  document.getElementById("w-duration").innerText = formatTime(duration);

  if (data.thumbnail && data.thumbnail !== currentThumbnail) {
    currentThumbnail = data.thumbnail;
    let img = document.getElementById("w-art");
    img.crossOrigin = "Anonymous";
    img.src = currentThumbnail;
    img.onload = () => extractAccentColor(img);
  } else if (!data.thumbnail && currentThumbnail !== "") {
    currentThumbnail = "";
    document.getElementById("w-art").src = "";
    resetAccentColor();
  }
}

function triggerSwipe(newTitle, newArtist) {
  swipeLock = true;
  const bar = document.getElementById("w-swipe-bar");
  syncSwipeBarWidth();
  bar.classList.remove("swipe-active");
  void bar.offsetWidth;
  bar.classList.add("swipe-active");
  setTimeout(() => {
    document.getElementById("w-title").innerText = newTitle;
    document.getElementById("w-artist").innerText = newArtist;
    morphLayout();
  }, 250);
  setTimeout(() => {
    bar.classList.remove("swipe-active");
    swipeLock = false;
  }, 520);
}

function triggerSmooth(newTitle, newArtist) {
  document.querySelectorAll(".anim-morph").forEach((el) => {
    if (el.id === "w-title-box" || el.id === "w-artist-box") {
      el.classList.add("slide-up");
    }
  });
  setTimeout(() => {
    document.getElementById("w-title").innerText = newTitle;
    document.getElementById("w-artist").innerText = newArtist;
    document
      .querySelectorAll(".anim-morph")
      .forEach((el) => el.classList.remove("slide-up"));
    morphLayout();
  }, 350);
}

function syncSwipeBarWidth() {
  const bar = document.getElementById("w-swipe-bar");
  const titleBox = document.getElementById("w-title-box");
  const artistBox = document.getElementById("w-artist-box");
  const sep = document.getElementById("w-separator");

  if (document.body.classList.contains("large")) {
    bar.style.width = "380px";
  } else {
    const tLeft = parseInt(titleBox.style.left) || 70;
    const aLeft = parseInt(artistBox.style.left) || 0;
    const aWidth = parseInt(artistBox.style.width) || 0;
    bar.style.left = tLeft + "px";
    bar.style.width = aLeft + aWidth - tLeft + "px";
  }
}

function morphLayout() {
  const wrapper = document.getElementById("widget-wrapper");
  const titleBox = document.getElementById("w-title-box");
  const title = document.getElementById("w-title");
  const artistBox = document.getElementById("w-artist-box");
  const artist = document.getElementById("w-artist");
  const sep = document.getElementById("w-separator");
  const progBg = document.getElementById("w-prog-bg");

  if (!wrapper || !titleBox || !title) return;

  const textWBoxMax = 140;

  let tWidth = Math.min(title.offsetWidth, textWBoxMax);
  let aWidth = Math.min(artist.offsetWidth, textWBoxMax);

  if (title.offsetWidth > textWBoxMax) title.classList.add("scroll-active");
  else title.classList.remove("scroll-active");

  if (artist.offsetWidth > textWBoxMax) artist.classList.add("scroll-active");
  else artist.classList.remove("scroll-active");

  if (document.body.classList.contains("large")) {
    wrapper.style.width = "380px";
    wrapper.style.height = "320px";
    titleBox.style.width = "340px";
    artistBox.style.width = "340px";
    titleBox.style.left = "20px";
    artistBox.style.left = "20px";

    title.classList.remove("scroll-active");
    artist.classList.remove("scroll-active");
    if (title.offsetWidth > 340) title.classList.add("scroll-active");
    if (artist.offsetWidth > 340) artist.classList.add("scroll-active");

    progBg.style.width = "256px";
  } else if (document.body.classList.contains("compact")) {
    let currentLeft = 70;

    titleBox.style.left = currentLeft + "px";
    titleBox.style.width = tWidth + "px";
    currentLeft += tWidth + 8;

    sep.style.left = currentLeft + "px";
    currentLeft += sep.offsetWidth + 8;

    artistBox.style.left = currentLeft + "px";
    artistBox.style.width = aWidth + "px";
    currentLeft += aWidth;

    let totalWidth = currentLeft + 15;
    wrapper.style.width = totalWidth + "px";
    wrapper.style.height = "60px";

    progBg.style.left = "70px";
    progBg.style.width = totalWidth - 70 - 15 + "px";
  } else if (document.body.classList.contains("thin")) {
    let currentLeft = 45;

    titleBox.style.left = currentLeft + "px";
    titleBox.style.width = tWidth + "px";
    currentLeft += tWidth + 8;

    sep.style.left = currentLeft + "px";
    currentLeft += sep.offsetWidth + 8;

    artistBox.style.left = currentLeft + "px";
    artistBox.style.width = aWidth + "px";
    currentLeft += aWidth + 15;

    const dots = document.getElementById("w-bg-dots");
    dots.style.left = currentLeft + "px";
    currentLeft += dots.offsetWidth + 15;

    progBg.style.left = currentLeft + "px";
    progBg.style.width = "40px";
    currentLeft += 40;

    let totalWidth = currentLeft + 15;
    wrapper.style.width = totalWidth + "px";
    wrapper.style.height = "40px";
  }
}

function tick() {
  if (isPlaying && duration > 0) {
    const now = performance.now();
    const deltaSec = (now - lastSyncTime) / 1000.0;
    localPosition = serverPosition + deltaSec;
    if (localPosition > duration) localPosition = duration;
    updateProgressBar(localPosition, duration);
  } else {
    updateProgressBar(localPosition, duration);
  }
  requestAnimationFrame(tick);
}

function updateProgressBar(position, total) {
  let ratio = 0;
  if (total > 0) ratio = Math.min(position / total, 1.0);

  let el = document.getElementById("w-prog-fill");
  if (el) el.style.width = `${ratio * 100}%`;

  el = document.getElementById("w-time");
  if (el) el.innerText = formatTime(position);
}

function formatTime(secs) {
  if (!secs || secs < 0) return "0:00";
  const totalSeconds = Math.floor(secs);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function extractAccentColor(img) {
  if (img.complete) {
    try {
      const rgb = colorThief.getColor(img);
      if (rgb) {
        const r = rgb[0],
          g = rgb[1],
          b = rgb[2];
        let accR = r,
          accG = g,
          accB = b;
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        if (luminance < 120) {
          accR = Math.min(255, r + 120);
          accG = Math.min(255, g + 120);
          accB = Math.min(255, b + 120);
        }
        document.documentElement.style.setProperty(
          "--accent-color",
          `rgb(${accR}, ${accG}, ${accB})`,
        );
        const bgR = Math.min(255, Math.floor(r * 0.12 + 10));
        const bgG = Math.min(255, Math.floor(g * 0.12 + 10));
        const bgB = Math.min(255, Math.floor(b * 0.12 + 10));
        document.documentElement.style.setProperty(
          "--bg-color",
          `rgba(${bgR}, ${bgG}, ${bgB}, 0.92)`,
        );
      }
    } catch (e) {}
  }
}

function resetAccentColor() {
  document.documentElement.style.setProperty("--accent-color", "#ee6c4d");
  document.documentElement.style.setProperty(
    "--bg-color",
    "rgba(10, 10, 10, 0.92)",
  );
}

const resizeObserver = new ResizeObserver(() => {
  morphLayout();
});
setTimeout(() => {
  resizeObserver.observe(document.getElementById("w-title"));
  resizeObserver.observe(document.getElementById("w-artist"));
}, 100);

connect();
requestAnimationFrame(tick);
setTimeout(morphLayout, 200);
