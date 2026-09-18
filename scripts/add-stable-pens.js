import { pool } from '../src/db.js';

const ranges = [
  ['Stable 1 metal door', 1, 150],
  ['Stable 1 wood door', 151, 199],
  ['Stable 2', 200, 299],
  ['Stable 3', 300, 399],
  ['Stable 4', 400, 499],
  ['Stable 5', 500, 599],
  ['Stable 6', 600, 699],
];
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('LOCK TABLE rooms IN SHARE MODE');
  console.log('Existing rooms:', JSON.stringify((await client.query('SELECT r.name,d.name AS department FROM rooms r JOIN departments d ON d.id=r.department_id ORDER BY d.name,r.name')).rows));
  const results = [];
  for (const [name, first, last] of ranges) {
    const rooms = await client.query(`SELECT r.id, r.name, d.name AS department
      FROM rooms r JOIN departments d ON d.id=r.department_id
      WHERE lower(trim(d.name))='farestald'
        AND lower(regexp_replace(trim(r.name), '\\s+', ' ', 'g'))=ANY($1::text[])`,
    [name === 'Stable 1 wood door' ? ['stable 1 wood door', 'sable 1 wood door'] : [name.toLowerCase()]]);
    if (rooms.rowCount !== 1) throw new Error(`Expected one room named "${name}", found ${rooms.rowCount}. No changes saved.`);
    const room = rooms.rows[0];
    const inserted = await client.query(`INSERT INTO pens (name,room_id)
      SELECT n::text,$1 FROM generate_series($2::integer,$3::integer) AS n
      ON CONFLICT (room_id,name) DO NOTHING RETURNING id`, [room.id,first,last]);
    const verified = await client.query(`SELECT count(*)::integer AS count FROM pens
      WHERE room_id=$1 AND name IN (SELECT n::text FROM generate_series($2::integer,$3::integer) AS n)`, [room.id,first,last]);
    if (verified.rows[0].count !== last-first+1) throw new Error(`Incomplete range in ${name}`);
    results.push({room:room.name,department:room.department,range:`${first}-${last}`,added:inserted.rowCount,verified:verified.rows[0].count});
  }
  await client.query('COMMIT');
  console.log(JSON.stringify(results,null,2));
  console.log('Verified all 699 requested pens.');
} catch (error) {
  await client.query('ROLLBACK');
  console.error(error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
