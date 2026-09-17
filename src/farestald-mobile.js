import express from 'express';

const invalid = message => { throw Object.assign(new Error(message), {status:400}); };

export function createFarestaldMobileRouter(pool, validateFarestald) {
  const dateInput = value => validateFarestald('planned-sow-injections', {sow_number:'date',pen_id:1,medicine_sow_id:1,dose_ml:0,injection_date:value}).injection_date;
  const normalizeDate = value => dateInput(value instanceof Date ? value.toISOString().slice(0,10) : value);
  const addUtcDays = (value,days) => {const date=new Date(value+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);};
  // Mounted under the authenticated Farestald router; farm workers may plan and complete treatments.
  const router = express.Router();
  const handleError = (error,res,next) => {
    if (error.status) return res.status(error.status).json({error:error.message});
    if (error.code === '23503') return res.status(409).json({error:'A referenced Farestald medicine, pen or user is no longer available'});
    next(error);
  };
  router.get('/today', async (req,res,next) => {
    try {
      const date = dateInput(req.query.date);
      const result = await pool.query(`SELECT i.id,i.sow_number,i.pen_id,to_char(i.injection_date,'YYYY-MM-DD') AS injection_date,
        i.medicine_sow_id,i.dose_ml::float8 AS dose_ml,i.weight_kg,i.comment,m.name AS medicine_name,m.diagnosis,p.name AS pen_name,r.name AS room_name
        FROM farestald_planed_sow_injections i JOIN farestald_medicine_sow m ON m.id=i.medicine_sow_id
        JOIN pens p ON p.id=i.pen_id JOIN rooms r ON r.id=p.room_id
        WHERE i.injection_date=$1 ORDER BY p.name,m.name,i.sow_number,i.id`,[date]);
      res.set('Cache-Control','no-store').json(result.rows);
    } catch(error) { handleError(error,res,next); }
  });
router.get('/history', async (req, res, next) => {
  try {
    const sowNumber = String(req.query.sow_number || '').trim();
    if (!sowNumber || sowNumber.length > 100) return res.status(400).json({ error: 'A valid sow number is required' });
    const history = await pool.query(`
      SELECT 'planned' AS status,i.id,i.sow_number,i.injection_date,i.dose_ml::float8 AS dose_ml,
        i.comment,p.name AS pen_name,i.medicine_sow_id,m.name AS medicine_name,m.diagnosis
      FROM farestald_planed_sow_injections i
      JOIN pens p ON p.id=i.pen_id JOIN farestald_medicine_sow m ON m.id=i.medicine_sow_id
      WHERE lower(i.sow_number)=lower($1)
      UNION ALL
      SELECT 'done' AS status,i.id,i.sow_number,i.injection_date,i.dose_ml::float8 AS dose_ml,
        i.comment,p.name AS pen_name,i.medicine_sow_id,m.name AS medicine_name,m.diagnosis
      FROM farestald_done_sow_injections i
      JOIN pens p ON p.id=i.pen_id JOIN farestald_medicine_sow m ON m.id=i.medicine_sow_id
      WHERE lower(i.sow_number)=lower($1)
      ORDER BY injection_date DESC,id DESC`, [sowNumber]);
    res.json(history.rows);
  } catch (error) { next(error); }
});

router.get('/recent-treatment-warning', async (req, res, next) => {
  try {
    const sowNumber = String(req.query.sow_number || '').trim();
    const medicineSowId = Number(req.query.medicine_sow_id);
    const plannedDate = normalizeDate(req.query.planned_date, 'Planned date');
    if (!sowNumber || sowNumber.length > 100) return res.status(400).json({ error: 'A valid sow number is required' });
    if (!Number.isInteger(medicineSowId) || medicineSowId < 1) return res.status(400).json({ error: 'A valid medicine is required' });
    const result = await pool.query(`
      SELECT i.injection_date,m.name AS medicine_name,m.diagnosis
      FROM farestald_done_sow_injections i
      JOIN farestald_medicine_sow m ON m.id=i.medicine_sow_id
      JOIN farestald_medicine_sow selected ON selected.id=$2
      WHERE lower(i.sow_number)=lower($1)
        AND lower(trim(m.name))=lower(trim(selected.name))
        AND lower(trim(m.diagnosis))=lower(trim(selected.diagnosis))
        AND i.injection_date BETWEEN $3::date - 14 AND $3::date
      ORDER BY i.injection_date DESC,i.id DESC
      LIMIT 1`, [sowNumber, medicineSowId, plannedDate]);
    res.json({ warning: result.rows[0] || null });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});

router.post('/plans', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const sowNumber = String(req.body.sow_number || '').trim();
    const penId = Number(req.body.pen_id);
    const medicineSowId = Number(req.body.medicine_sow_id);
    const injectionDate = normalizeDate(req.body.injection_date, 'Injection date');
    const weightKg = Number(req.body.weight_kg);
    const comment = req.body.comment == null || req.body.comment === '' ? null : String(req.body.comment).trim();
    const includeMelovem = req.body.include_melovem === true;
    const requestedMelovemDays = req.body.melovem_days == null ? null : Number(req.body.melovem_days);
    const requestedMelovemDates = req.body.melovem_dates;
    if (!sowNumber || sowNumber.length > 100) throw Object.assign(new Error('A valid sow number is required'), { status: 400 });
    if (!Number.isInteger(penId) || penId < 1) throw Object.assign(new Error('A valid pen is required'), { status: 400 });
    if (!Number.isInteger(medicineSowId) || medicineSowId < 1) throw Object.assign(new Error('A valid medicine is required'), { status: 400 });
    if (!Number.isInteger(weightKg) || weightKg < 75 || weightKg > 500 || (weightKg - 75) % 25 !== 0) {
      throw Object.assign(new Error('Weight must start at 75 kg and increase in 25 kg steps'), { status: 400 });
    }

    await client.query('BEGIN');
    const pen = (await client.query(`SELECT p.id FROM pens p JOIN rooms r ON r.id=p.room_id JOIN departments d ON d.id=r.department_id WHERE p.id=$1 AND lower(trim(d.name))='farestald'`, [penId])).rows[0];
    if (!pen) throw Object.assign(new Error('Pen not found'), { status: 404 });
    const selected = (await client.query(
      'SELECT id,name,dose_ml::float8 AS dose_ml,dose_kg::float8 AS dose_kg,course_days FROM farestald_medicine_sow WHERE id=$1',
      [medicineSowId],
    )).rows[0];
    if (!selected) throw Object.assign(new Error('Medicine not found'), { status: 404 });
    const medicines = [selected];
    if (includeMelovem && selected.name.toLocaleLowerCase() !== 'melovem') {
      const melovem = (await client.query(
        `SELECT id,name,dose_ml::float8 AS dose_ml,dose_kg::float8 AS dose_kg,course_days
         FROM farestald_medicine_sow WHERE lower(name)='melovem' LIMIT 1`,
      )).rows[0];
      if (!melovem) throw Object.assign(new Error('Melovem is not available in the medicine list'), { status: 409 });
      medicines.push(melovem);
    }
    if (requestedMelovemDays !== null && (!Number.isInteger(requestedMelovemDays) || requestedMelovemDays < 1 || requestedMelovemDays > 7)) {
      throw Object.assign(new Error('Melovem planning days must be from 1 to 7'), { status: 400 });
    }
    let melovemDates;
    if (requestedMelovemDates !== undefined) {
      if (!Array.isArray(requestedMelovemDates) || requestedMelovemDates.length < 1 || requestedMelovemDates.length > 7) {
        throw Object.assign(new Error('Select from 1 to 7 Melovem dates'), { status: 400 });
      }
      melovemDates = [...new Set(requestedMelovemDates.map(value => normalizeDate(value, 'Melovem date')))];
      const lastMelovemDate = addUtcDays(injectionDate, 6);
      if (melovemDates.length !== requestedMelovemDates.length || !melovemDates.includes(injectionDate) || melovemDates.some(date => date < injectionDate || date > lastMelovemDate)) {
        throw Object.assign(new Error('Melovem dates must be unique and within 7 days of the start date'), { status: 400 });
      }
      melovemDates.sort();
    }
    const created = [];
    for (const medicine of medicines) {
      if (!(medicine.dose_ml >= 0) || !(medicine.dose_kg > 0)) {
        throw Object.assign(new Error(`Dose settings are invalid for ${medicine.name}`), { status: 409 });
      }
      const doseMl = Number((weightKg * medicine.dose_ml / medicine.dose_kg).toFixed(3));
      const isMelovem = medicine.name.trim().toLocaleLowerCase() === 'melovem';
      const courseDays = isMelovem ? requestedMelovemDays ?? Math.max(1, Number(medicine.course_days) || 0) : Math.max(1, Number(medicine.course_days) || 0);
      const plannedDates = isMelovem && melovemDates ? melovemDates : Array.from({ length: courseDays }, (_, day) => addUtcDays(injectionDate, day));
      for (const plannedDate of plannedDates) {
        const inserted = await client.query(`INSERT INTO farestald_planed_sow_injections
          (sow_number,pen_id,injection_date,medicine_sow_id,dose_ml,weight_kg,comment)
          VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [sowNumber, penId, plannedDate, medicine.id, doseMl, weightKg, comment]);
        created.push({ id: inserted.rows[0].id, medicine_name: medicine.name, dose_ml: doseMl, injection_date: plannedDate });
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ plans: created, weight_kg: weightKg });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    handleError(error, res, next);
  } finally {
    client.release();
  }
});

  router.post('/plans/:id/complete', async (req,res,next) => {
    let client;
    try {
      if (!/^[1-9]\d*$/.test(req.params.id) || BigInt(req.params.id)>9223372036854775807n) invalid('Invalid injection ID');
      client=await pool.connect();await client.query('BEGIN');
      const planned=(await client.query(`SELECT *,to_char(injection_date,'YYYY-MM-DD') AS injection_date FROM farestald_planed_sow_injections WHERE id=$1 FOR UPDATE`,[req.params.id])).rows[0];
      if(!planned) { await client.query('ROLLBACK');return res.status(404).json({error:'Injection is already completed or no longer exists'}); }
      const input=validateFarestald('done-sow-injections',{
        ...planned,injection_date:req.body?.injection_date??planned.injection_date,
        dose_ml:req.body?.dose_ml??planned.dose_ml,comment:req.body?.comment??planned.comment,given_by_user_id:req.user.sub,
      });
      const result=await client.query(`INSERT INTO farestald_done_sow_injections(sow_number,pen_id,injection_date,medicine_sow_id,dose_ml,weight_kg,comment,given_by_user_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[input.sow_number,input.pen_id,input.injection_date,input.medicine_sow_id,input.dose_ml,input.weight_kg,input.comment,input.given_by_user_id]);
      await client.query('DELETE FROM farestald_planed_sow_injections WHERE id=$1',[req.params.id]);
      await client.query('COMMIT');res.status(201).json(result.rows[0]);
    } catch(error) { if(client)await client.query('ROLLBACK').catch(()=>{});handleError(error,res,next); }
    finally { client?.release(); }
  });
  router.delete('/plans/:id/skip', async (req,res,next) => {
    try {
      if (!/^[1-9]\d*$/.test(req.params.id) || BigInt(req.params.id)>9223372036854775807n) invalid('Invalid injection ID');
      const result=await pool.query('DELETE FROM farestald_planed_sow_injections WHERE id=$1 RETURNING id',[req.params.id]);
      if(!result.rowCount)return res.status(404).json({error:'Planned injection no longer exists'});
      res.status(204).end();
    }catch(error){handleError(error,res,next);}
  });
  return router;
}
