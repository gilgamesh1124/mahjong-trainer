import assert from 'node:assert/strict';
import test from 'node:test';

import { tileFaceSvg } from '../src/ui/tile-face.js';

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

test('tileFaceSvg returns a self-contained svg string', () => {
  const svg = tileFaceSvg({ suit: 'tong', rank: 1 });

  assert.ok(svg.includes('<svg'));
  assert.ok(svg.includes('</svg>'));
  assert.ok(svg.includes('viewBox'));
});

test('tong faces draw one circular pip per rank', () => {
  for (let rank = 1; rank <= 9; rank += 1) {
    const svg = tileFaceSvg({ suit: 'tong', rank });

    assert.equal(countOccurrences(svg, 'class="pip"'), rank, `tong-${rank} pip count`);
    assert.ok(svg.includes('<circle'), `tong-${rank} should use circles`);
  }
});

test('tiao faces draw one bamboo per rank', () => {
  for (let rank = 1; rank <= 9; rank += 1) {
    const svg = tileFaceSvg({ suit: 'tiao', rank });

    assert.equal(countOccurrences(svg, 'class="pip"'), rank, `tiao-${rank} pip count`);
  }
});

test('wan faces show the Chinese numeral and the 万 character', () => {
  const numerals = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

  for (let rank = 1; rank <= 9; rank += 1) {
    const svg = tileFaceSvg({ suit: 'wan', rank });

    assert.ok(svg.includes(numerals[rank - 1]), `wan-${rank} should show ${numerals[rank - 1]}`);
    assert.ok(svg.includes('万'), `wan-${rank} should show 万`);
  }
});

test('wan faces contain no pip groups', () => {
  const svg = tileFaceSvg({ suit: 'wan', rank: 5 });

  assert.equal(countOccurrences(svg, 'class="pip"'), 0);
});
