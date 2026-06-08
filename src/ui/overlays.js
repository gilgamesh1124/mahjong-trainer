import { tileFaceSvg } from './tile-face.js';
import { tileLabel } from '../core/tiles.js';

const ACTION_LABEL = { pong: '碰', kong: '杠', chi: '吃', win: '胡', pass: '过', 'self-win': '自摸' };

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

// 认领建议中单个选项的文本和牌面
function operationActionContent(choice) {
  const label = ACTION_LABEL[choice.type] ?? choice.type;
  if (!choice.tiles || choice.tiles.length === 0 || choice.type === 'pass') {
    return `<span class="op-action-label">${escapeHtml(label)}</span>`;
  }
  const faces = choice.tiles.map((t) => `<span class="op-action-tile">${tileFaceSvg(t)}</span>`).join('');
  return `<span class="op-action-label">${escapeHtml(label)}</span>${faces}`;
}

// 认领建议块：展示在按钮条上方
function operationAdviceBlock(operationAdvice) {
  if (!operationAdvice?.best) return '';

  const best = operationAdvice.best;
  const choiceItems = operationAdvice.choices.slice(0, 4).map((choice) => {
    const meta = choice.shanten < 0 ? '和牌' : `${choice.shanten} 向 / ${choice.ukeireCount} 张`;
    return `
      <li class="op-choice-item">
        <span class="op-choice-action">${operationActionContent(choice)}</span>
        <strong class="op-choice-meta">${escapeHtml(meta)}</strong>
      </li>
    `;
  }).join('');

  return `
    <div class="operation-advice">
      <div class="operation-best">
        <span class="op-best-label">建议操作</span>
        <span class="op-best-action">${operationActionContent(best)}</span>
      </div>
      <p class="op-best-explanation">${escapeHtml(best.explanation)}</p>
      <ol class="operation-choice-list">
        ${choiceItems}
      </ol>
    </div>
  `;
}

// 操作复盘块
export function operationReviewBlock(summary) {
  if (!summary || summary.totalDecisions === 0) {
    return '<p class="review-empty">本局还没有吃碰杠胡决策记录。</p>';
  }

  const moments = summary.keyMoments?.slice(0, 3) ?? [];
  const momentItems = moments.length > 0
    ? moments.map((moment) => `<li>${escapeHtml(moment)}</li>`).join('')
    : '<li>目前吃碰杠胡选择都与建议一致。</li>';

  return `
    <p>已记录 ${escapeHtml(String(summary.totalDecisions))} 次操作，跟随建议 ${escapeHtml(String(summary.followedBestCount))} 次。</p>
    <ul class="review-moments">
      ${momentItems}
    </ul>
  `;
}

// 玩家可认领时的按钮条；options 为 claimOptionsFor 结果，operationAdvice 为建议对象
export function claimControls(options, operationAdvice) {
  if (!options || options.length === 0) return '';
  const buttons = options.map((option, index) => {
    const label = option.type === 'chi'
      ? `吃 ${option.tiles.map(tileLabel).join('')}`
      : ACTION_LABEL[option.type] ?? option.type;
    return `<button class="claim-button" type="button" data-claim-index="${index}">${escapeHtml(label)}</button>`;
  }).join('');
  return `
    ${operationAdviceBlock(operationAdvice)}
    <div class="claim-bar">${buttons}<button class="claim-button claim-pass" type="button" data-claim-pass="1">过</button></div>
  `;
}

// 自己回合的额外动作（自摸/暗杠/补杠）
export function selfActionControls(selfActions) {
  if (!selfActions || selfActions.length === 0) return '';
  const buttons = selfActions.map((action, index) => {
    const label = action.type === 'self-win' ? '自摸' : action.type === 'concealed-kong' ? `暗杠 ${tileLabel(action.tile)}` : `补杠 ${tileLabel(action.tile)}`;
    return `<button class="self-action-button" type="button" data-self-action-index="${index}">${escapeHtml(label)}</button>`;
  }).join('');
  return `<div class="self-action-bar">${buttons}</div>`;
}

// 一组副露的牌面
export function meldsStrip(melds) {
  if (!melds || melds.length === 0) return '';
  const groups = melds.map((meld) => {
    const faces = meld.tiles.map((tile) => `<span class="meld-tile">${tileFaceSvg(tile)}</span>`).join('');
    const concealed = meld.type === 'concealed-kong' ? ' is-concealed' : '';
    return `<span class="meld-group${concealed}">${faces}</span>`;
  }).join('');
  return `<div class="melds-strip">${groups}</div>`;
}

// 动作浮标：碰/吃/杠 时在桌面中央闪现（胡由结局横幅承担，不重复）
const FLASH_LABEL = { pong: '碰', chi: '吃', kong: '杠' };
export function actionFlash(game) {
  const last = game.history.at(-1);
  const text = last ? FLASH_LABEL[last.type] : undefined;
  if (!text) return '';
  return `<div class="action-flash" aria-hidden="true">${text}!</div>`;
}

// 结局横幅
export function resultBanner(result, names) {
  if (!result) return '';
  if (result.type === 'draw') {
    return `<div class="result-banner"><div class="result-card"><h2>流局</h2><button class="new-hand-button" type="button">新开一局</button></div></div>`;
  }
  const who = names[result.winner];
  const way = result.winType === 'self-draw' ? '自摸' : result.winType === 'rob-kong' ? '抢杠胡' : `点炮（${names[result.loser]} 放炮）`;
  return `<div class="result-banner"><div class="result-card">
    <h2>${escapeHtml(who)} 胡牌</h2>
    <div class="result-face">${tileFaceSvg(result.tile)}</div>
    <p>${escapeHtml(way)} · ${escapeHtml(result.pattern)}</p>
    <button class="new-hand-button" type="button">新开一局</button>
  </div></div>`;
}
