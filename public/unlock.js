const dialog = document.querySelector('#unlock-dialog');
if (dialog) {
  const error = document.querySelector('#unlock-error');
  const buttons = [...dialog.querySelectorAll('[data-task]')];
  const progress = document.querySelector('#unlock-progress');
  const reveal = document.querySelector('#reveal-script');
  const state = buttons.map(() => ({ started: false, readyAt: null, done: false, busy: false, remainingMs: 40000 }));
  let activeTimer;
  let rawUrl;
  let activeVideo;
  let youtubeReady;

  function status(index, hint, spinning = false, icon = '→') {
    const button = buttons[index];
    button.querySelector('.task-hint').textContent = hint;
    const indicator = button.querySelector('.task-status');
    indicator.textContent = spinning ? '' : icon;
    button.toggleAttribute('aria-busy', spinning);
    if (spinning) {
      button.setAttribute('aria-busy', 'true');
      const spinner = document.createElement('span');
      spinner.className = 'task-spinner';
      indicator.append(spinner);
    }
  }

  async function api(action, index, extra = {}) {
    const response = await fetch(`/api/unlock/${dialog.dataset.token}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ index, ...extra }), keepalive: true });
    let result;
    try { result = await response.json(); } catch {
      throw new Error(response.status === 403 ? 'Your session changed. Reload the page and try again.' : response.status === 429 ? 'Too many requests. Please wait a minute and try again.' : 'Unable to connect. Please try again later.');
    }
    if (!response.ok) throw new Error(result.error || 'Something went wrong.');
    return result;
  }

  function loadYouTube() {
    if (window.YT?.Player) return Promise.resolve();
    if (!youtubeReady) youtubeReady = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => reject(new Error('YouTube did not load. Check your connection and click the video task to retry.')), 15000);
      window.onYouTubeIframeAPIReady = () => { clearTimeout(timeout); resolve(); };
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => { clearTimeout(timeout); reject(new Error('Unable to load YouTube. Click the video task to retry.')); };
      document.head.append(script);
    }).catch(failure => { youtubeReady = null; throw failure; });
    return youtubeReady;
  }

  function videoHint(video) {
    if (state[video.index].done || video.failed) return;
    if (!video.hasPlayed) {
      status(video.index, 'Click the play button on the video above to start watching.', false, '▷');
      return;
    }
    const left = Math.ceil(state[video.index].remainingMs / 1000);
    const playbackState = video.player?.getPlayerState?.();
    const message = video.playing ? 'Keep watching…' : playbackState === 2 ? 'Paused — press play to continue' : playbackState === 3 ? 'Buffering…' : playbackState === 0 ? 'Video ended — replay to continue' : 'Press play to continue';
    status(video.index, `${message} · ${left}s left`, video.playing, video.playing ? '' : '▷');
  }

  async function syncPlayback(video) {
    if (video.disposed || video.failed || (!state[video.index].started && !video.playing)) return;
    if (video.syncing) { video.pending = true; return; }
    video.syncing = true;
    try {
      const current = state[video.index];
      if (!current.started) {
        await api('start', video.index);
        current.started = true;
      }
      const playing = video.playing && dialog.open && !document.hidden;
      const result = await api('playback', video.index, { playing });
      error.textContent = '';
      current.remainingMs = result.remainingMs;
      videoHint(video);
      if (result.remainingMs === 0) await finish(video.index);
    } catch (failure) {
      video.failed = true;
      video.playing = false;
      video.player?.pauseVideo?.();
      error.textContent = failure.message;
      status(video.index, 'Connection interrupted — press play to retry', false, '↻');
    } finally {
      video.syncing = false;
      if (video.pending) { video.pending = false; syncPlayback(video); }
    }
  }

  async function prepareVideo(index) {
    const button = buttons[index];
    if (button.dataset.type !== 'watch' || state[index].done) return;
    const container = document.querySelector(`#task-video-${index}`);
    container.hidden = false;
    if (!button.dataset.videoId) {
      error.textContent = 'This video link cannot be embedded. Please ask the admin to update it.';
      status(index, 'A direct YouTube video link is required', false, '!');
      return;
    }
    if (activeVideo?.index === index && (activeVideo.loading || activeVideo.player)) return;
    const video = activeVideo = { index, playing: false, syncing: false, failed: false, loading: true };
    status(index, 'Loading video…', true);
    try {
      await loadYouTube();
      const frame = container.querySelector('iframe');
      frame.src = `https://www.youtube-nocookie.com/embed/${button.dataset.videoId}?${new URLSearchParams({ enablejsapi: '1', origin: location.origin, playsinline: '1', rel: '0' })}`;
      video.player = new window.YT.Player(frame.id, { events: {
        onReady() { videoHint(video); },
        onStateChange(event) {
          if (video.disposed) return;
          video.playing = event.data === 1;
          if (video.playing && (!dialog.open || document.hidden)) { video.player.pauseVideo(); video.playing = false; }
          if (video.playing) video.hasPlayed = true;
          video.failed = false;
          videoHint(video);
          syncPlayback(video);
        },
        onError() {
          video.playing = false;
          syncPlayback(video);
          video.failed = true;
          error.textContent = 'YouTube cannot play this video here. Please ask the admin to check the video and allow embedding.';
          status(index, 'Video unavailable', false, '!');
        },
      } });
      video.timer = setInterval(() => { if (video.playing) syncPlayback(video); }, 1000);
    } catch (failure) {
      video.failed = true;
      error.textContent = failure.message;
      status(index, 'Video could not load — click to retry', false, '↻');
    } finally { video.loading = false; }
  }

  function pauseVideo() {
    if (!activeVideo || activeVideo.disposed) return;
    activeVideo.playing = false;
    activeVideo.player?.pauseVideo?.();
    videoHint(activeVideo);
    syncPlayback(activeVideo);
  }

  document.querySelector('#open-unlock').addEventListener('click', () => {
    dialog.showModal();
    const next = state.findIndex(task => !task.done);
    if (next >= 0) prepareVideo(next);
  });
  document.querySelector('#close-unlock').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', pauseVideo);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseVideo(); });
  window.addEventListener('pagehide', pauseVideo);

  async function finish(index) {
    const current = state[index];
    if (current.busy || current.done) return;
    current.busy = true;
    try {
      const result = await api('complete', index);
      current.done = true;
      buttons[index].disabled = true;
      buttons[index].classList.replace('current', 'completed');
      status(index, 'Completed', false, '✓');
      buttons[index].closest('.task-step').hidden = true;
      progress.setAttribute('aria-valuenow', result.next);
      [...progress.children].forEach((segment, position) => segment.classList.toggle('completed', position < result.next));
      document.querySelector('#progress-label').textContent = `${result.next} / ${buttons.length}`;
      if (activeVideo?.index === index) {
        activeVideo.disposed = true;
        clearInterval(activeVideo.timer);
        activeVideo.player?.destroy();
        document.querySelector(`#task-video-${index}`).hidden = true;
      }
      if (result.done) {
        document.querySelector('#unlock-title').textContent = 'Tasks completed';
        dialog.querySelector('.dialog-intro').textContent = 'All tasks are complete. Your script is ready.';
        reveal.disabled = false;
        reveal.textContent = 'Unlock & get script →';
        reveal.focus();
      } else {
        buttons[result.next].closest('.task-step').hidden = false;
        buttons[result.next].disabled = false;
        buttons[result.next].classList.add('current');
        status(result.next, buttons[result.next].dataset.type === 'watch' ? 'Click the play button on the video above to start watching.' : 'Click to start');
        buttons[result.next].focus({ preventScroll: true });
        prepareVideo(result.next);
        buttons[result.next].closest('.task-step').scrollIntoView({ block: 'nearest' });
      }
    } catch (failure) {
      error.textContent = failure.message;
      buttons[index].disabled = false;
      status(index, 'Click to retry', false, '↻');
      if (activeVideo?.index === index) {
        activeVideo.failed = true;
        activeVideo.playing = false;
        activeVideo.player?.pauseVideo?.();
      }
    } finally { current.busy = false; }
  }

  buttons.forEach((button, index) => button.addEventListener('click', async () => {
    error.textContent = '';
    const current = state[index];
    if (current.busy || current.done) return;
    if (button.dataset.type === 'watch') {
      await prepareVideo(index);
      return;
    }
    if (current.started && Date.now() >= current.readyAt) { await finish(index); return; }
    // Open synchronously from the click so browsers allow reopening a waiting task.
    const taskTab = window.open('about:blank', '_blank');
    if (!taskTab) { error.textContent = 'Allow pop-ups to start this task, then try again.'; return; }
    taskTab.opener = null;
    current.busy = true;
    button.disabled = true;
    status(index, 'Waiting for completion…', true);
    try {
      const result = await api('start', index);
      taskTab.location.replace(result.url);
      current.started = true;
      current.readyAt = Date.now() + result.remainingMs;
      current.busy = false;
      button.disabled = false;
      clearInterval(activeTimer);
      const tick = () => {
        if (Date.now() >= current.readyAt) { clearInterval(activeTimer); finish(index); }
      };
      activeTimer = setInterval(tick, 250);
      tick();
    } catch (failure) {
      taskTab.close();
      error.textContent = failure.message;
      button.disabled = false;
      status(index, 'Click to retry', false, '↻');
      current.busy = false;
    }
  }));

  reveal.addEventListener('click', async () => {
    reveal.disabled = true;
    try {
      const result = await api('code');
      const isLink = Boolean(result.url);
      document.querySelector('#code-result').hidden = isLink;
      document.querySelector('#get-script').hidden = !isLink;
      if (isLink) {
        document.querySelector('#get-script').href = result.url;
      } else {
      document.querySelector('#script-content').textContent = result.code;
      if (rawUrl) URL.revokeObjectURL(rawUrl);
      rawUrl = URL.createObjectURL(new Blob([result.code], { type: 'text/plain;charset=utf-8' }));
      document.querySelector('#raw-script').href = rawUrl;
      }
      document.querySelector('#locked-code').hidden = true;
      document.querySelector('#unlocked-code').hidden = false;
      dialog.close();
      document.querySelector(isLink ? '#get-script' : '#copy-script').focus();
      notify('Your script is unlocked!');
    } catch (failure) { error.textContent = failure.message; reveal.disabled = false; }
  });
  document.querySelector('#copy-script').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(document.querySelector('#script-content').textContent); notify('Script copied to clipboard.'); }
    catch { notify('Clipboard is unavailable. Select the code and copy it manually.'); }
  });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
}
