import express from 'express';
import ExcelJS from 'exceljs';
import { requireAuth } from './auth.js';

// Table names are selected by the server, never by request parameters.
export function createSowReportsRouter(pool, department = 'lobe_dragte') {
  if (!['lobe_dragte', 'farestald'].includes(department)) throw new Error('Unknown report department');
  const prefix = department === 'farestald' ? 'farestald_' : '';
  const router = express.Router();
router.get('/week-report', requireAuth, async (req,res,next) => {
  try { const report=await buildDoneSowWeekReport(req.query.start_date); res.json(report); } catch(error){ if(error.status)return res.status(error.status).json({error:error.message});next(error); }
});

router.get('/week-report.xlsx', requireAuth, async (req,res,next) => {
  try {
    const report=await buildDoneSowWeekReport(req.query.start_date,req.query.end_date),workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Sows log import');
    sheet.columns=[{header:'Date',width:13},{header:'Type (Sow/Piglet)',width:19},{header:'Sow ID / Group',width:15},{header:'Diagnosis',width:32},{header:'Quantity',width:10},{header:'Weight (kg)',width:12}];
    const thinBorder={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};
    const headerFill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEFEFEF'}};
    sheet.getRow(1).height=30;sheet.getRow(1).eachCell(cell=>{cell.font={name:'Calibri',size:11,bold:true};cell.fill=headerFill;cell.border=thinBorder;cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};});
    const unsupportedDiagnoses=[...new Set(report.courses.filter(course=>!sowLogDiagnosis(course.diagnosis)).map(course=>String(course.diagnosis||'(empty)')))];
    if(unsupportedDiagnoses.length)throw Object.assign(new Error(`Unsupported Sows log diagnosis: ${unsupportedDiagnoses.join(', ')}`),{status:422});
    for(const course of report.courses){
      const first=course.injections[0],weight=first.weight_kg??inferredWeight(first.dose_ml,course.medicine_dose_ml,course.dose_kg);
      const numericSow=/^\d+$/.test(String(course.sow_number))?Number(course.sow_number):String(course.sow_number);
      const row=sheet.addRow([new Date(`${course.start_date}T00:00:00Z`),'Sow',numericSow,sowLogDiagnosis(course.diagnosis),1,weight==null?null:Math.round(Number(weight))]);
      row.eachCell({includeEmpty:true},cell=>{cell.font={name:'Calibri',size:11};cell.border=thinBorder;cell.alignment={vertical:'center'};});
      row.getCell(1).numFmt='dd\\-mm\\-yyyy';row.getCell(5).numFmt='0';row.getCell(6).numFmt='0.0';
    }
    sheet.autoFilter={from:'A1',to:`F${Math.max(1,sheet.rowCount)}`};sheet.views=[{state:'frozen',ySplit:1,showGridLines:true}];
    const usage=workbook.addWorksheet('Medicine usage');usage.columns=[{width:28},{width:20}];
    const usageHeader=usage.addRow(['Medicine','Total medicine ml']);
    for(let column=1;column<=2;column++){const cell=usageHeader.getCell(column);cell.font={name:'Calibri',size:11,bold:true};cell.fill=headerFill;cell.border=thinBorder;cell.alignment={horizontal:'center'};}
    for(const total of report.medicine_totals){const row=usage.addRow([total.medicine_name,Number(total.total_dose_ml)]);row.getCell(2).numFmt='0.###';for(let column=1;column<=2;column++){const cell=row.getCell(column);cell.font={name:'Calibri',size:11};cell.border=thinBorder;cell.alignment={vertical:'top',wrapText:true};}}
    res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="done-sow-${report.start_date}-${report.end_date}.xlsx"`});
    await workbook.xlsx.write(res);res.end();
  } catch(error){ if(error.status)return res.status(error.status).json({error:error.message});next(error); }
});

router.get('/week-report-print', requireAuth, async (req,res,next) => {
  try {
    const r=await buildDoneSowWeekReport(req.query.start_date);
    const rows=r.print_courses.map(x=>`<tr><td>${html(x.start_date)}</td><td>${html(x.sow_number)}</td><td>${html(x.diagnosis)}</td><td>${html(x.medicine_name)}</td><td class="number">${formatDose(x.dose_ml)}</td>${x.given_by_initials.map(value=>`<td class="initials">${html(value||'—')}</td>`).join('')}</tr>`).join('');
    const totals=r.medicine_totals.map(x=>`<tr><td>${html(x.medicine_name)}</td><td class="number">${formatDose(x.total_dose_ml)} ml</td></tr>`).join('');
    res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Week ${r.week_number} sow treatment report</title><style>@page{size:A4 portrait;margin:14mm}*{box-sizing:border-box}body{font:13px Arial,sans-serif;color:#111;margin:24px}.print-button{margin-bottom:16px;padding:7px 14px}h1{font-size:19px;text-align:center;margin:0 0 4px}.period{text-align:center;margin:0 0 18px;font-weight:bold}.report{width:100%;border-collapse:collapse;table-layout:auto}.report th,.report td{border:1px solid #333;padding:6px 7px;text-align:left;vertical-align:middle}.report th{background:#e8e8e8;font-size:11px;text-transform:uppercase}.report th:nth-child(n+6){text-align:center}.number{text-align:right!important}.initials{text-align:center!important;font-weight:bold}.empty{text-align:center!important;color:#555;padding:18px!important}.summary{width:390px;border-collapse:collapse;margin-top:24px}.summary caption{text-align:left;font-weight:bold;font-size:14px;margin-bottom:6px}.summary th,.summary td{border:1px solid #555;padding:5px 7px}.summary th{background:#eee;text-align:left}@media print{body{margin:0}.print-button{display:none}thead{display:table-header-group}}</style></head><body><button class="print-button" onclick="print()">Print</button><h1>Done sow injections — week ${r.week_number}</h1><p class="period">${html(r.start_date)} — ${html(r.end_date)}</p><table class="report"><thead><tr><th>Date</th><th>Sow number</th><th>Diagnosis</th><th>Medicine</th><th>Dose ml</th><th>Given 1</th><th>Given 2</th><th>Given 3</th></tr></thead><tbody>${rows||'<tr><td class="empty" colspan="8">No treatment courses in this period.</td></tr>'}</tbody></table><table class="summary"><caption>Medicine used during the week</caption><thead><tr><th>Medicine</th><th>Total used</th></tr></thead><tbody>${totals||'<tr><td colspan="2">No medicine used.</td></tr>'}</tbody></table></body></html>`);
  } catch(error){ if(error.status)return res.status(error.status).json({error:error.message});next(error); }
});


  return router;
