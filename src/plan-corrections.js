import express from 'express';
import { requireAuth } from './auth.js';

export function createPlanCorrections(pool, department) {
  if (!['lobe_dragte','farestald'].includes(department)) throw new Error('Invalid department');
  const prefix=department==='farestald'?'farestald_':'',table=prefix+'planed_sow_injections';
  const router=express.Router();
  router.use(requireAuth);
  const pens=`SELECT p.id,p.name,r.name AS room_name FROM pens p JOIN rooms r ON r.id=p.room_id JOIN departments d ON d.id=r.department_id WHERE lower(trim(d.name)) ${prefix?'=':'<>'} 'farestald'`;
  const validSow=value=>typeof value==='string' && value.trim().length>0 && value.trim().length<=100;
  router.get('/sows',async(_req,res,next)=>{
    try{
      const items=(await pool.query(`SELECT i.sow_number,count(*)::integer AS plan_count,array_agg(DISTINCT p.name ORDER BY p.name) AS pens
        FROM ${table} i JOIN pens p ON p.id=i.pen_id GROUP BY i.sow_number`)).rows;
      items.sort((a,b)=>a.sow_number.localeCompare(b.sow_number,undefined,{numeric:true}));
      res.set('Cache-Control','no-store').json(items);
    }catch(e){next(e);}
  });
  router.get('/',async(req,res,next)=>{
    try {
      if(!validSow(req.query.sow_number))return res.status(400).json({error:'Enter the current sow number'});
      const items=(await pool.query(`SELECT i.id,i.sow_number,i.pen_id,i.updated_at,to_char(i.injection_date,'YYYY-MM-DD') AS injection_date,m.name AS medicine_name,p.name AS pen_name
        FROM ${table} i JOIN ${prefix}medicine_sow m ON m.id=i.medicine_sow_id JOIN pens p ON p.id=i.pen_id WHERE i.sow_number=$1 ORDER BY i.injection_date,i.id`,[req.query.sow_number.trim()])).rows;
      res.set('Cache-Control','no-store').json({items,pens:(await pool.query(pens+' ORDER BY r.name,p.name')).rows});
    }catch(e){next(e);}
  });
  router.patch('/',async(req,res,next)=>{
    const b=req.body||{};
    if(!validSow(b.sow_number)||!validSow(b.new_sow_number)||!Array.isArray(b.expected)||!b.expected.length)return res.status(400).json({error:'Find planned injections first and enter a valid sow number'});
    if(b.expected.some(x=>!x || !/^[1-9]\d*$/.test(String(x.id)) || typeof x.updated_at!=='string' || !Number.isFinite(Date.parse(x.updated_at))))return res.status(400).json({error:'Invalid plan selection. Search again.'});
    if(b.pen_id!==null && (!Number.isSafeInteger(b.pen_id)||b.pen_id<1))return res.status(400).json({error:'Select a valid pen'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      // Prevent a newly added plan from being silently omitted during this correction.
      await client.query(`LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE`);
      const rows=(await client.query(`SELECT id,updated_at FROM ${table} WHERE sow_number=$1 ORDER BY id FOR UPDATE`,[b.sow_number.trim()])).rows;
      const snapshot=items=>JSON.stringify(items.map(x=>[String(x.id),new Date(x.updated_at).toISOString()]).sort((a,b)=>a[0].localeCompare(b[0])));
      if(snapshot(rows)!==snapshot(b.expected)){
        await client.query('ROLLBACK');return res.status(409).json({error:'Plans have changed. Search again before saving.'});
      }
      if(b.pen_id!==null && !(await client.query(pens+' AND p.id=$1',[b.pen_id])).rowCount){
        await client.query('ROLLBACK');return res.status(400).json({error:'Select a pen from this department'});
      }
      const result=await client.query(`UPDATE ${table} SET sow_number=$1,pen_id=COALESCE($2,pen_id),updated_at=NOW() WHERE sow_number=$3`,[b.new_sow_number.trim(),b.pen_id,b.sow_number.trim()]);
      await client.query('COMMIT');res.json({updated:result.rowCount});
    }catch(e){await client.query('ROLLBACK');next(e);}finally{client.release();}
  });
  return router;
}
