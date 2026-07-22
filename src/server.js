import express from 'express';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool, initializeDatabase } from './db.js';
import { createToken, requireAdmin, requireAuth, requireAuthOrQueryToken } from './auth.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok' }); }
  catch { res.status(503).json({ status: 'unavailable' }); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    res.json({ token: createToken(user), user: publicUser(user) });
  } catch (error) { next(error); }
});

app.get('/api/auth/me', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(userSelect + ' WHERE id = $1', [req.user.sub]);
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

const userSelect = 'SELECT id, username, role, created_at, updated_at FROM users';

app.get('/api/users', requireAuth, async (_req, res, next) => {
  try { res.json((await pool.query(userSelect + ' ORDER BY id')).rows); }
  catch (error) { next(error); }
});

app.get('/api/users/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(userSelect + ' WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = validateUser(req.body, true);
    const hash = await bcrypt.hash(input.password, 12);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at, updated_at',
      [input.username, hash, input.role],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { handleDbError(error, res, next); }
});

app.put('/api/users/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = validateUser(req.body, false);
    const fields = ['username = $1', 'role = $2', 'updated_at = NOW()'];
    const values = [input.username, input.role];
    if (input.password) {
      values.push(await bcrypt.hash(input.password, 12));
      fields.push(`password_hash = $${values.length}`);
    }
    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING id, username, role, created_at, updated_at`, values,
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (error) { handleDbError(error, res, next); }
});

app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (String(req.user.sub) === String(req.params.id)) return res.status(400).json({ error: 'You cannot delete your own account' });
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.status(204).end();
  } catch (error) { next(error); }
});

const departments = express.Router();
const departmentSelect = 'SELECT id, name, created_at, updated_at FROM departments';

departments.get('/', requireAuth, async (_req, res, next) => {
  try { res.json((await pool.query(departmentSelect + ' ORDER BY id')).rows); }
  catch (error) { next(error); }
});

departments.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const name = validateDepartmentName(req.body.name);
    const result = await pool.query('INSERT INTO departments (name) VALUES ($1) RETURNING id, name, created_at, updated_at', [name]);
    res.status(201).json(result.rows[0]);
  } catch (error) { handleDbError(error, res, next); }
});

departments.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(departmentSelect + ' WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Department not found' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

departments.patch('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!Object.hasOwn(req.body, 'name')) return res.status(400).json({ error: 'No fields to update' });
    const name = validateDepartmentName(req.body.name);
    const result = await pool.query('UPDATE departments SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, created_at, updated_at', [name, req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Department not found' });
    res.json(result.rows[0]);
  } catch (error) { handleDbError(error, res, next); }
});

departments.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM departments WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Department not found' });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.use('/api/departments', departments);
app.use('/departments', departments);

const rooms = express.Router();
const roomSelect = `SELECT r.id, r.name, r.department_id, d.name AS department_name, r.created_at, r.updated_at
  FROM rooms r JOIN departments d ON d.id = r.department_id`;

rooms.get('/', requireAuth, async (_req, res, next) => {
  try { res.json((await pool.query(roomSelect + ' ORDER BY r.id')).rows); }
  catch (error) { next(error); }
});

rooms.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = validateRoom(req.body, true);
    const result = await pool.query(
      `WITH inserted AS (
        INSERT INTO rooms (name, department_id) VALUES ($1, $2) RETURNING *
      ) SELECT i.id, i.name, i.department_id, d.name AS department_name, i.created_at, i.updated_at
        FROM inserted i JOIN departments d ON d.id = i.department_id`,
      [input.name, input.departmentId],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { handleDbError(error, res, next); }
});

rooms.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(roomSelect + ' WHERE r.id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Room not found' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

rooms.patch('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!Object.hasOwn(req.body, 'name') && !Object.hasOwn(req.body, 'department_id')) return res.status(400).json({ error: 'No fields to update' });
    const current = await pool.query('SELECT name, department_id FROM rooms WHERE id = $1', [req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Room not found' });
    const input = validateRoom({ ...current.rows[0], ...req.body }, true);
    await pool.query('UPDATE rooms SET name = $1, department_id = $2, updated_at = NOW() WHERE id = $3', [input.name, input.departmentId, req.params.id]);
    res.json((await pool.query(roomSelect + ' WHERE r.id = $1', [req.params.id])).rows[0]);
  } catch (error) { handleDbError(error, res, next); }
});

rooms.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM rooms WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Room not found' });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.use('/api/rooms', rooms);
app.use('/rooms', rooms);

const pens = express.Router();
const penSelect = `SELECT p.id, p.name, p.room_id, r.name AS room_name, d.name AS department_name, p.created_at, p.updated_at
  FROM pens p JOIN rooms r ON r.id = p.room_id JOIN departments d ON d.id = r.department_id`;

pens.get('/', requireAuth, async (_req, res, next) => {
  try { res.json((await pool.query(penSelect + ' ORDER BY p.id')).rows); }
  catch (error) { next(error); }
});

pens.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = validatePen(req.body);
    const inserted = await pool.query('INSERT INTO pens (name, room_id) VALUES ($1, $2) RETURNING id', [input.name, input.roomId]);
    res.status(201).json((await pool.query(penSelect + ' WHERE p.id = $1', [inserted.rows[0].id])).rows[0]);
  } catch (error) { handleDbError(error, res, next); }
});

pens.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(penSelect + ' WHERE p.id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Pen not found' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

pens.patch('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!Object.hasOwn(req.body, 'name') && !Object.hasOwn(req.body, 'room_id')) return res.status(400).json({ error: 'No fields to update' });
    const current = await pool.query('SELECT name, room_id FROM pens WHERE id = $1', [req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Pen not found' });
    const input = validatePen({ ...current.rows[0], ...req.body });
    await pool.query('UPDATE pens SET name = $1, room_id = $2, updated_at = NOW() WHERE id = $3', [input.name, input.roomId, req.params.id]);
    res.json((await pool.query(penSelect + ' WHERE p.id = $1', [req.params.id])).rows[0]);
  } catch (error) { handleDbError(error, res, next); }
});

pens.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM pens WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Pen not found' });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.use('/api/pens', pens);
app.use('/pens', pens);

const medicineSow = express.Router();
const medicineSowSelect = `SELECT name, diagnosis, dose_ml::float8 AS dose_ml, dose_kg::float8 AS dose_kg,
  course_days, interval_hours, symptoms, withdrawal_days, id, created_at, updated_at FROM medicine_sow`;

medicineSow.get('/', requireAuth, async (req, res, next) => {
  try {
    const clauses = []; const values = [];
    if (req.query.search) { values.push(`%${String(req.query.search).trim()}%`); clauses.push(`(name ILIKE $${values.length} OR diagnosis ILIKE $${values.length})`); }
    if (req.query.diagnosis) { values.push(String(req.query.diagnosis)); clauses.push(`diagnosis = $${values.length}`); }
    for (const [query, column] of [['max_withdrawal_days', 'withdrawal_days'], ['max_course_days', 'course_days']]) {
      if (req.query[query] !== undefined) {
        const value = Number(req.query[query]); if (!Number.isInteger(value) || value < 0) return res.status(400).json({ error: `${query} must be a non-negative integer` });
        values.push(value); clauses.push(`${column} <= $${values.length}`);
      }
    }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    res.json((await pool.query(medicineSowSelect + where + ' ORDER BY id', values)).rows);
  } catch (error) { next(error); }
});

medicineSow.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = validateMedicineSow(req.body);
    const inserted = await pool.query(`INSERT INTO medicine_sow
      (name, diagnosis, dose_ml, dose_kg, course_days, interval_hours, symptoms, withdrawal_days)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, medicineSowValues(input));
    res.status(201).json((await pool.query(medicineSowSelect + ' WHERE id = $1', [inserted.rows[0].id])).rows[0]);
  } catch (error) { handleDbError(error, res, next); }
});