async function buildDoneSowWeekReport(start,finish){
  const startDate=normalizeDate(start,'start_date'),end=new Date(`${startDate}T00:00:00Z`);end.setUTCDate(end.getUTCDate()+6);
  const endDate=finish === undefined ? end.toISOString().slice(0,10) : normalizeDate(finish,'end_date');
  if(endDate<startDate)throw Object.assign(new Error('End date must be on or after start date'),{status:400});
  const reportSelect=`SELECT i.sow_number,i.injection_date,i.medicine_sow_id,i.dose_ml::float8 AS dose_ml,i.weight_kg,i.comment,i.id,
    m.name AS medicine_name,m.diagnosis,m.course_days,m.interval_hours,m.dose_ml::float8 AS medicine_dose_ml,
    m.dose_kg::float8 AS dose_kg,p.name AS pen_name,u.username AS given_by_username
    FROM ${prefix}done_sow_injections i JOIN ${prefix}medicine_sow m ON m.id=i.medicine_sow_id
    JOIN pens p ON p.id=i.pen_id JOIN users u ON u.id=i.given_by_user_id`;
  const history=(await pool.query(reportSelect+' WHERE i.injection_date <= $1 ORDER BY i.sow_number,i.medicine_sow_id,i.injection_date,i.id',[endDate])).rows
    .map(row=>({...row,injection_date:normalizeDate(row.injection_date,'Injection date')}));
  const courses=[];
  for(const injection of history){
    const previous=courses[courses.length-1],sameCourse=previous&&previous.sow_number===injection.sow_number&&String(previous.medicine_sow_id)===String(injection.medicine_sow_id)&&injection.injection_date<=previous.course_end;
    if(sameCourse){previous.injections.push(injection);continue;}
    const courseEnd=new Date(`${injection.injection_date}T00:00:00Z`);
    courseEnd.setUTCDate(courseEnd.getUTCDate()+Math.max(0,Number(injection.course_days)-1));
    courses.push({...injection,start_date:injection.injection_date,course_end:courseEnd.toISOString().slice(0,10),injections:[injection]});
  }
  const weekItems=history.filter(x=>x.injection_date>=startDate);
  const medicineTotals=new Map();
  for(const item of weekItems){
    const total=medicineTotals.get(item.medicine_name)||0;
    medicineTotals.set(item.medicine_name,total+Number(item.dose_ml));
  }
  return{
    start_date:startDate,end_date:endDate,week_number:isoWeekNumber(startDate),
    total_injections:weekItems.length,total_dose_ml:weekItems.reduce((sum,x)=>sum+Number(x.dose_ml),0),
    items:weekItems,
    courses:courses.filter(x=>x.start_date>=startDate)
      .map(x=>({...x,given_by_initials:[0,1,2].map(index=>userInitials(x.injections[index]?.given_by_username))}))
      .sort((a,b)=>a.start_date.localeCompare(b.start_date)||String(a.sow_number).localeCompare(String(b.sow_number),undefined,{numeric:true})),
    print_courses:courses.filter(x=>x.course_end>=startDate&&x.start_date<=endDate)
      .map(x=>({...x,given_by_initials:[0,1,2].map(index=>{
        const injection=x.injections[index];
        return injection&&injection.injection_date>=startDate&&injection.injection_date<=endDate?userInitials(injection.given_by_username):'';
      })}))
      .sort((a,b)=>a.start_date.localeCompare(b.start_date)||String(a.sow_number).localeCompare(String(b.sow_number),undefined,{numeric:true})),
    medicine_totals:[...medicineTotals].map(([medicine_name,total_dose_ml])=>({medicine_name,total_dose_ml})).sort((a,b)=>a.medicine_name.localeCompare(b.medicine_name))
  };
}

}
function normalizeDate(value, label='Date') { const date=value instanceof Date?value.toISOString().slice(0,10):String(value||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(`${date}T00:00:00Z`))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date)throw Object.assign(new Error(`${label} is invalid`),{status:400});return date; }
function isoWeekNumber(value){const date=new Date(`${value}T00:00:00Z`),day=date.getUTCDay()||7;date.setUTCDate(date.getUTCDate()+4-day);const yearStart=new Date(Date.UTC(date.getUTCFullYear(),0,1));return Math.ceil((((date-yearStart)/86400000)+1)/7);}
function userInitials(value){const parts=String(value||'').trim().split(/[^\p{L}\p{N}]+/u).filter(Boolean);return parts.map(part=>part[0]).join('').toLocaleUpperCase().slice(0,3);}
function formatDose(value){return Number(value).toLocaleString('en-GB',{maximumFractionDigits:3});}
function inferredWeight(actualDose,medicineDose,medicineWeight){const dose=Number(medicineDose),weight=dose>0?Number(actualDose)*Number(medicineWeight)/dose:0;return Math.round(weight);}
function html(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function sowLogDiagnosis(value){const raw=String(value||'').trim(),key=raw.toLocaleLowerCase().replace(/[–—]/g,'-').replace(/\s+/g,' ');const exact=new Map(['Heat issue','Farrow fever mild (FM)','Farrow fever severe (FS)','Skin infection (SKIN)','Intestinal worms','Arthritis mild (DB)','Arthritis severe (DBK)','Milk deficiency (OX)','Pain (M)','Diarrehea'].map(item=>[item.toLocaleLowerCase(),item]));if(exact.has(key))return exact.get(key);if(/severe.*(arthritis|bad leg)|(arthritis|bad leg).*severe|dbk/.test(key))return'Arthritis severe (DBK)';if(/arthritis|bad leg|\bdb\b/.test(key))return'Arthritis mild (DB)';if(/farrow.*fever.*severe|severe.*farrow.*fever|\bfs\b|40\+/.test(key))return'Farrow fever severe (FS)';if(/farrow.*fever|\bfm\b|39\s*-?\s*40/.test(key))return'Farrow fever mild (FM)';if(/milk|\box\b/.test(key))return'Milk deficiency (OX)';if(/skin|wound/.test(key))return'Skin infection (SKIN)';if(/diarr|diarrh/.test(key))return'Diarrehea';if(/worm/.test(key))return'Intestinal worms';if(/heat|missing heat/.test(key))return'Heat issue';if(/pain|unthrifty/.test(key))return'Pain (M)';return null;}
