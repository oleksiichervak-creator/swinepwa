const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderSeekplaceCard(record, medicines, period) {
  const medicineRows = medicines.map(x => `<tr><td>${escape(x.injection_date)}</td><td>${escape(x.treatment_status)}</td><td>${escape(x.medicine_name)}</td><td>${escape(x.diagnosis)}</td><td>${escape(x.dose_ml)}</td><td>${escape(x.comment)}</td></tr>`).join('');
  const days = Array.from({ length: 10 }, (_, index) => {
    const date = new Date(`${record.registration_date}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return `<tr><td>${date.toISOString().slice(0, 10)}</td><td class="handwriting"></td></tr>`;
  }).join('');
  const extraRows = '<tr><td></td><td class="handwriting"></td></tr>'.repeat(4);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Pig ${escape(record.pig_number)} — inspection card</title>
<style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#111;margin:20px}.sheet{width:190mm;height:276mm;margin:0 auto;position:relative;overflow:hidden}.card{display:flow-root;position:absolute;top:0;left:0;width:190mm;transform-origin:top left}h1{display:flex;justify-content:space-between;gap:20px;margin:4px 0;font-size:88px;line-height:1.05;font-weight:900;break-inside:avoid;overflow-wrap:anywhere}h1 span{min-width:0;flex:1}h1 span:last-child{text-align:right}h1 small{display:block;font-size:16px;line-height:1.4;font-weight:normal}h2{font-size:14px;margin:8px 0 4px}p{margin:6px 0}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #333;padding:3px 5px;text-align:left;overflow-wrap:anywhere}th{background:#eee}thead{display:table-header-group}tr{break-inside:avoid}.handwriting{height:8mm}.inspection th:first-child{width:25%}.medicine th:nth-child(1){width:16%}.medicine th:nth-child(2){width:14%}.medicine th:nth-child(3){width:20%}.medicine th:nth-child(4){width:20%}.medicine th:nth-child(5){width:10%}.inspection{break-inside:avoid}button{padding:8px 20px;cursor:pointer}@media print{body{margin:0}button{display:none}.sheet{margin:0;break-inside:avoid}h2{break-after:avoid}}</style></head><body>
<button onclick="window.print()">Print</button>
<main class="sheet"><div class="card"><h1><span><small>Sow number</small>${escape(record.pig_number)}</span><span><small>Group number</small>${escape(record.group_number)}</span></h1>
<p>Box: ${escape(record.box_number)} · Registration: ${escape(record.registration_date)} · Status: ${escape(record.status)}</p>
<h2>Medicine — ${escape(period.date_from)} to ${escape(period.date_to)}</h2>
<table class="medicine"><thead><tr><th>Date</th><th>Status</th><th>Medicine</th><th>Diagnosis</th><th>Dose (ml)</th><th>Comment</th></tr></thead><tbody>${medicineRows || '<tr><td colspan="6">No planned or given medicine in this period.</td></tr>'}</tbody></table>
<h2>Daily inspection — 10 days from registration</h2>
<table class="inspection"><thead><tr><th>Date</th><th>Comment (fill in by hand)</th></tr></thead><tbody>${days}${extraRows}</tbody></table>
</div></main>
<script>
function fitCard() {
  const sheet = document.querySelector('.sheet');
  const card = document.querySelector('.card');
  card.style.transform = 'none';
  const available = sheet.getBoundingClientRect().height - 4;
  const height = card.getBoundingClientRect().height;
  if (height > available) card.style.transform = 'scale(' + (available / height) + ')';
}
fitCard();
window.addEventListener('beforeprint', fitCard);
window.addEventListener('load', fitCard);
</script>
</body></html>`;
}
