import express from 'express';

const invalid = message => { throw Object.assign(new Error(message), {status:400}); };

export function createFarestaldMobileRouter(pool, validateFarestald) {
  const dateInput = value => validateFarestald('planned-sow-injections', {sow_number:'date',pen_id:1,medicine_sow_id:1,dose_ml:0,injection_date:value}).injection_date;
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
  router.post('/plans', async (req,res,next) => {
    let client;
    try {
      const input=validateFarestald('planned-sow-injections',{...req.body,dose_ml:0});
      if (!input.weight_kg || input.weight_kg<75 || input.weight_kg>500 || (input.weight_kg-75)%25!==0) invalid('Select a weight from 75 to 500 kg in 25 kg steps');
      client=await pool.connect();
      await client.query('BEGIN');
      const pen=await client.query(`SELECT p.id FROM pens p JOIN rooms r ON r.id=p.room_id JOIN departments d ON d.id=r.department_id
        WHERE p.id=$1 AND lower(trim(d.name))='farestald'`,[input.pen_id]);
      if (!pen.rowCount) invalid('Select a pen in Farestald');
      const medicine=(await client.query('SELECT * FROM farestald_medicine_sow WHERE id=$1',[input.medicine_sow_id])).rows[0];
      if (!medicine) invalid('Select a Farestald medicine');
      if (!(Number(medicine.dose_kg)>0)) invalid('This medicine needs a dose weight greater than zero in Medicine Sow');
      const dose=Number((input.weight_kg*Number(medicine.dose_ml)/Number(medicine.dose_kg)).toFixed(3));
      const days=Math.max(1,Number(medicine.course_days));
      if (days>365) invalid('Medicine course must not exceed 365 days');
      const plans=[];
      for(let day=0;day<days;day++) {
        const result=await client.query(`INSERT INTO farestald_planed_sow_injections(sow_number,pen_id,injection_date,medicine_sow_id,dose_ml,weight_kg,comment)
          VALUES($1,$2,$3::date+$4::int,$5,$6,$7,$8) RETURNING id,to_char(injection_date,'YYYY-MM-DD') AS injection_date`,
        [input.sow_number,input.pen_id,input.injection_date,day,input.medicine_sow_id,dose,input.weight_kg,input.comment]);
        plans.push({...result.rows[0],dose_ml:dose,medicine_name:medicine.name});
      }
      await client.query('COMMIT');
      res.status(201).json({plans});
    } catch(error) { if(client)await client.query('ROLLBACK').catch(()=>{});handleError(error,res,next); }
    finally { client?.release(); }
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
  return router;
}