medicineSow.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(medicineSowSelect + ' WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Sow medicine not found' }); res.json(result.rows[0]);
  } catch (error) { next(error); }
});

medicineSow.patch('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const allowed = ['name','diagnosis','dose_ml','dose_kg','course_days','interval_hours','symptoms','withdrawal_days'];
    if (!allowed.some(field => Object.hasOwn(req.body, field))) return res.status(400).json({ error: 'No fields to update' });
    const current = await pool.query('SELECT * FROM medicine_sow WHERE id = $1', [req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Sow medicine not found' });
    const input = validateMedicineSow({ ...current.rows[0], ...req.body });
    await pool.query(`UPDATE medicine_sow SET name=$1, diagnosis=$2, dose_ml=$3, dose_kg=$4, course_days=$5,
      interval_hours=$6, symptoms=$7, withdrawal_days=$8, updated_at=NOW() WHERE id=$9`, [...medicineSowValues(input), req.params.id]);
    res.json((await pool.query(medicineSowSelect + ' WHERE id = $1', [req.params.id])).rows[0]);
  } catch (error) { handleDbError(error, res, next); }
});

medicineSow.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM medicine_sow WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Sow medicine not found' }); res.status(204).end();
  } catch (error) { handleDbError(error, res, next); }
});

app.use('/api/medicine-sow', medicineSow);
app.use('/medicine-sow', medicineSow);

const medicineSowStorage = express.Router();
const medicineSowStorageSelect = `SELECT s.medicine_sow_id, s.bottle_volume_ml::float8 AS bottle_volume_ml,
  s.bottle_count, s.total_volume_ml::float8 AS total_volume_ml, s.id, m.name AS medicine_name,
  s.created_at, s.updated_at FROM medicine_sow_storage s JOIN medicine_sow m ON m.id = s.medicine_sow_id`;

medicineSowStorage.get('/', requireAuth, async (req, res, next) => {
  try {
    const values = []; let where = '';
    if (req.query.medicine_sow_id !== undefined) {
      const id = Number(req.query.medicine_sow_id); if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'medicine_sow_id must be a positive integer' });
      values.push(id); where = ' WHERE s.medicine_sow_id = $1';
    }
    res.json((await pool.query(medicineSowStorageSelect + where + ' ORDER BY s.id', values)).rows);
  } catch (error) { next(error); }
});

medicineSowStorage.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = validateMedicineSowStorage(req.body);
    const inserted = await pool.query(`INSERT INTO medicine_sow_storage
      (medicine_sow_id, bottle_volume_ml, bottle_count, total_volume_ml) VALUES ($1,$2,$3,$4) RETURNING id`, storageValues(input));
    res.status(201).json((await pool.query(medicineSowStorageSelect + ' WHERE s.id = $1', [inserted.rows[0].id])).rows[0]);
  } catch (error) { handleDbError(error, res, next); }
});

medicineSowStorage.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(medicineSowStorageSelect + ' WHERE s.id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Sow medicine storage record not found' }); res.json(result.rows[0]);
  } catch (error) { next(error); }
});

medicineSowStorage.patch('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const allowed = ['medicine_sow_id','bottle_volume_ml','bottle_count','total_volume_ml'];
    if (!allowed.some(field => Object.hasOwn(req.body, field))) return res.status(400).json({ error: 'No fields to update' });
    const current = await pool.query('SELECT medicine_sow_id,bottle_volume_ml,bottle_count,total_volume_ml FROM medicine_sow_storage WHERE id=$1', [req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Sow medicine storage record not found' });
    const input = validateMedicineSowStorage({ ...current.rows[0], ...req.body });
    await pool.query(`UPDATE medicine_sow_storage SET medicine_sow_id=$1,bottle_volume_ml=$2,bottle_count=$3,total_volume_ml=$4,updated_at=NOW() WHERE id=$5`, [...storageValues(input), req.params.id]);
    res.json((await pool.query(medicineSowStorageSelect + ' WHERE s.id = $1', [req.params.id])).rows[0]);
  } catch (error) { handleDbError(error, res, next); }
});

