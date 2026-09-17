export function parseFarrowingSows(text) {
  if(typeof text!=='string')throw new Error('Paste sow numbers from Excel');
  const numbers=text.trim().split(/[\s,;]+/).filter(Boolean);
  if(numbers.length<1||numbers.length>40)throw new Error('Enter between 1 and 40 sow numbers');
  if(numbers.some(number=>!/^\d{1,100}$/.test(number)))throw new Error('Use sow numbers only, without column headings');
  if(new Set(numbers).size!==numbers.length)throw new Error('A sow number appears more than once. Remove duplicates');
  return numbers;
}
export const farrowingDiagnosis = value => String(value??'').toLowerCase().replace(/\s+/g,'');
export function farrowingDose(medicine) {
  const ml=Number(medicine?.dose_ml),kg=Number(medicine?.dose_kg);
  if(!Number.isFinite(ml)||ml<=0||!Number.isFinite(kg)||kg<=0)throw new Error('Set positive dose_ml and dose_kg for the selected medicine');
  const dose=Number((250*ml/kg).toFixed(3));
  if(dose<=0||dose>=1e9)throw new Error('Calculated dose is outside the supported range');
  return dose;
}
