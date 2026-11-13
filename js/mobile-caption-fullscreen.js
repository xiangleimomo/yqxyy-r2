/* Keep Story Fox's own karaoke captions visible on mobile fullscreen.
 * Never open the <video> itself in native fullscreen: that surface excludes
 * HTML captions and word-timing overlays on several mobile browsers.
 */
(function(){
  'use strict';
  const formatTime = seconds => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const time = Math.floor(seconds);
    return Math.floor(time / 60) + ':' + String(time % 60).padStart(2, '0');
  };
  const coarsePointer = () => !!((window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
    (window.navigator && window.navigator.maxTouchPoints > 0));
  // Only the installed Android WebView receives the orientation bridge.
  // Ordinary Android browsers keep their existing CSS-fullscreen behavior.
  const installedAndroidApp = /YQXYYAndroid\\//.test(String(window.navigator?.userAgent || ''));
  if (installedAndroidApp) document.documentElement.classList.add('sf-android-app');
  const rotateInstalledApp = enter => {
    if (!installedAndroidApp) return;
    // Android intercepts this main-frame custom scheme without navigating.
    window.location.href = 'yqxyy-app://fullscreen/' + (enter ? 'enter' : 'exit');
  };
  const mobileEnvironment = () => {
    // Some Android browsers report zero touch points in "desktop site" mode.
    const agent = String(window.navigator?.userAgent || '');
    const platform = String(window.navigator?.platform || '');
    return /Android|iPhone|iPad|iPod|Mobile|HarmonyOS|Quark|UCBrowser|QQBrowser|HuaweiBrowser|VivoBrowser|MicroMessenger/i.test(agent) ||
      (/Mac/i.test(platform) && Number(window.navigator?.maxTouchPoints || 0) > 1) ||
      coarsePointer();
  };
  function button(className, label, text) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = className;
    node.setAttribute('aria-label', label);
    node.textContent = text;
    return node;
  }
  function attach({stage, player, trigger, showControls}) {
    if (!stage || !player || !trigger || stage._sfFullscreenBound) return;
    stage._sfFullscreenBound = true;
    let placeholder = null;
    let pseudo = false;
    const isMobile = mobileEnvironment() || !!window.MobileApp?.active;
    const isFull = () => pseudo || document.fullscreenElement === stage;
    const updateButton = () => {
      const full = isFull();
      trigger.classList.toggle('is-fullscreen', full);
      trigger.setAttribute('aria-label', full ? '退出全屏' : '全屏观看（保留逐词高亮字幕）');
      if (trigger.matches?.('[data-act="fullscreen"]')) {
        const icon = trigger.querySelector('span');
        const caption = trigger.querySelector('small');
        if (icon) icon.textContent = full ? '×' : '⛶';
        if (caption) caption.textContent = full ? '退出' : '全屏';
      } else {
        const label = trigger.querySelector('span');
        if (label) label.textContent = full ? '退出' : (isMobile ? '网页全屏' : '全屏');
      }
      if (mobileFullscreenButton) mobileFullscreenButton.setAttribute('aria-label', full ? '退出全屏' : '全屏观看（保留字幕）');
    };
    const restore = () => {
      if (!pseudo) return;
      pseudo = false;
      stage.classList.remove('subtitle-page-fullscreen');
      // Captions stay in the shared video overlay on touch devices.
      document.documentElement.classList.remove('sf-caption-screen-locked');
      document.body.classList.remove('sf-caption-screen-locked');
      rotateInstalledApp(false);
      if (placeholder && placeholder.isConnected) placeholder.replaceWith(stage);
      else stage.remove(); // The lesson was closed while mobile fullscreen was active.
      placeholder = null;
      updateButton();
    };
    const enterPseudo = () => {
      if (!stage.isConnected) return;
      placeholder = document.createComment('storyfox-caption-fullscreen-placeholder');
      stage.replaceWith(placeholder);
      document.body.appendChild(stage); // Escape transformed/clipped floating windows.
      pseudo = true;
      stage.classList.remove('sf-caption-below');
      stage.classList.add('subtitle-page-fullscreen');
      document.documentElement.classList.add('sf-caption-screen-locked');
      document.body.classList.add('sf-caption-screen-locked');
      rotateInstalledApp(true);
      updateButton();
      showControls?.();
    };
    const exit = async () => {
      if (pseudo) restore();
      else if (document.fullscreenElement === stage && document.exitFullscreen) {
        try { await document.exitFullscreen(); } catch {}
      }
      updateButton();
    };
    const toggle = async () => {
      if (isFull()) { await exit(); return; }
      // Some mobile browsers convert even parent Fullscreen API into their
      // native video player, which cannot show external word-highlight HTML.
      // Always use viewport CSS fullscreen when this is a mobile environment.
      if (isMobile) { enterPseudo(); return; }
      // Desktop uses ordinary stage fullscreen with the caption inside.
      if (typeof stage.requestFullscreen === 'function') {
        try {
          await stage.requestFullscreen();
          if (document.fullscreenElement === stage) { updateButton(); showControls?.(); return; }
        } catch {}
      }
      // iPhone Safari and embedded browsers may only allow <video> fullscreen.
      // Use a body-level fixed stage instead; it retains clickable HTML words.
      enterPseudo();
    };
    trigger.addEventListener('click', () => { void toggle(); });
    const onChange = () => {
      if (!pseudo) updateButton();
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && pseudo) { event.preventDefault(); restore(); }
    });
    window.addEventListener('hashchange', () => { if (pseudo) restore(); });
    // The phone's system Back button must close landscape fullscreen first.
    window.addEventListener('sf-android-back', () => { if (pseudo) restore(); });
    // Some iOS browsers force <video> fullscreen even with playsinline.
    // Inline custom controls avoid offering the native fullscreen button.
    player.setAttribute('playsinline', '');
    player.setAttribute('webkit-playsinline', '');
    player.setAttribute('x5-playsinline', '');
    player.setAttribute('x5-video-player-type', 'h5');
    player.setAttribute('controlslist', 'nofullscreen noremoteplayback');
    player.setAttribute('disablepictureinpicture', '');
    let mobileFullscreenButton = null;
    const movieToolbar = !!player.closest('.sf-movie-lesson-player')?.querySelector('.sf-lesson-toolbar');
    if (!isMobile) {
      // Movie lessons already have desktop cinema controls. Re-enabling
      // browser controls here adds a second bar, especially while paused.
      player.controls = !movieToolbar;
      if (movieToolbar) player.removeAttribute('controls');
      else player.setAttribute('controls', '');
    }
    // Playback controls are provided by SFDesktopPlayer on every viewport.
    updateButton();
    return {toggle, exit, isFull};
  }
  window.SFCaptionFullscreen = {attach};
})();
