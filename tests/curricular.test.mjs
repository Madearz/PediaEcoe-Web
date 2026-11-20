import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { grade, validAnswers, validCase, validId } from '../shared/clinical.mjs';

const files = '../content/';
const read = (name) => readFile(new URL(files + name, import.meta.url), 'utf8');
const bank = JSON.parse(await read('banco-curricular.json'));
const matrix = await read('COBERTURA-CURRICULAR.md');

test('cada estación del banco coincide con una fila de la matriz y se importa en revisión', () => {
  assert.equal(bank.length, new Set(bank.map(({ id }) => id)).size);
  const rows = matrix.split('\n').filter((row) => row.includes('| `'));
  const stationIds = new Set(rows.map((row) => row.split('|')[2].trim().slice(1, -1)));
  assert.equal(stationIds.size, bank.length);
  for (const { id, data, rubric } of bank) {
    assert.ok(stationIds.has(id), id);
    assert.ok(validId(id) && validCase(data, rubric), id);
    assert.equal(data.status, 'review', id);
    assert.match(rubric.reference, /Grupo [AB](?:,)? pp\./, id);
  }
});

test('todas las rúbricas alcanzan 100 con las decisiones correctas y 0 sin respuestas', () => {
  for (const { id, data, rubric } of bank) {
    const answers = rubric.criteria.map((item) => item.id);
    assert.ok(validAnswers(data, answers), id);
    assert.equal(grade(data, rubric, answers).score, 100, id);
    assert.equal(grade(data, rubric, []).score, 0, id);
    for (const critical of rubric.critical) {
      const alternative = data.interactions.find((item) => item.id === critical.id);
      const changed = answers.filter((item) => data.interactions.find((option) => option.id === item).group !== alternative.group);
      changed.push(critical.id);
      assert.ok(validAnswers(data, changed), id);
      assert.equal(grade(data, rubric, changed).passed, false, id);
    }
  }
});
