export const SHOULDER_CONDITIONS = [
  {code:'redness',label:'Redness — Rødme',color:'green',icon:'🟢',description:'Red skin, no open wound.',action:'Provide soft bedding and monitor daily.'},
  {code:'grade_1',label:'Grade 1 — Superficial Wound',color:'yellow',icon:'🟡',description:'Minor damage to the outer skin.',action:'Reduce pressure, treat and monitor daily.'},
  {code:'grade_2',label:'Grade 2 — Deeper Skin Wound',color:'orange',icon:'🟠',description:'Open wound affecting deeper skin layers.',action:'Treat, provide soft bedding and assess the need for a hospital pen.'},
  {code:'grade_3',label:'Grade 3 — Deep Wound',color:'red',icon:'🔴',description:'Deep wound involving subcutaneous tissue.',action:'Move to a hospital pen immediately and arrange veterinary assessment.',warning:'URGENT — Immediate action required.'},
  {code:'grade_4',label:'Grade 4 — Severe Wound',color:'red',icon:'🔴',description:'Severe tissue damage, possibly reaching the bone.',action:'Immediate veterinary intervention. Assess the need for humane euthanasia.',warning:'CRITICAL — Immediate action required.'},
  {code:'healed',label:'Healed — Recovered',color:'green',icon:'🟢',description:'Wound fully closed, skin healed. No open wound; scar tissue may remain.',action:'Continue routine monitoring.'},
];
export function shouldersDue(pig,date) {
  if(!pig.active)return [];
  return ['left','right'].filter(side=>{
    const last=(pig.latest_assessments||[]).find(x=>x.shoulder_side===side);
    return last?.condition_code!=='healed'&&last?.observed_date!==date;
  });
}