medicineSowStorage.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM medicine_sow_storage WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Sow medicine storage record not found' }); res.status(204).end();
  } catch (error) { next(error); }
});

app.use('/api/medicine-sow-storage', medicineSowStorage);
app.use('/medicine-sow-storage', medicineSowStorage);

const doneSowInjections = express.Router();
const doneSowSelect = `SELECT i.sow_number,i.pen_id,i.injection_date,i.medicine_sow_id,i.dose_ml::float8 AS dose_ml,
  i.given_by_user_id,i.comment,i.id,m.name AS medicine_name,p.name AS pen_name,u.username AS given_by_username,
  i.created_at,i.updated_at FROM done_sow_injections i JOIN pens p ON p.id=i.pen_id
  JOIN medicine_sow m ON m.id=i.medicine_sow_id JOIN users u ON u.id=i.given_by_user_id`;

doneSowInjections.get('/', requireAuth, async (req,res,next) => {
  try { const { where, values } = doneSowFilters(req.query); res.json((await pool.query(doneSowSelect + where + ' ORDER BY i.injection_date,i.id',values)).rows); }
  catch(error){ if(error.status) return res.status(error.status).json({error:error.message}); next(error); }
});

doneSowInjections.post('/', requireAuth, requireAdmin, async (req,res,next) => {
  try { const x=validateDoneSow(req.body); const inserted=await pool.query(`INSERT INTO done_sow_injections
    (sow_number,pen_id,injection_date,medicine_sow_id,dose_ml,given_by_user_id,comment) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,doneSowValues(x));
    res.status(201).json((await pool.query(doneSowSelect+' WHERE i.id=$1',[inserted.rows[0].id])).rows[0]); } catch(error){handleDbError(error,res,next);}
});

doneSowInjections.get('/week-report', requireAuth, async (req,res,next) => {
  try { const report=await buildDoneSowWeekReport(req.query.start_date); res.json(report); } catch(error){ if(error.status)return res.status(error.status).json({error:error.message});next(error); }
});

doneSowInjections.get('/week-report.xlsx', requireAuth, async (req,res,next) => {
  try { const report=await buildDoneSowWeekReport(req.query.start_date); const workbook=new ExcelJS.Workbook(); const sheet=workbook.addWorksheet('Sow injections');
    sheet.columns=[{header:'Date',key:'injection_date',width:14},{header:'Sow',key:'sow_number',width:16},{header:'Pen',key:'pen_name',width:18},{header:'Medicine',key:'medicine_name',width:24},{header:'Dose ml',key:'dose_ml',width:12},{header:'Given by',key:'given_by_username',width:18},{header:'Comment',key:'comment',width:30}];
    sheet.addRows(report.items); sheet.getRow(1).font={bold:true}; res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="done-sow-${report.start_date}.xlsx"`}); await workbook.xlsx.write(res); res.end();
  } catch(error){ if(error.status)return res.status(error.status).json({error:error.message});next(error); }
});

