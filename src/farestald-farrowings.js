import express from 'express';
import { requireAdmin } from './auth.js';
import { parseFarrowingSows,farrowingDiagnosis,farrowingDose } from '../public/farrowings-data.js';

const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const penSelect=`SELECT p.id,p.name,r.name AS room_name FROM pens p JOIN rooms r ON r.id=p.room_id JOIN departments d ON d.id=r.department_id WHERE lower(trim(d.name))='farestald'`;
export function createFarrowingsRouter(pool,validate) {
  const router=express.Router();
  router.use(requireAdmin);
  const error=(e,res,next)=>{
    if(e.status)return res.status(e.status).json({error:e.message});
    if(e.code==='23503')return res.status(409).json({error:'A selected medicine, pen or user is no longer available'});
    next(e);
  };
  const date=value=>validate('planned-sow-injections',{sow_number:'1',pen_id:1,medicine_sow_id:1,dose_ml:1,injection_date:value}).injection_date;
  router.get('/options',async(_req,res,next)=>{
    try{
      const [pens,medicines]=await Promise.all([pool.query(penSelect+' ORDER BY r.name,p.name'),pool.query('SELECT id,name,diagnosis,dose_ml::float8 AS dose_ml,dose_kg::float8 AS dose_kg FROM farestald_medicine_sow ORDER BY name')]);
      res.json({pens:pens.rows,milk:medicines.rows.filter(m=>farrowingDiagnosis(m.diagnosis)==='milkdeficiency(ox)'),pain:medicines.rows.filter(m=>farrowingDiagnosis(m.diagnosis)==='pain(m)')});
    }catch(e){error(e,res,next);}
  });
  router.post('/register',async(req,res,next)=>{
    let client;
    try{
      const body=req.body||{};
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.batch_id||''))fail('Invalid batch ID');
      let numbers;try{numbers=parseFarrowingSows(body.sow_numbers);}catch(e){fail(e.message);}
      const day=date(body.injection_date);
      const pen_id=Number(body.pen_id);
      if(!Number.isSafeInteger(pen_id)||pen_id<1)fail('Select a common Farestald pen');
      const sows=numbers.map(sow_number=>({sow_number,pen_id}));
      const ids=[Number(body.milk_medicine_id),Number(body.pain_medicine_id)];
      if(ids.some(id=>!Number.isSafeInteger(id)||id<1)||ids[0]===ids[1])fail('Select a medicine for each diagnosis');
      const payload={sows,injection_date:day,milk_medicine_id:ids[0],pain_medicine_id:ids[1]};
      client=await pool.connect();await client.query('BEGIN');
      const batch=await client.query('INSERT INTO farestald_farrowing_batches(id,user_id,payload) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING RETURNING id',[body.batch_id,req.user.sub,payload]);
      if(!batch.rowCount){
        const previous=await client.query('SELECT user_id,payload=$2::jsonb AS same FROM farestald_farrowing_batches WHERE id=$1',[body.batch_id,payload]);
        if(String(previous.rows[0].user_id)!==String(req.user.sub)||!previous.rows[0].same)fail('This batch ID has already been used for different data');
        await client.query('COMMIT');return res.json({sow_count:sows.length,injection_count:sows.length*2,already_registered:true});
      }
      const validPens=await client.query(penSelect+' AND p.id=ANY($1::bigint[])',[sows.map(x=>x.pen_id)]);
      if(sows.some(x=>!validPens.rows.some(p=>String(p.id)===String(x.pen_id))))fail('All pens must belong to Farestald');
      const medicines=(await client.query('SELECT * FROM farestald_medicine_sow WHERE id=ANY($1::bigint[]) FOR SHARE',[ids])).rows;
      const selected=ids.map((id,i)=>{
        const medicine=medicines.find(m=>String(m.id)===String(id));
        if(!medicine||farrowingDiagnosis(medicine.diagnosis)!==['milkdeficiency(ox)','pain(m)'][i])fail('Selected medicine does not match the required diagnosis');
        let dose;try{dose=farrowingDose(medicine);}catch(e){fail(`${medicine.name}: ${e.message}`);}
        return {id,dose};
      });
      for(const sow of sows)for(const medicine of selected)await client.query(`INSERT INTO farestald_done_sow_injections
        (sow_number,pen_id,injection_date,medicine_sow_id,dose_ml,weight_kg,given_by_user_id,comment)
        VALUES($1,$2,$3,$4,$5,250,$6,'Farrowing medication: single dose')`,[sow.sow_number,sow.pen_id,day,medicine.id,medicine.dose,req.user.sub]);
      await client.query('COMMIT');res.status(201).json({sow_count:sows.length,injection_count:sows.length*2});
    }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});error(e,res,next);}finally{client?.release();}
  });
  return router;
}
