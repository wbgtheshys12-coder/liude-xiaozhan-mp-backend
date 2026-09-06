"use strict";
const month = "(?:0?[1-9]|1[0-2])";
const year = "(?:19|20)\\d{2}";
const date = `(?:${month}[-./]${year}|${year}(?:[-./]${month})?)`;
const pattern = new RegExp(`^\\s*(?:[•-]\\s*)?(${date}\\s*(?:[-–—]|bis|to)\\s*(?:${date}|bis\\s+heute|present|now|heute|aktuell))(?=\\s|[|·,;:]|$)`, "i");
function splitPeriod(row) {
  const found = String(row || "").match(pattern);
  return found ? {period:found[1],content:row.slice(found[0].length).replace(/^[\s|·,;:-]+/, "")} : {period:"",content:row};
}
function groupRows(lines) {
  const rows=[]; let current=[];
  for(const line of lines) {
    if(current.length && (splitPeriod(line).period || /^[•-]\s/.test(line))) {rows.push(current.join("\n"));current=[];}
    current.push(line);
  }
  if(current.length) rows.push(current.join("\n"));
  return rows;
}
module.exports={splitPeriod,groupRows};