doneSowInjections.get('/week-report-print', requireAuth, async (req,res,next) => {
  try { const r=await buildDoneSowWeekReport(req.query.start_date); const rows=r.items.map(x=>`<tr><td>${html(x.injection_date)}</td><td>${html(x.sow_number)}</td><td>${html(x.pen_name)}</td><td>${html(x.medicine_name)}</td><td>${x.dose_ml}</td><td>${html(x.given_by_username)}</td><td>${html(x.comment||'')}</td></tr>`).join('');
    res.type('html').send(`<!doctype html><html><head><title>Done sow injections</title><style>body{font:14px Arial;margin:30px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #aaa;padding:8px;text-align:left}@media print{button{display:none}}</style></head><body><button onclick="print()">Print</button><h1>Done sow injections</h1><p>${r.start_date} — ${r.end_date} · ${r.total_injections} injections · ${r.total_dose_ml} ml</p><table><thead><tr><th>Date</th><th>Sow</th><th>Pen</th><th>Medicine</th><th>Dose ml</th><th>Given by</th><th>Comment</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
  } catch(error){ if(error.status)return res.status(error.status).json({error:error.message});next(error); }
});

doneSowInjections.get('/:id', requireAuth, async(req,res,next)=>{try{const r=await pool.query(doneSowSelect+' WHERE i.id=$1',[req.params.id]);if(!r.rows[0])return res.status(404).json({error:'Done sow injection not found'});res.json(r.rows[0]);}catch(e){next(e);}});
doneSowInjections.patch('/:id', requireAuth, requireAdmin, async(req,res,next)=>{try{const allowed=['sow_number','pen_id','injection_date','medicine_sow_id','dose_ml','given_by_user_id','comment'];if(!allowed.some(f=>Object.hasOwn(req.body,f)))return res.status(400).json({error:'No fields to update'});const cur=await pool.query('SELECT sow_number,pen_id,injection_date,medicine_sow_id,dose_ml,given_by_user_id,comment FROM done_sow_injections WHERE id=$1',[req.params.id]);if(!cur.rows[0])return res.status(404).json({error:'Done sow injection not found'});const x=validateDoneSow({...cur.rows[0],...req.body});await pool.query('UPDATE done_sow_injections SET sow_number=$1,pen_id=$2,injection_date=$3,medicine_sow_id=$4,dose_ml=$5,given_by_user_id=$6,comment=$7,updated_at=NOW() WHERE id=$8',[...doneSowValues(x),req.params.id]);res.json((await pool.query(doneSowSelect+' WHERE i.id=$1',[req.params.id])).rows[0]);}catch(e){handleDbError(e,res,next);}});
doneSowInjections.delete('/:id', requireAuth, requireAdmin, async(req,res,next)=>{try{const r=await pool.query('DELETE FROM done_sow_injections WHERE id=$1 RETURNING id',[req.params.id]);if(!r.rows[0])return res.status(404).json({error:'Done sow injection not found'});res.status(204).end();}catch(e){next(e);}});
app.use('/api/done-sow-injections',doneSowInjections); app.use('/done-sow-injections',doneSowInjections);

const uploadDir=process.env.UPLOAD_DIR||path.join(path.dirname(fileURLToPath(import.meta.url)),'..','uploads');fs.mkdirSync(uploadDir,{recursive:true});
const allowedImages=new Map([['image/jpeg','.jpg'],['image/png','.png'],['image/webp','.webp']]);
const upload=multer({storage:multer.diskStorage({destination:uploadDir,filename:(_req,file,cb)=>cb(null,`${randomUUID()}${allowedImages.get(file.mimetype)||''}`)}),limits:{fileSize:5*1024*1024,files:1},fileFilter:(_req,file,cb)=>cb(null,allowedImages.has(file.mimetype))});
const vetQuestions=express.Router();const vetSelect='SELECT question_date,question,photo,id,created_at,updated_at FROM vet_questions';
vetQuestions.get('/',requireAuth,async(_req,res,next)=>{try{res.json((await pool.query(vetSelect+' ORDER BY question_date DESC,id DESC')).rows);}catch(e){next(e);}});
vetQuestions.post('/upload',requireAuth,requireAdmin,(req,res,next)=>upload.single('file')(req,res,e=>{if(e)return res.status(400).json({error:e.code==='LIMIT_FILE_SIZE'?'Image must not exceed 5 MB':'Invalid image upload'});if(!req.file)return res.status(400).json({error:'A JPEG, PNG, or WebP image is required'});res.json({url:`/uploads/${req.file.filename}`,photo:`/uploads/${req.file.filename}`});}));
vetQuestions.post('/',requireAuth,requireAdmin,async(req,res,next)=>{try{const x=validateVetQuestion(req.body);const r=await pool.query('INSERT INTO vet_questions(question_date,question,photo) VALUES($1,$2,$3) RETURNING question_date,question,photo,id,created_at,updated_at',[x.date,x.question,x.photo]);res.status(201).json(r.rows[0]);}catch(e){handleDbError(e,res,next);}});
vetQuestions.get('/:id',requireAuth,async(req,res,next)=>{try{const r=await pool.query(vetSelect+' WHERE id=$1',[req.params.id]);if(!r.rows[0])return res.status(404).json({error:'Vet question not found'});res.json(r.rows[0]);}catch(e){next(e);}});
vetQuestions.patch('/:id',requireAuth,requireAdmin,async(req,res,next)=>{try{if(!['question_date','question','photo'].some(f=>Object.hasOwn(req.body,f)))return res.status(400).json({error:'No fields to update'});const cur=await pool.query('SELECT question_date,question,photo FROM vet_questions WHERE id=$1',[req.params.id]);if(!cur.rows[0])return res.status(404).json({error:'Vet question not found'});const x=validateVetQuestion({...cur.rows[0],...req.body});const r=await pool.query('UPDATE vet_questions SET question_date=$1,question=$2,photo=$3,updated_at=NOW() WHERE id=$4 RETURNING question_date,question,photo,id,created_at,updated_at',[x.date,x.question,x.photo,req.params.id]);res.json(r.rows[0]);}catch(e){handleDbError(e,res,next);}});
vetQuestions.delete('/:id',requireAuth,requireAdmin,async(req,res,next)=>{try{const r=await pool.query('DELETE FROM vet_questions WHERE id=$1 RETURNING id,photo',[req.params.id]);if(!r.rows[0])return res.status(404).json({error:'Vet question not found'});await removeUnusedUpload(r.rows[0].photo);res.status(204).end();}catch(e){next(e);}});
app.use('/api/vet-questions',vetQuestions);app.use('/vet-questions',vetQuestions);

const filesDir=process.env.FILES_DIR||path.join(path.dirname(fileURLToPath(import.meta.url)),'..','files');fs.mkdirSync(filesDir,{recursive:true});
const fileUpload=multer({storage:multer.diskStorage({destination:filesDir,filename:(_req,file,cb)=>{const ext=path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g,'').slice(0,12);cb(null,`${randomUUID()}${ext}`);}}),limits:{fileSize:25*1024*1024,files:1}});
const fileStorage=express.Router();
fileStorage.get('/',requireAuth,async(_req,res,next)=>{try{res.json((await pool.query(`SELECT f.stored_name,f.original_name,f.mime_type,f.size_bytes::float8 AS size_bytes,f.uploaded_by_user_id,u.username AS uploaded_by_username,f.created_at FROM stored_files f JOIN users u ON u.id=f.uploaded_by_user_id ORDER BY f.created_at DESC`)).rows);}catch(e){next(e);}});
fileStorage.post('/upload',requireAuth,requireAdmin,(req,res,next)=>fileUpload.single('file')(req,res,async e=>{if(e)return res.status(400).json({error:e.code==='LIMIT_FILE_SIZE'?'File must not exceed 25 MB':'Invalid file upload'});if(!req.file)return res.status(400).json({error:'A file is required'});try{await pool.query('INSERT INTO stored_files(stored_name,original_name,mime_type,size_bytes,uploaded_by_user_id) VALUES($1,$2,$3,$4,$5)',[req.file.filename,path.basename(req.file.originalname),req.file.mimetype||'application/octet-stream',req.file.size,req.user.sub]);res.status(201).json(req.file.filename);}catch(error){await fs.promises.unlink(req.file.path).catch(()=>{});next(error);}}));
fileStorage.get('/download/:storedName',requireAuthOrQueryToken,async(req,res,next)=>{try{const name=validStoredName(req.params.storedName);const r=await pool.query('SELECT original_name,mime_type FROM stored_files WHERE stored_name=$1',[name]);if(!r.rows[0])return res.status(404).json({error:'File not found'});res.type(r.rows[0].mime_type);res.download(path.join(filesDir,name),r.rows[0].original_name);}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}});
fileStorage.delete('/:storedName',requireAuth,requireAdmin,async(req,res,next)=>{try{const name=validStoredName(req.params.storedName);const r=await pool.query('DELETE FROM stored_files WHERE stored_name=$1 RETURNING stored_name',[name]);if(!r.rows[0])return res.status(404).json({error:'File not found'});await fs.promises.unlink(path.join(filesDir,name)).catch(e=>{if(e.code!=='ENOENT')throw e;});res.status(204).end();}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}});
app.use('/api/file-storage',fileStorage);app.use('/file-storage',fileStorage);

const dailyRemarks=express.Router();const remarkSelect='SELECT remark_date,remark,photo,id,created_at,updated_at FROM daily_remarks';
dailyRemarks.get('/',requireAuth,async(_req,res,next)=>{try{res.json((await pool.query(remarkSelect+' ORDER BY remark_date DESC,id DESC')).rows);}catch(e){next(e);}});
dailyRemarks.post('/upload',requireAuth,requireAdmin,(req,res,next)=>upload.single('file')(req,res,e=>{if(e)return res.status(400).json({error:e.code==='LIMIT_FILE_SIZE'?'Image must not exceed 5 MB':'Invalid image upload'});if(!req.file)return res.status(400).json({error:'A JPEG, PNG, or WebP image is required'});res.json({url:`/uploads/${req.file.filename}`,photo:`/uploads/${req.file.filename}`});}));
dailyRemarks.post('/',requireAuth,requireAdmin,async(req,res,next)=>{try{const x=validateDailyRemark(req.body);const r=await pool.query('INSERT INTO daily_remarks(remark_date,remark,photo) VALUES($1,$2,$3) RETURNING remark_date,remark,photo,id,created_at,updated_at',[x.date,x.remark,x.photo]);res.status(201).json(r.rows[0]);}catch(e){handleDbError(e,res,next);}});
dailyRemarks.get('/:id',requireAuth,async(req,res,next)=>{try{const r=await pool.query(remarkSelect+' WHERE id=$1',[req.params.id]);if(!r.rows[0])return res.status(404).json({error:'Daily remark not found'});res.json(r.rows[0]);}catch(e){next(e);}});
dailyRemarks.patch('/:id',requireAuth,requireAdmin,async(req,res,next)=>{try{if(!['remark_date','remark','photo'].some(f=>Object.hasOwn(req.body,f)))return res.status(400).json({error:'No fields to update'});const cur=await pool.query('SELECT remark_date,remark,photo FROM daily_remarks WHERE id=$1',[req.params.id]);if(!cur.rows[0])return res.status(404).json({error:'Daily remark not found'});const x=validateDailyRemark({...cur.rows[0],...req.body});const r=await pool.query('UPDATE daily_remarks SET remark_date=$1,remark=$2,photo=$3,updated_at=NOW() WHERE id=$4 RETURNING remark_date,remark,photo,id,created_at,updated_at',[x.date,x.remark,x.photo,req.params.id]);if(cur.rows[0].photo!==x.photo)await removeUnusedUpload(cur.rows[0].photo);res.json(r.rows[0]);}catch(e){handleDbError(e,res,next);}});
dailyRemarks.delete('/:id',requireAuth,requireAdmin,async(req,res,next)=>{try{const r=await pool.query('DELETE FROM daily_remarks WHERE id=$1 RETURNING id,photo',[req.params.id]);if(!r.rows[0])return res.status(404).json({error:'Daily remark not found'});await removeUnusedUpload(r.rows[0].photo);res.status(204).end();}catch(e){next(e);}});
app.use('/api/daily-remarks',dailyRemarks);app.use('/daily-remarks',dailyRemarks);

const repairLocations=express.Router();const repairSelect='SELECT repair_date,location,comment,photo,id,created_at,updated_at FROM repair_locations';
repairLocations.get('/',requireAuth,async(_req,res,next)=>{try{res.json((await pool.query(repairSelect+' ORDER BY repair_date DESC,id DESC')).rows);}catch(e){next(e);}});
repairLocations.post('/upload',requireAuth,requireAdmin,(req,res,next)=>upload.single('file')(req,res,e=>{if(e)return res.status(400).json({error:e.code==='LIMIT_FILE_SIZE'?'Image must not exceed 5 MB':'Invalid image upload'});if(!req.file)return res.status(400).json({error:'A JPEG, PNG, or WebP image is required'});res.json({url:`/uploads/${req.file.filename}`,photo:`/uploads/${req.file.filename}`});}));
repairLocations.post('/',requireAuth,requireAdmin,async(req,res,next)=>{try{const x=validateRepairLocation(req.body);const r=await pool.query('INSERT INTO repair_locations(repair_date,location,comment,photo) VALUES($1,$2,$3,$4) RETURNING repair_date,location,comment,photo,id,created_at,updated_at',[x.date,x.location,x.comment,x.photo]);res.status(201).json(r.rows[0]);}catch(e){handleDbError(e,res,next);}});
repairLocations.get('/:id',requireAuth,async(req,res,next)=>{try{const r=await pool.query(repairSelect+' WHERE id=$1',[req.params.id]);if(!r.rows[0])return res.status(404).json({error:'Repair location not found'});res.json(r.rows[0]);}catch(e){next(e);}});
repairLocations.patch('/:id',requireAuth,requireAdmin,async(req,res,next)=>{try{if(!['repair_date','location','comment','photo'].some(f=>Object.hasOwn(req.body,f)))return res.status(400).json({error:'No fields to update'});const cur=await pool.query('SELECT repair_date,location,comment,photo FROM repair_locations WHERE id=$1',[req.params.id]);if(!cur.rows[0])return res.status(404).json({error:'Repair location not found'});const x=validateRepairLocation({...cur.rows[0],...req.body});const r=await pool.query('UPDATE repair_locations SET repair_date=$1,location=$2,comment=$3,photo=$4,updated_at=NOW() WHERE id=$5 RETURNING repair_date,location,comment,photo,id,created_at,updated_at',[x.date,x.location,x.comment,x.photo,req.params.id]);if(cur.rows[0].photo!==x.photo)await removeUnusedUpload(cur.rows[0].photo);res.json(r.rows[0]);}catch(e){handleDbError(e,res,next);}});
repairLocations.delete('/:id',requireAuth,requireAdmin,async(req,res,next)=>{try{const r=await pool.query('DELETE FROM repair_locations WHERE id=$1 RETURNING id,photo',[req.params.id]);if(!r.rows[0])return res.status(404).json({error:'Repair location not found'});await removeUnusedUpload(r.rows[0].photo);res.status(204).end();}catch(e){next(e);}});
app.use('/api/repair-locations',repairLocations);app.use('/repair-locations',repairLocations);

const todos=express.Router();const todoSelect='SELECT id,task,due_date,is_completed,completed_at,created_at,updated_at FROM todo_items';
todos.get('/',requireAuth,async(req,res,next)=>{try{const values=[];let where='';if(req.query.completed!==undefined){if(!['true','false'].includes(String(req.query.completed)))return res.status(400).json({error:'completed must be true or false'});values.push(req.query.completed==='true');where=' WHERE is_completed=$1';}res.json((await pool.query(todoSelect+where+' ORDER BY is_completed,due_date,id',values)).rows);}catch(e){next(e);}});
todos.post('/',requireAuth,requireAdmin,async(req,res,next)=>{try{const x=validateTodo(req.body);const r=await pool.query('INSERT INTO todo_items(task,due_date,is_completed,completed_at) VALUES($1,$2,$3,$4) RETURNING id,task,due_date,is_completed,completed_at,created_at,updated_at',[x.task,x.dueDate,x.completed,x.completed?new Date():null]);res.status(201).json(r.rows[0]);}catch(e){handleDbError(e,res,next);}});
todos.get('/:id',requireAuth,async(req,res,next)=>{try{const r=await pool.query(todoSelect+' WHERE id=$1',[req.params.id]);if(!r.rows[0])return res.status(404).json({error:'Todo item not found'});res.json(r.rows[0]);}catch(e){next(e);}});
todos.patch('/:id',requireAuth,requireAdmin,async(req,res,next)=>{try{if(!['task','due_date','is_completed'].some(f=>Object.hasOwn(req.body,f)))return res.status(400).json({error:'No fields to update'});const cur=await pool.query('SELECT task,due_date,is_completed FROM todo_items WHERE id=$1',[req.params.id]);if(!cur.rows[0])return res.status(404).json({error:'Todo item not found'});const x=validateTodo({...cur.rows[0],...req.body});const r=await pool.query(`UPDATE todo_items SET task=$1,due_date=$2,is_completed=$3,completed_at=CASE WHEN $3 THEN COALESCE(completed_at,NOW()) ELSE NULL END,updated_at=NOW() WHERE id=$4 RETURNING id,task,due_date,is_completed,completed_at,created_at,updated_at`,[x.task,x.dueDate,x.completed,req.params.id]);res.json(r.rows[0]);}catch(e){handleDbError(e,res,next);}});
todos.delete('/:id',requireAuth,requireAdmin,async(req,res,next)=>{try{const r=await pool.query('DELETE FROM todo_items WHERE id=$1 RETURNING id',[req.params.id]);if(!r.rows[0])return res.status(404).json({error:'Todo item not found'});res.status(204).end();}catch(e){next(e);}});
app.use('/api/todos',todos);app.use('/todos',todos);

const sowInjections = express.Router();
const sowInjectionSelect = `SELECT i.sow_number, i.pen_id, i.injection_date, i.medicine_sow_id,
  i.dose_ml::float8 AS dose_ml, i.comment, i.id, m.name AS medicine_name, p.name AS pen_name,
  i.created_at, i.updated_at FROM planed_sow_injections i JOIN pens p ON p.id = i.pen_id
  JOIN medicine_sow m ON m.id = i.medicine_sow_id`;

sowInjections.get('/', requireAuth, async (_req, res, next) => {
  try { res.json((await pool.query(sowInjectionSelect + ' ORDER BY i.injection_date, i.id')).rows); }
  catch (error) { next(error); }
});

sowInjections.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const input = validateSowInjection(req.body);
    const inserted = await pool.query(`INSERT INTO planed_sow_injections
      (sow_number, pen_id, injection_date, medicine_sow_id, dose_ml, comment)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [input.sowNumber, input.penId, input.injectionDate, input.medicineSowId, input.doseMl, input.comment]);
    res.status(201).json((await pool.query(sowInjectionSelect + ' WHERE i.id = $1', [inserted.rows[0].id])).rows[0]);
  } catch (error) { handleDbError(error, res, next); }
});

