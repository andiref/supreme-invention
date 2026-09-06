import assert from 'node:assert/strict';
import { buildDefectRow } from '../src/brain/defectRow.js';
import { analyzeQualityData } from '../src/brain/qualityAdvisor.js';

const defect = buildDefectRow('09/01/2026 08:00:00', 'ACME', 'M1', 'SN1', 'TOP', 'U1', 'Insufficient Solder');
assert.ok(defect);

const capa = {
  old: { customer: 'ACME', defect: 'Insufficient Solder', model: 'M1', comp: 'U1', monitoring: 'Open', correctiveAction: 'OLD', updated: 100 },
  newest: { customer: 'ACME', defect: 'Insufficient Solder', model: 'M1', comp: 'U1', monitoring: 'Monitoring', correctiveAction: 'NEW', updated: 200 }
};

const analysis = analyzeQualityData([defect], [{ week: defect.week, customer: 'ACME', model: 'M1', inspTOP: 100, inspBOT: 0 }], capa, { week: defect.week, customer: 'ACME', model: 'M1' });
assert.equal(analysis.topDefects[0].capa.correctiveAction, 'NEW');
assert.equal(analysis.topDefects[0].capa.updated, 200);

console.log('quality advisor CAPA ordering test: PASS');
