// 디자인 토큰 WCAG 대비 실측 (03 문서 "토큰별 대비는 실제 개발 시 측정")
// Measure WCAG contrast of design tokens (doc 03: "measure contrast during development")
// 실행 / Run: node scripts/contrast-check.mjs
import { readFileSync } from 'node:fs';

// 본문 텍스트 AA 기준과 큰 텍스트/UI 요소 기준
// AA threshold for body text and for large text / UI components
const AA_TEXT = 4.5;
const AA_UI = 3;

const source = readFileSync(new URL('../src/constants/theme.ts', import.meta.url), 'utf8');

// Colors 객체의 light/dark 블록에서 키:값 추출
// Extract key:value pairs from the light/dark blocks of the Colors object
function readPalette(name) {
  const block = source.split(`export const Colors`)[1].split(`${name}: {`)[1].split('}')[0];
  return Object.fromEntries([...block.matchAll(/(\w+): '(#[0-9A-Fa-f]{6})'/g)].map((m) => [m[1], m[2]]));
}

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [전경, 배경, 기준]
// [foreground, background, threshold]
const PAIRS = [
  ['textPrimary', 'background', AA_TEXT],
  ['textPrimary', 'surface', AA_TEXT],
  ['textSecondary', 'background', AA_TEXT],
  ['textSecondary', 'surface', AA_TEXT],
  ['textSecondary', 'surfaceMuted', AA_TEXT],
  ['accent', 'surface', AA_TEXT],
  ['accent', 'background', AA_TEXT],
  ['accent', 'accentSoft', AA_TEXT],
  ['onAccent', 'accent', AA_TEXT],
  ['onSelected', 'selected', AA_TEXT],
  ['selected', 'background', AA_UI],
  ['warning', 'warningSoft', AA_TEXT],
  ['warning', 'surface', AA_TEXT],
  ['danger', 'surface', AA_TEXT],
  ['danger', 'dangerSoft', AA_TEXT],
  ['border', 'surface', 1.2],
  ['heart', 'surface', AA_UI],
];

let failed = 0;
for (const scheme of ['light', 'dark']) {
  const palette = readPalette(scheme);
  console.log(`\n[${scheme}]`);
  for (const [fg, bg, min] of PAIRS) {
    const value = ratio(palette[fg], palette[bg]);
    const ok = value >= min;
    if (!ok) failed += 1;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${fg.padEnd(14)} on ${bg.padEnd(13)} ${value.toFixed(2)} (>= ${min})`);
  }
}
if (failed > 0) {
  console.error(`\n${failed} pair(s) below threshold`);
  process.exit(1);
}
console.log('\nall pairs pass');