sowInjections.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(sowInjectionSelect + ' WHERE i.id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Planned sow injection not found' });
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

sowInjections.patch('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const allowed = ['sow_number', 'pen_id', 'injection_date', 'medicine_sow_id', 'dose_ml', 'comment'];
    if (!allowed.some(field => Object.hasOwn(req.body, field))) return res.status(400).json({ error: 'No fields to update' });
    const current = await pool.query('SELECT sow_number, pen_id, injection_date, medicine_sow_id, dose_ml, comment FROM planed_sow_injections WHERE id = $1', [req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Planned sow injection not found' });
    const input = validateSowInjection({ ...current.rows[0], ...req.body });
    await pool.query(`UPDATE planed_sow_injections SET sow_number=$1, pen_id=$2, injection_date=$3,
      medicine_sow_id=$4, dose_ml=$5, comment=$6, updated_at=NOW() WHERE id=$7`,
      [input.sowNumber, input.penId, input.injectionDate, input.medicineSowId, input.doseMl, input.comment, req.params.id]);
    res.json((await pool.query(sowInjectionSelect + ' WHERE i.id = $1', [req.params.id])).rows[0]);
  } catch (error) { handleDbError(error, res, next); }
});

sowInjections.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM planed_sow_injections WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Planned sow injection not found' });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.use('/api/planed-sow-injections', sowInjections);
app.use('/planed-sow-injections', sowInjections);

