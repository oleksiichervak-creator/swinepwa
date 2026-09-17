import express from 'express';
import { requireAuth, requireAdmin } from './auth.js';
import { createFarestaldMobileRouter } from './farestald-mobile.js';
import { createFarrowingsRouter } from './farestald-farrowings.js';

const medicineFields = ['name','diagnosis','dose_ml','dose_kg','course_days','interval_hours','symptoms','withdrawal_days'];
const injectionFields = ['sow_number','pen_id','injection_date','medicine_sow_id','dose_ml','weight_kg','comment'];
const resources = {
  'medicine-sow': { table: 'farestald_medicine_sow', fields: medicineFields, joins: '', extra: '' },
  'medicine-sow-storage': { table: 'farestald_medicine_sow_storage', fields: ['medicine_sow_id','bottle_volume_ml','bottle_count','total_volume_ml'], joins: ' JOIN farestald_medicine_sow m ON m.id=t.medicine_sow_id', extra: ',m.name AS medicine_name' },
  'planned-sow-injections': { table: 'farestald_planed_sow_injections', fields: injectionFields, joins: ' JOIN farestald_medicine_sow m ON m.id=t.medicine_sow_id JOIN pens p ON p.id=t.pen_id', extra: ',m.name AS medicine_name,p.name AS pen_name' },
  'done-sow-injections': { table: 'farestald_done_sow_injections', fields: [...injectionFields,'given_by_user_id'], joins: ' JOIN farestald_medicine_sow m ON m.id=t.medicine_sow_id JOIN pens p ON p.id=t.pen_id JOIN users u ON u.id=t.given_by_user_id', extra: ',m.name AS medicine_name,p.name AS pen_name,u.username AS given_by_username' },
};
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
export function validateFarestald(resource, body = {}) {
  const config = resources[resource];
  if (!config) fail('Unknown resource');
  const result = {};
  for (const key of config.fields) {
    const value = body?.[key];
    if (key === 'comment') { result[key] = value == null || value === '' ? null : String(value).trim(); continue; }
    if (key === 'weight_kg' && (value == null || value === '')) { result[key] = null; continue; }
    if (['name','diagnosis','symptoms','sow_number'].includes(key)) {
      const max = { name: 200, diagnosis: 300, sow_number: 100, symptoms: 10000 }[key];
      if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`${key} is required (maximum ${max} characters)`);
      result[key] = value.trim(); continue;
    }
    if (key === 'injection_date') {
      const date = value instanceof Date ? value.toISOString().slice(0,10) : value;
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date || date.startsWith('0000')) fail('Invalid injection date');
      result[key] = date; continue;
    }
    const number = Number(value);
    const integer = key.endsWith('_id') || ['weight_kg','course_days','interval_hours','withdrawal_days','bottle_count'].includes(key);
    const minimum = key.endsWith('_id') || key === 'weight_kg' ? 1 : 0;
    if (!['string','number'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(number) || number < minimum || (integer && !Number.isSafeInteger(number))) fail(`Invalid ${key}`);
    result[key] = number;
  }
  return result;
}

export function createFarestaldRouter(pool) {
  const router = express.Router();
  router.use(requireAuth);
  router.use('/mobile', createFarestaldMobileRouter(pool, validateFarestald));
  router.use('/farrowings', createFarrowingsRouter(pool, validateFarestald));
  const pens = `SELECT p.id,p.name,r.name AS room_name,d.name AS department_name FROM pens p JOIN rooms r ON r.id=p.room_id JOIN departments d ON d.id=r.department_id WHERE lower(trim(d.name))='farestald'`;
  router.get('/pens', async (_req,res,next) => {
    try { res.json((await pool.query(pens + ' ORDER BY r.name,p.name')).rows); } catch (e) { next(e); }
  });
  const error = (e,res,next) => {
    if (e.status) return res.status(e.status).json({error:e.message});
    if (e.code === '23505') return res.status(409).json({error:'A medicine with this name already exists in Farestald'});
    if (e.code === '23503') return res.status(409).json({error:'Referenced Farestald medicine, pen or user is missing, or this record is still in use'});
    next(e);
  };
  for (const [name,config] of Object.entries(resources)) {
    const child = express.Router();
    const fields = config.fields.map(key => key === 'injection_date' ? "to_char(t.injection_date,'YYYY-MM-DD') AS injection_date" : `t.${key}`).join(',');
    const select = `SELECT t.id,${fields},t.created_at,t.updated_at${config.extra} FROM ${config.table} t${config.joins}`;
    child.param('id', (req,res,next,id) => {
      if (!/^[1-9]\d*$/.test(id) || BigInt(id) > 9223372036854775807n) return res.status(400).json({error:'Invalid ID'});
      next();
    });
    child.get('/', async (_req,res,next) => {
      try { res.json((await pool.query(select + ' ORDER BY t.id DESC')).rows); } catch(e) { next(e); }
    });
    child.get('/:id', async (req,res,next) => {
      try {
        const result = await pool.query(select + ' WHERE t.id=$1',[req.params.id]);
        if (!result.rowCount) return res.status(404).json({error:'Farestald record not found'});
        res.json(result.rows[0]);
      } catch(e) { next(e); }
    });
    const save = update => async (req,res,next) => {
      try {
        let previous = {};
        if (update) {
          if (!config.fields.some(key => Object.hasOwn(req.body || {},key))) fail('No fields to update');
          const current = await pool.query(select + ' WHERE t.id=$1',[req.params.id]);
          if (!current.rowCount) return res.status(404).json({error:'Farestald record not found'});
          previous = current.rows[0];
        }
        const input = validateFarestald(name,{...previous,...req.body});
        if (input.pen_id && !(await pool.query(pens + ' AND p.id=$1',[input.pen_id])).rowCount) fail('Select a pen from the Farestald department');
        const values = config.fields.map(key => input[key]);
        const sql = update
          ? `UPDATE ${config.table} SET ${config.fields.map((key,i)=>`${key}=$${i+1}`).join(',')},updated_at=NOW() WHERE id=$${values.length+1} RETURNING id`
          : `INSERT INTO ${config.table}(${config.fields.join(',')}) VALUES(${values.map((_,i)=>`$${i+1}`).join(',')}) RETURNING id`;
        if (update) values.push(req.params.id);
        const saved = await pool.query(sql,values);
        if (!saved.rowCount) return res.status(404).json({error:'Farestald record not found'});
        res.status(update ? 200 : 201).json((await pool.query(select+' WHERE t.id=$1',[saved.rows[0].id])).rows[0]);
      } catch(e) { error(e,res,next); }
    };
    child.post('/',requireAdmin,save(false));
    child.patch('/:id',requireAdmin,save(true));
    child.delete('/:id',requireAdmin,async (req,res,next) => {
      try {
        const result = await pool.query(`DELETE FROM ${config.table} WHERE id=$1 RETURNING id`,[req.params.id]);
        if (!result.rowCount) return res.status(404).json({error:'Farestald record not found'});
        res.status(204).end();
      } catch(e) { error(e,res,next); }
    });
    router.use('/'+name,child);
  }
  return router;
}
