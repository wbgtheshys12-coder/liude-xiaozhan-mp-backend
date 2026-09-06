const test=require('node:test');
const assert=require('node:assert/strict');
const {splitPeriod,groupRows}=require('../cv-layout');
for(const period of ['10/2022 - present','2022-10 - bis heute','09/2016 - 07/2022','2020 - 2024','2020.09 bis 2024.07']) test('CV preserves complete date range '+period,()=>{
  const row=splitPeriod(period+' | University');
  assert.equal(row.period,period);assert.equal(row.content,'University');
});
test('each dated CV experience becomes its own row without stealing years inside a sentence',()=>{
  assert.equal(groupRows(['10/2022 - present | A','Details','09/2016 - 07/2022 | B']).length,2);
  assert.equal(splitPeriod('Research in 2022 - 2024 was reviewed.').period,'');
});