function validateDepartmentName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length < 1 || name.length > 150) throw Object.assign(new Error('Department name must be between 1 and 150 characters'), { status: 400 });
  return name;
}

function validateRoom(body, required) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const departmentId = Number(body.department_id);
  if (required && (name.length < 1 || name.length > 150)) throw Object.assign(new Error('Room name must be between 1 and 150 characters'), { status: 400 });
  if (!Number.isInteger(departmentId) || departmentId < 1) throw Object.assign(new Error('A valid department is required'), { status: 400 });
  return { name, departmentId };
}

function validatePen(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const roomId = Number(body.room_id);
  if (name.length < 1 || name.length > 150) throw Object.assign(new Error('Pen name must be between 1 and 150 characters'), { status: 400 });
  if (!Number.isInteger(roomId) || roomId < 1) throw Object.assign(new Error('A valid room is required'), { status: 400 });
  return { name, roomId };
}

function validateSowInjection(body) {
  const sowNumber = typeof body.sow_number === 'string' ? body.sow_number.trim() : '';
  const penId = Number(body.pen_id); const medicineSowId = Number(body.medicine_sow_id); const doseMl = Number(body.dose_ml);
  const rawDate = body.injection_date;
  const injectionDate = rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : String(rawDate || '').slice(0, 10);
  const comment = body.comment == null || body.comment === '' ? null : String(body.comment).trim();
  if (!sowNumber || sowNumber.length > 100) throw Object.assign(new Error('Sow number is required and must not exceed 100 characters'), { status: 400 });
  if (!Number.isInteger(penId) || penId < 1) throw Object.assign(new Error('A valid pen is required'), { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(injectionDate) || Number.isNaN(Date.parse(`${injectionDate}T00:00:00Z`))) throw Object.assign(new Error('A valid injection date is required'), { status: 400 });
  if (!Number.isInteger(medicineSowId) || medicineSowId < 1) throw Object.assign(new Error('A valid medicine sow ID is required'), { status: 400 });
  if (!Number.isFinite(doseMl) || doseMl < 0) throw Object.assign(new Error('Dose must be zero or greater'), { status: 400 });
  return { sowNumber, penId, injectionDate, medicineSowId, doseMl, comment };
}

function validateMedicineSow(body) {
  const text = field => typeof body[field] === 'string' ? body[field].trim() : '';
  const input = { name: text('name'), diagnosis: text('diagnosis'), symptoms: text('symptoms'), doseMl: Number(body.dose_ml), doseKg: Number(body.dose_kg), courseDays: Number(body.course_days), intervalHours: Number(body.interval_hours), withdrawalDays: Number(body.withdrawal_days) };
  if (!input.name || input.name.length > 200) throw Object.assign(new Error('Medicine name is required and must not exceed 200 characters'), { status: 400 });
  if (!input.diagnosis || input.diagnosis.length > 300) throw Object.assign(new Error('Diagnosis is required and must not exceed 300 characters'), { status: 400 });
  if (!input.symptoms) throw Object.assign(new Error('Symptoms are required'), { status: 400 });
  for (const [value, label] of [[input.doseMl,'Dose ml'],[input.doseKg,'Dose kg']]) if (!Number.isFinite(value) || value < 0) throw Object.assign(new Error(`${label} must be zero or greater`), { status: 400 });
  for (const [value, label] of [[input.courseDays,'Course days'],[input.intervalHours,'Interval hours'],[input.withdrawalDays,'Withdrawal days']]) if (!Number.isInteger(value) || value < 0) throw Object.assign(new Error(`${label} must be a non-negative integer`), { status: 400 });
  return input;
}
function medicineSowValues(i) { return [i.name,i.diagnosis,i.doseMl,i.doseKg,i.courseDays,i.intervalHours,i.symptoms,i.withdrawalDays]; }

function validateMedicineSowStorage(body) {
  const input = { medicineSowId: Number(body.medicine_sow_id), bottleVolumeMl: Number(body.bottle_volume_ml), bottleCount: Number(body.bottle_count), totalVolumeMl: Number(body.total_volume_ml) };
  if (!Number.isInteger(input.medicineSowId) || input.medicineSowId < 1) throw Object.assign(new Error('A valid sow medicine is required'), { status: 400 });
  if (!Number.isInteger(input.bottleCount) || input.bottleCount < 0) throw Object.assign(new Error('Bottle count must be a non-negative integer'), { status: 400 });
  for (const [value, label] of [[input.bottleVolumeMl,'Bottle volume'],[input.totalVolumeMl,'Total volume']]) if (!Number.isFinite(value) || value < 0) throw Object.assign(new Error(`${label} must be zero or greater`), { status: 400 });
  return input;
}
function storageValues(i) { return [i.medicineSowId,i.bottleVolumeMl,i.bottleCount,i.totalVolumeMl]; }

function normalizeDate(value, label='Date') { const date=value instanceof Date?value.toISOString().slice(0,10):String(value||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(`${date}T00:00:00Z`)))throw Object.assign(new Error(`${label} is invalid`),{status:400});return date; }
function validateDoneSow(b){const x={sowNumber:typeof b.sow_number==='string'?b.sow_number.trim():'',penId:Number(b.pen_id),injectionDate:normalizeDate(b.injection_date,'Injection date'),medicineSowId:Number(b.medicine_sow_id),doseMl:Number(b.dose_ml),givenByUserId:Number(b.given_by_user_id),comment:b.comment==null||b.comment===''?null:String(b.comment).trim()};if(!x.sowNumber||x.sowNumber.length>100)throw Object.assign(new Error('Sow number is required and must not exceed 100 characters'),{status:400});for(const [v,l] of [[x.penId,'pen'],[x.medicineSowId,'sow medicine'],[x.givenByUserId,'user']])if(!Number.isInteger(v)||v<1)throw Object.assign(new Error(`A valid ${l} is required`),{status:400});if(!Number.isFinite(x.doseMl)||x.doseMl<0)throw Object.assign(new Error('Dose must be zero or greater'),{status:400});return x;}
function doneSowValues(x){return[x.sowNumber,x.penId,x.injectionDate,x.medicineSowId,x.doseMl,x.givenByUserId,x.comment];}
function doneSowFilters(q){const clauses=[],values=[];const add=(sql,v)=>{values.push(v);clauses.push(sql.replace('?',`$${values.length}`));};if(q.sow_number)add('i.sow_number=?',String(q.sow_number));for(const [key,col] of [['pen_id','i.pen_id'],['medicine_sow_id','i.medicine_sow_id'],['given_by_user_id','i.given_by_user_id']])if(q[key]!==undefined){const v=Number(q[key]);if(!Number.isInteger(v)||v<1)throw Object.assign(new Error(`${key} must be a positive integer`),{status:400});add(`${col}=?`,v);}if(q.date_from)add('i.injection_date>=?',normalizeDate(q.date_from,'date_from'));if(q.date_to)add('i.injection_date<=?',normalizeDate(q.date_to,'date_to'));return{where:clauses.length?' WHERE '+clauses.join(' AND '):'',values};}
async function buildDoneSowWeekReport(start){const startDate=normalizeDate(start,'start_date');const end=new Date(`${startDate}T00:00:00Z`);end.setUTCDate(end.getUTCDate()+6);const endDate=end.toISOString().slice(0,10);const items=(await pool.query(doneSowSelect+' WHERE i.injection_date BETWEEN $1 AND $2 ORDER BY i.injection_date,i.id',[startDate,endDate])).rows;return{start_date:startDate,end_date:endDate,total_injections:items.length,total_dose_ml:items.reduce((sum,x)=>sum+x.dose_ml,0),items};}
function html(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function validateVetQuestion(b){const date=normalizeDate(b.question_date,'Question date'),question=typeof b.question==='string'?b.question.trim():'',photo=b.photo==null||b.photo===''?null:String(b.photo).trim();if(!question)throw Object.assign(new Error('Question is required'),{status:400});if(photo&&!/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/.test(photo))throw Object.assign(new Error('Invalid photo path'),{status:400});return{date,question,photo};}
function validateDailyRemark(b){const date=normalizeDate(b.remark_date,'Remark date'),remark=typeof b.remark==='string'?b.remark.trim():'',photo=b.photo==null||b.photo===''?null:String(b.photo).trim();if(!remark)throw Object.assign(new Error('Remark is required'),{status:400});if(photo&&!/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/.test(photo))throw Object.assign(new Error('Invalid photo path'),{status:400});return{date,remark,photo};}
function validateRepairLocation(b){const date=normalizeDate(b.repair_date,'Repair date'),location=typeof b.location==='string'?b.location.trim():'',comment=b.comment==null||b.comment===''?null:String(b.comment).trim(),photo=b.photo==null||b.photo===''?null:String(b.photo).trim();if(!location||location.length>300)throw Object.assign(new Error('Location is required and must not exceed 300 characters'),{status:400});if(photo&&!/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/.test(photo))throw Object.assign(new Error('Invalid photo path'),{status:400});return{date,location,comment,photo};}
function validateTodo(b){const task=typeof b.task==='string'?b.task.trim():'',dueDate=normalizeDate(b.due_date,'Due date'),completed=b.is_completed===true||b.is_completed==='true';if(!task)throw Object.assign(new Error('Task is required'),{status:400});if(task.length>2000)throw Object.assign(new Error('Task must not exceed 2000 characters'),{status:400});return{task,dueDate,completed};}
async function removeUnusedUpload(photo){if(!photo)return;const count=await pool.query(`SELECT (SELECT COUNT(*) FROM vet_questions WHERE photo=$1)+(SELECT COUNT(*) FROM daily_remarks WHERE photo=$1)+(SELECT COUNT(*) FROM repair_locations WHERE photo=$1) AS count`,[photo]);if(Number(count.rows[0].count)===0){const name=path.basename(photo);try{await fs.promises.unlink(path.join(uploadDir,name));}catch(e){if(e.code!=='ENOENT')throw e;}}}
function validStoredName(value){const name=String(value||'');if(!/^[a-f0-9-]{36}(\.[a-z0-9]{1,10})?$/.test(name))throw Object.assign(new Error('Invalid stored file name'),{status:400});return name;}

function validateUser(body, passwordRequired) {
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const role = String(body.role || 'user');
  if (username.length < 2 || username.length > 100) throw Object.assign(new Error('Username must be between 2 and 100 characters'), { status: 400 });
  if ((passwordRequired || password) && password.length < 4) throw Object.assign(new Error('Password must be at least 4 characters long'), { status: 400 });
  if (!['admin', 'user'].includes(role)) throw Object.assign(new Error('Invalid role'), { status: 400 });
  return { username, password, role };
}

function publicUser(user) { return { id: user.id, username: user.username, role: user.role }; }
function handleDbError(error, res, next) {
  if (error.status) return res.status(error.status).json({ error: error.message });
  if (error.code === '23505') return res.status(409).json({ error: 'A record with this value already exists' });
  if (error.code === '23503') return res.status(409).json({ error: 'This record is referenced by other data or its parent does not exist' });
  next(error);
}

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
app.use('/uploads', express.static(uploadDir, { fallthrough: false, maxAge: '7d' }));
app.use(express.static(publicDir));
app.get('*path', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.use((error, _req, res, _next) => {
  if (error.status === 404 || error.statusCode === 404 || error.code === 'ENOENT') return res.status(404).json({ error: 'File not found' });
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT || 3000);
initializeDatabase().then(() => app.listen(port, () => console.log(`Server: http://localhost:${port}`))).catch((error) => {
  console.error('Database initialization failed', error);
  process.exit(1);
});
