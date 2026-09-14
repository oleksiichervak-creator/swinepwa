export function validateSeekplace(body = {}) {
  const result = {};
  for (const [key, label, max] of [['box_number', 'Box number', 150], ['pig_number', 'Pig number', 100], ['group_number', 'Group number', 150]]) {
    const value = typeof body[key] === 'string' ? body[key].trim() : '';
    if (!value || value.length > max) throw Object.assign(new Error(`${label} is required (maximum ${max} characters)`), { status: 400 });
    result[key] = value;
  }
  const date = body.registration_date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date.startsWith('0000')) {
    throw Object.assign(new Error('Registration date is invalid'), { status: 400 });
  }
  result.registration_date = date;
  result.status = body.status === undefined ? 'observation' : body.status;
  if (!['recovered', 'observation'].includes(result.status)) throw Object.assign(new Error('Status must be recovered or observation'), { status: 400 });
  return result;
}
