// HUD: health bar, ammo, round timer, round score, money, crosshair,
// hitmarker, round banner and the start / pause / round-end overlay.
// All updates are text or style writes on cached elements; no DOM built
// per frame. Money is shown now; the buy menu spends it in Stage 2.
export function createHud() {
  const el = (id) => document.getElementById(id);
  const healthFill = el('health-fill');
  const healthValue = el('health-value');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const ammoBox = el('ammo');
  const timerValue = el('timer-value');
  const scoreEmber = el('score-ember');
  const scoreSlate = el('score-slate');
  const moneyValue = el('money-value');
  const hitmarker = el('hitmarker');
  const banner = el('banner');
  const bannerTitle = el('banner-title');
  const bannerCopy = el('banner-copy');
  const overlay = el('overlay');
  const overlayTitle = el('overlay-title');
  const overlayCopy = el('overlay-copy');
  const playButton = el('play');
  const feed = el('feed');
  let hitTimer = null;

  function formatTime(seconds) {
    const left = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(left / 60);
    const rest = left % 60;
    return `${minutes}:${rest.toString().padStart(2, '0')}`;
  }

  return {
    setHealth(health) {
      healthFill.style.width = `${health}%`;
      healthValue.textContent = String(Math.round(health));
      healthFill.classList.toggle('low', health <= 30);
    },
    setAmmo(mag, reserve) {
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammoBox.classList.toggle('empty', mag === 0);
    },
    setTimer(seconds) {
      timerValue.textContent = formatTime(seconds);
    },
    setScore(ember, slate) {
      scoreEmber.textContent = String(ember);
      scoreSlate.textContent = String(slate);
    },
    setMoney(money) {
      moneyValue.textContent = `$${money}`;
    },
    hitMarker(kill) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', kill);
      if (hitTimer) clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), kill ? 220 : 120);
    },
    showBanner(title, copy) {
      bannerTitle.textContent = title;
      bannerCopy.textContent = copy;
      banner.hidden = false;
    },
    hideBanner() {
      banner.hidden = true;
    },
    showOverlay(mode, score) {
      overlay.hidden = false;
      if (mode === 'paused') {
        overlayTitle.textContent = 'Paused';
        overlayCopy.textContent = 'Click to keep playing. The round is still running.';
        playButton.textContent = 'Resume';
      } else if (mode === 'end') {
        overlayTitle.textContent = 'Round over';
        overlayCopy.textContent = `Score ${score}. Click to play the next round.`;
        playButton.textContent = 'Next round';
      } else {
        overlayTitle.textContent = 'EMBERLINE';
        overlayCopy.textContent = 'Foundry Yard. Ember versus Slate, first to 5 rounds. Click to play.';
        playButton.textContent = 'Click to play';
      }
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    feedLine(text) {
      const line = document.createElement('div');
      line.textContent = text;
      feed.prepend(line);
      while (feed.children.length > 3) feed.removeChild(feed.lastChild);
    },
    onPlay(handler) {
      playButton.addEventListener('click', handler);
    },
  };
}
