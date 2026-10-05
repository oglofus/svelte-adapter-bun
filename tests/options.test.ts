import { expect, test } from 'bun:test';
import { parseBytes, parseInteger } from '../src/options.js';

test('body limits accept byte units and reject malformed or unsafe values', () => {
  for (const [value, bytes] of [
    ['0', 0],
    ['512K', 524288],
    ['10B', 10],
    ['1.5M', 1572864],
    ['2g', 2147483648],
  ] as const) {
    expect(parseBytes(value)).toBe(bytes);
  }
  for (const value of [
    '',
    '-1',
    '12oops',
    '1KB',
    'Infinity',
    'NaN',
    '1.1B',
    '999999999999999999999G',
  ]) {
    expect(() => parseBytes(value)).toThrow('BODY_SIZE_LIMIT');
  }
});

test('integer settings validate the entire value and bounds', () => {
  expect(parseInteger('PORT', '0', 0, 65535)).toBe(0);
  expect(parseInteger('PORT', '65535', 0, 65535)).toBe(65535);
  for (const value of ['1.5', '10abc', '-1', '', '65536']) {
    expect(() => parseInteger('PORT', value, 0, 65535)).toThrow('PORT');
  }
});
