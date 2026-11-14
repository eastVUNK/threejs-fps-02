// HUD: health bar, ammo, round timer, round score, money, team alive counts,
// bomb status, grenade count, plant/defuse progress, crosshair, hitmarker,
// round banner, screen flash, and the start / pause / round-end overlay plus
// the buy menu. All updates are text or style writes on cached elements;
// no DOM is built per frame. The buy menu rows are filled once per buy
// phase by showBuyMenu.
import { WEAPONS, ARMOR_PRICE, GRENADE_PRICE } from './weapons.js';

export function createHud() {
  const el = (id) => document.getElementById(id);
  const healthFill = el('health-fill');
  const healthValue = el('health-value');
  const armorValue = el('armor-value');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const ammoBox = el('ammo');
  const timerValue = el('timer-value');
  const scoreEmber = el('score-ember');
  const scoreSlate = el('score-slate');
  const aliveEmber = el('alive-ember');
  const aliveSlate = el('alive-slate');
  const moneyValue = el('money-value');
  const bombStatus = el('bomb-status');
  const grenadeValue = el('grenade-value');
  const hitmarker = el('hitmarker');
  const banner = el('banner');
  const bannerTitle = el('banner-title');
  const bannerCopy = el('banner-copy');
  const overlay = el('overlay');
  const overlayTitle = el('overlay-title');
  const overlayCopy = el('overlay-copy');
  const playButton = el('play');
  const feed = el('feed');
  const flash = el('flash');
  const plantWrap = el('plant-wrap');
  const plantFill = el('plant-fill');
  const plantLabel = el('plant-label');
  const buyMenu = el('buy-menu');
  const buyMoney = el('buy-money');
  const buyRows = el('buy-rows');
  const buyStart = el('buy-start');
  let hitTimer = null;

  function formatTime(seconds) {
    const left = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(left / 60);
    const rest = left % 60;
    return `${minutes}:${rest.toString().padStart(2, '0')}`;
  }

  return {
    setHealth(health, armor) {
      healthFill.style.width = `${health}%`;
      healthValue.textContent = String(Math.round(health));
      healthFill.classList.toggle('low', health <= 30);
      armorValue.textContent = armor > 0 ? `+${Math.round(armor)} ARMOR` : '';
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
    setAlive(emberAlive, slateAlive) {
      aliveEmber.textContent = `×${emberAlive}`;
      aliveSlate.textContent = `×${slateAlive}`;
    },
    setMoney(money) {
      moneyValue.textContent = `$${money}`;
    },
    setBomb(text) {
      bombStatus.textContent = text;
    },
    setGrenades(count) {
      grenadeValue.textContent = `◉ ${count}`;
    },
    hitMarker(kill) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', kill);
      if (hitTimer) clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), kill ? 220 : 120);
    },
    flashScreen(strength) {
      flash.style.opacity = String(Math.max(0, Math.min(1, strength)));
      setTimeout(() => { flash.style.opacity = '0'; }, 450);
    },
    setChannel(label, frac) {
      if (frac === null) {
        plantWrap.hidden = true;
        return;
      }
      plantWrap.hidden = false;
      plantLabel.textContent = label;
      plantFill.style.width = `${Math.round(frac * 100)}%`;
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
        overlayCopy.textContent = 'Foundry Yard. Ember versus Slate, first to 5 rounds. Plant the bomb at A or B. Click to play.';
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
    showBuyMenu(money, weaponId, grenades) {
      buyMenu.hidden = false;
      buyMoney.textContent = `$${money}`;
      const rows = [
        { key: '1', label: `${WEAPONS.carbine.name} — $0 (owned)`, price: 0, owned: weaponId === 'carbine' },
        { key: '2', label: `${WEAPONS.longshot.name} — $1,500 · 45 dmg`, price: WEAPONS.longshot.price, owned: weaponId === 'longshot' },
        { key: '3', label: `${WEAPONS.marksman.name} — $2,600 · 80 dmg`, price: WEAPONS.marksman.price, owned: weaponId === 'marksman' },
        { key: '4', label: `Armor +50 — $${ARMOR_PRICE}`, price: ARMOR_PRICE, owned: false },
        { key: '5', label: `Frag grenade — $${GRENADE_PRICE} (carry ${grenades}/2)`, price: GRENADE_PRICE, owned: false },
      ];
      buyRows.innerHTML = '';
      for (const row of rows) {
        const div = document.createElement('div');
        div.className = 'buy-row' + (row.owned ? ' owned' : '') + (money < row.price ? ' poor' : '');
        div.textContent = `[${row.key}] ${row.label}`;
        buyRows.appendChild(div);
      }
    },
    hideBuyMenu() {
      buyMenu.hidden = true;
    },
    onBuyStart(handler) {
      buyStart.addEventListener('click', handler);
    },
  };
}
