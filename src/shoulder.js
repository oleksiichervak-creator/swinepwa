import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export async function initializeShoulder(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shoulder_pigs (
      id BIGSERIAL PRIMARY KEY, sow_number VARCHAR(100) NOT NULL UNIQUE,
      pen_id BIGINT NOT NULL REFERENCES pens(id) ON DELETE RESTRICT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_by_user_id BIGINT NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS shoulder_photos (
      id BIGSERIAL PRIMARY KEY, pig_id BIGINT NOT NULL REFERENCES shoulder_pigs(id) ON DELETE RESTRICT,
      shoulder_side TEXT NOT NULL CHECK(shoulder_side IN ('left','right')),
      observed_date DATE NOT NULL, photo_path TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL,
      pen_id BIGINT NOT NULL REFERENCES pens(id) ON DELETE RESTRICT, pen_label TEXT NOT NULL,
      comment VARCHAR(2000) NOT NULL DEFAULT '',
      created_by_user_id BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(id,pig_id,shoulder_side)
    );
    CREATE TABLE IF NOT EXISTS shoulder_assessments (
      id BIGSERIAL PRIMARY KEY, pig_id BIGINT NOT NULL REFERENCES shoulder_pigs(id) ON DELETE RESTRICT,
      shoulder_side TEXT NOT NULL CHECK(shoulder_side IN ('left','right')), observed_date DATE NOT NULL,
      condition VARCHAR(1000) NOT NULL, treatment VARCHAR(1000) NOT NULL,
      comment VARCHAR(2000) NOT NULL DEFAULT '', photo_id BIGINT,
      created_by_user_id BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY(photo_id,pig_id,shoulder_side) REFERENCES shoulder_photos(id,pig_id,shoulder_side) ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS shoulder_photos_history ON shoulder_photos(pig_id,observed_date DESC,id DESC);
    CREATE INDEX IF NOT EXISTS shoulder_assessments_history ON shoulder_assessments(pig_id,observed_date DESC,id DESC);
  `);
}
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const text=(v,max,required=true)=>{if(typeof v!=='string'||v.trim().length>max||(required&&!v.trim()))fail('Please complete the required fields within their length limits');return v.trim();};
export function shoulderObservation(b) {
  if(!['left','right'].includes(b.shoulder_side))fail('Select left or right shoulder');
  if(typeof b.observed_date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.observed_date)||!Number.isFinite(Date.parse(b.observed_date))||new Date(b.observed_date).toISOString().slice(0,10)!==b.observed_date)fail('Invalid observation date');
  return {side:b.shoulder_side,date:b.observed_date,comment:text(b.comment??'',2000,false)};
}
export function shoulderImageType(buffer) {
  if(buffer.length>3&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255)return ['jpg','image/jpeg'];
  if(buffer.length>8&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return ['png','image/png'];
  if(buffer.length>12&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP')return ['webp','image/webp'];
  fail('Use a JPEG, PNG or WebP photo');
}
export function createShoulderRouter(pool) {
  const router=express.Router();
  const directory=path.resolve(process.env.FILE_DIR||'files','shoulder');
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:5}}).single('photo');
  const pens=`SELECT p.id,p.name,r.name AS room_name FROM pens p JOIN rooms r ON r.id=p.room_id JOIN departments d ON d.id=r.department_id WHERE lower(trim(d.name))='farestald'`;
  const pigSelect=`SELECT s.*,p.name AS pen_name,r.name AS room_name FROM shoulder_pigs s JOIN pens p ON p.id=s.pen_id JOIN rooms r ON r.id=p.room_id`;
  router.param('id',(req,res,next,id)=>/^[1-9]\d*$/.test(id)&&BigInt(id)<=9223372036854775807n?next():res.status(400).json({error:'Invalid ID'}));
  const validPen=async(client,id)=>{
    if(!/^[1-9]\d*$/.test(String(id)))fail('Select a Farestald pen');
    const row=(await client.query(pens+' AND p.id=$1',[id])).rows[0];if(!row)fail('Select a Farestald pen');return row;
  };
  router.get('/pens',async(req,res,next)=>{try{res.json((await pool.query(pens+' ORDER BY r.name,p.name')).rows);}catch(e){next(e);}});
  router.get('/pigs',async(req,res,next)=>{
    try{res.set('Cache-Control','no-store').json((await pool.query(`${pigSelect.replace('s.*,','s.*,(SELECT to_char(max(observed_date),\'YYYY-MM-DD\') FROM shoulder_photos WHERE pig_id=s.id) AS last_photo_date,')} ORDER BY s.active DESC,s.sow_number`)).rows);}catch(e){next(e);}
  });
  router.post('/pigs',async(req,res,next)=>{
    try{const sow=text(req.body.sow_number,100);await validPen(pool,req.body.pen_id);
      const row=(await pool.query('INSERT INTO shoulder_pigs(sow_number,pen_id,created_by_user_id) VALUES($1,$2,$3) RETURNING *',[sow,req.body.pen_id,req.user.id])).rows[0];res.status(201).json(row);
    }catch(e){next(e);}
  });
  router.patch('/pigs/:id',async(req,res,next)=>{
    try{const sow=text(req.body.sow_number,100);await validPen(pool,req.body.pen_id);if(typeof req.body.active!=='boolean')fail('Invalid observation status');
      const row=(await pool.query('UPDATE shoulder_pigs SET sow_number=$1,pen_id=$2,active=$3,updated_at=NOW() WHERE id=$4 RETURNING *',[sow,req.body.pen_id,req.body.active,req.params.id])).rows[0];if(!row)fail('Sow not found',404);res.json(row);
    }catch(e){next(e);}
  });
  router.get('/pigs/:id',async(req,res,next)=>{
    try{const pig=(await pool.query(pigSelect+' WHERE s.id=$1',[req.params.id])).rows[0];if(!pig)fail('Sow not found',404);
      const photos=(await pool.query(`SELECT s.id,pig_id,shoulder_side,to_char(observed_date,'YYYY-MM-DD') AS observed_date,pen_id,pen_label,comment,s.created_at,u.username AS created_by FROM shoulder_photos s JOIN users u ON u.id=s.created_by_user_id WHERE pig_id=$1 ORDER BY observed_date DESC,s.id DESC`,[pig.id])).rows;
      const assessments=(await pool.query(`SELECT s.id,pig_id,shoulder_side,to_char(observed_date,'YYYY-MM-DD') AS observed_date,condition,treatment,comment,photo_id,s.created_at,u.username AS created_by FROM shoulder_assessments s JOIN users u ON u.id=s.created_by_user_id WHERE pig_id=$1 ORDER BY observed_date DESC,s.id DESC`,[pig.id])).rows;
      res.set('Cache-Control','no-store').json({pig,photos,assessments});
    }catch(e){next(e);}
  });
  router.get('/photos/:id/file',async(req,res,next)=>{
    try{const photo=(await pool.query('SELECT photo_path,mime_type FROM shoulder_photos WHERE id=$1',[req.params.id])).rows[0];if(!photo)fail('Photo not found',404);
      res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).type(photo.mime_type).sendFile(path.join(directory,path.basename(photo.photo_path)));
    }catch(e){next(e);}
  });
  router.post('/pigs/:id/photos',(req,res,next)=>upload(req,res,e=>e?res.status(400).json({error:e.code==='LIMIT_FILE_SIZE'?'Photo must be at most 8 MB':'Invalid photo upload'}):next()),async(req,res,next)=>{
    let filename,client;
    try{const o=shoulderObservation(req.body);if(!req.file)fail('Select a photo');const [ext,mime]=shoulderImageType(req.file.buffer);
      client=await pool.connect();await client.query('BEGIN');
      const pig=(await client.query('SELECT * FROM shoulder_pigs WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!pig)fail('Sow not found',404);if(!pig.active)fail('Reopen observation to add a photo');
      const pen=await validPen(client,pig.pen_id);await fs.mkdir(directory,{recursive:true});filename=randomUUID()+'.'+ext;
      await fs.writeFile(path.join(directory,filename),req.file.buffer,{flag:'wx'});
      const row=(await client.query(`INSERT INTO shoulder_photos(pig_id,shoulder_side,observed_date,photo_path,mime_type,pen_id,pen_label,comment,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[pig.id,o.side,o.date,filename,mime,pig.pen_id,pen.room_name+' / '+pen.name,o.comment,req.user.id])).rows[0];
      await client.query('COMMIT');res.status(201).json(row);
    }catch(e){if(client)await client.query('ROLLBACK');if(filename)await fs.unlink(path.join(directory,filename)).catch(()=>{});next(e);}finally{client?.release();}
  });
  router.post('/pigs/:id/assessments',async(req,res,next)=>{
    try{const o=shoulderObservation(req.body),condition=text(req.body.condition,1000),treatment=text(req.body.treatment,1000);
      const pig=(await pool.query('SELECT active FROM shoulder_pigs WHERE id=$1',[req.params.id])).rows[0];if(!pig)fail('Sow not found',404);if(!pig.active)fail('Reopen observation to add an assessment');
      const photo=req.body.photo_id||null;if(photo&&!/^[1-9]\d*$/.test(String(photo)))fail('Invalid photo');
      if(photo&&!(await pool.query('SELECT id FROM shoulder_photos WHERE id=$1 AND pig_id=$2 AND shoulder_side=$3',[photo,req.params.id,o.side])).rowCount)fail('Photo must belong to this sow and shoulder');
      const row=(await pool.query(`INSERT INTO shoulder_assessments(pig_id,shoulder_side,observed_date,condition,treatment,comment,photo_id,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[req.params.id,o.side,o.date,condition,treatment,o.comment,photo,req.user.id])).rows[0];res.status(201).json(row);
    }catch(e){next(e);}
  });
  router.use((e,req,res,next)=>{if(e.status)return res.status(e.status).json({error:e.message});if(e.code==='23505')return res.status(409).json({error:'This sow number is already registered. Open its existing card.'});if(e.code==='23503')return res.status(409).json({error:'Referenced record is no longer available'});next(e);});
  return router;
}
