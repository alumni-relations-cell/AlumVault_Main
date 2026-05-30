const db = require('../config/db');
const { encrypt, blindIndex } = require('./encryption.service');
const { parsePagination, buildPaginatedResponse, applyCursorPagination } = require('../utils/pagination');
const logger = require('../utils/logger');

// Local canonical helpers — kept in lockstep with review.service.js so the
// bulk normalize step produces the same display forms the rematch uses.
const BRANCH_SYNONYMS_BULK = {
  'cse': 'CSE', 'cs': 'CSE', 'computer science': 'CSE',
  'computer science and': 'CSE', 'comp sci': 'CSE', 'comp science': 'CSE',
  'computer': 'CSE', 'coe': 'CSE',
  'software': 'CSE', 'se': 'CSE',
  'software engg': 'CSE', 'computer software': 'CSE',
  'ece': 'ECE', 'ec': 'ECE', 'enc': 'ECE',
  'electronics and communication': 'ECE',
  'electronics and communications': 'ECE',
  'electronics communication': 'ECE', 'electronics': 'ECE',
  'eic': 'EIC', 'electronics instrumentation': 'EIC',
  'electronics and instrumentation': 'EIC',
  'instrumentation and control': 'EIC',
  'electronics instrumentation and control': 'EIC',
  'ee': 'EE', 'eee': 'EE', 'electrical': 'EE',
  'me': 'ME', 'mech': 'ME', 'mechanical': 'ME',
  'che': 'CHE', 'chem': 'CHE', 'chemical': 'CHE',
  'ce': 'CIVIL', 'civil': 'CIVIL',
  'bt': 'BIO', 'bio': 'BIO', 'biotech': 'BIO', 'biotechnology': 'BIO',
  'it': 'IT', 'information technology': 'IT',
  'mba': 'MBA', 'mca': 'MCA', 'bba': 'BBA', 'bca': 'BCA',
  'master of computer applications': 'MCA',
  'computer applications': 'MCA', 'computer application': 'MCA',
  'master of business administration': 'MBA',
  'thermal': 'THERMAL', 'thr': 'THERMAL',
};
const BRANCH_DISPLAY_BULK = {
  CSE: 'Computer Science and Engineering',
  ECE: 'Electronics and Communication Engineering',
  EE: 'Electrical Engineering',
  EIC: 'Electronics and Instrumentation',
  ME: 'Mechanical Engineering',
  CHE: 'Chemical Engineering',
  CIVIL: 'Civil Engineering',
  BIO: 'Biotechnology',
  IT: 'Information Technology',
  MBA: 'MBA', MCA: 'MCA', BBA: 'BBA', BCA: 'BCA',
  THERMAL: 'Thermal Engineering',
};
function canonicalBranchForStorageLocal(raw) {
  if (!raw) return null;
  let key = String(raw).toLowerCase()
    .replace(/[&]/g, ' and ')
    .replace(/[.,\-/_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  key = key.replace(/\s+(engineering|engg|engr)$/, '').trim();
  const code = BRANCH_SYNONYMS_BULK[key];
  if (!code) return null;
  return BRANCH_DISPLAY_BULK[code] || code;
}
function canonicalDegreeLocal(raw) {
  if (!raw) return null;
  const k = String(raw).toUpperCase().replace(/[^A-Z]/g, '');
  if (!k) return null;
  if (k === 'BE' || k === 'BTECH' || k === 'BENGG'
      || k.startsWith('BACHELOROFENGINEERING')
      || k.startsWith('BACHELOROFTECHNOLOGY')) return 'BE';
  if (k === 'ME' || k === 'MTECH' || k === 'MENGG'
      || k.startsWith('MASTEROFENGINEERING')
      || k.startsWith('MASTEROFTECHNOLOGY')) return 'ME';
  if (k === 'MBA' || k.startsWith('MASTEROFBUSINESS')) return 'MBA';
  if (k === 'MCA' || k.startsWith('MASTEROFCOMPUTER')) return 'MCA';
  if (k === 'BBA' || k.startsWith('BACHELOROFBUSINESS')) return 'BBA';
  if (k === 'BCA' || k.startsWith('BACHELOROFCOMPUTERAPPLICATIONS')) return 'BCA';
  if (k === 'BSC' || k.startsWith('BACHELOROFSCIENCE')) return 'BSc';
  if (k === 'MSC' || k.startsWith('MASTEROFSCIENCE')) return 'MSc';
  if (k === 'BPHARM' || k.startsWith('BACHELOROFPHARMACY')) return 'BPharm';
  if (k === 'MPHARM' || k.startsWith('MASTEROFPHARMACY')) return 'MPharm';
  if (k.includes('PHD') || k.includes('DOCTOR')) return 'PhD';
  return null;
}

class AlumniService {
  /**
   * Search alumni with fuzzy text search and filters.
   */
  async search(query) {
    const { limit, cursor, direction } = parsePagination(query);
    let params = [];
    let conditions = ['1=1'];

    // Full-text fuzzy search. Multi-word queries like "Harsharan Singh Chawla"
    // are tokenized on whitespace — every token must appear somewhere in
    // full_name (ILIKE, case-insensitive), in any order. That makes partial
    // queries ("singh chawla", "harsharan chawla") work too. A trigram
    // similarity fallback against the raw string catches mild typos.
    if (query.q && query.q.trim()) {
      const raw = query.q.trim();
      const tokens = raw.split(/\s+/).filter(Boolean);
      const tokenClauses = tokens.map(tok => {
        params.push(`%${tok}%`);
        return `full_name ILIKE $${params.length}`;
      });
      params.push(raw);
      const trigramIdx = params.length;
      conditions.push(`((${tokenClauses.join(' AND ')}) OR full_name % $${trigramIdx})`);
    }

    // Filters
    if (query.batch_year) {
      params.push(parseInt(query.batch_year));
      conditions.push(`batch_year = $${params.length}`);
    }
    if (query.branch) {
      params.push(query.branch);
      conditions.push(`branch ILIKE $${params.length}`);
    }
    if (query.company) {
      params.push(query.company);
      conditions.push(`current_company % $${params.length}`);
    }
    if (query.tag) {
      params.push(query.tag);
      conditions.push(`$${params.length} = ANY(tags)`);
    }
    if (query.is_verified !== undefined) {
      params.push(query.is_verified === 'true');
      conditions.push(`is_verified = $${params.length}`);
    }
    if (query.min_completeness) {
      params.push(parseFloat(query.min_completeness));
      conditions.push(`data_completeness >= $${params.length}`);
    }

    const baseQuery = `SELECT * FROM alumni WHERE ${conditions.join(' AND ')}`;
    const { query: paginatedQuery, params: allParams } = applyCursorPagination(
      baseQuery, cursor, direction, limit, 'created_at', params
    );

    const result = await db.query(paginatedQuery, allParams);
    return buildPaginatedResponse(result.rows, limit);
  }

  /**
   * Get a single alumni by ID.
   */
  async getById(id) {
    const result = await db.query('SELECT * FROM alumni WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      throw new Error('Alumni not found');
    }
    const alumni = result.rows[0];
    const companies = await db.query(
      `SELECT company, title, is_current, source, confidence, created_at
       FROM alumni_companies WHERE alumni_id = $1
       ORDER BY is_current DESC, created_at DESC`,
      [id]
    );
    alumni.companies = companies.rows;
    return alumni;
  }

  /**
   * Update specific alumni fields (encrypting contact data).
   */
  async update(id, data, userId) {
    const existing = await this.getById(id);
    if (!existing) throw new Error('Alumni not found');

    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    const simpleFields = ['full_name', 'enrollment_no', 'batch_year', 'branch', 'degree',
      'current_company', 'current_title', 'industry', 'linkedin_url', 'current_city'];

    for (const field of simpleFields) {
      if (data[field] !== undefined) {
        values.push(data[field]);
        updateFields.push(`${field} = $${paramIndex++}`);
      }
    }

    // Handle full_name_blind update
    if (data.full_name) {
      values.push(blindIndex(data.full_name));
      updateFields.push(`full_name_blind = $${paramIndex++}`);
    }

    // Handle encrypted contact fields
    if (data.emails) {
      const encryptedEmails = data.emails.map(e => ({
        ...e,
        value: encrypt(e.value),
        added_at: new Date().toISOString(),
      }));
      values.push(JSON.stringify(encryptedEmails));
      updateFields.push(`emails = $${paramIndex++}`);
    }

    if (data.phones) {
      const encryptedPhones = data.phones.map(p => ({
        ...p,
        value: encrypt(p.value),
        added_at: new Date().toISOString(),
      }));
      values.push(JSON.stringify(encryptedPhones));
      updateFields.push(`phones = $${paramIndex++}`);
    }

    if (data.tags) {
      values.push(data.tags);
      updateFields.push(`tags = $${paramIndex++}`);
    }

    // Add updated_by
    values.push(userId);
    updateFields.push(`updated_by = $${paramIndex++}`);

    // Add id
    values.push(id);

    const query = `UPDATE alumni SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`;
    const result = await db.query(query, values);

    logger.info({ alumniId: id, updatedBy: userId }, 'Alumni updated');
    return result.rows[0];
  }

  /**
   * Delete an alumni record (soft-delete could be added).
   */
  async delete(id, userId) {
    const result = await db.query('DELETE FROM alumni WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      throw new Error('Alumni not found');
    }
    logger.info({ alumniId: id, deletedBy: userId }, 'Alumni deleted');
    return { id, deleted: true };
  }

  /**
   * Bulk normalize alumni.branch + alumni.degree to canonical form. Iterates
   * the existing distinct values (cheap — few hundred) and runs UPDATE
   * statements per distinct value. After this runs, every alumnus with a
   * known synonym holds the canonical display form, which makes the
   * rematch's string-or-canonical comparison hit far more 1-candidate
   * matches.
   *
   * Returns counts so the UI can report "rewrote X branches, Y degrees".
   */
  async bulkNormalizeAlumni() {
    const branchRows = await db.query(
      `SELECT branch, count(*)::int AS n FROM alumni
       WHERE branch IS NOT NULL AND branch <> ''
       GROUP BY branch`
    );
    let branchRewrites = 0;
    for (const r of branchRows.rows) {
      const canon = canonicalBranchForStorageLocal(r.branch);
      if (!canon || canon === r.branch) continue;
      const up = await db.query(
        `UPDATE alumni SET branch = $1, updated_at = NOW()
         WHERE branch = $2`,
        [canon, r.branch]
      );
      branchRewrites += up.rowCount;
    }

    const degreeRows = await db.query(
      `SELECT degree, count(*)::int AS n FROM alumni
       WHERE degree IS NOT NULL AND degree <> ''
       GROUP BY degree`
    );
    let degreeRewrites = 0;
    for (const r of degreeRows.rows) {
      const canon = canonicalDegreeLocal(r.degree);
      if (!canon || canon === r.degree) continue;
      const up = await db.query(
        `UPDATE alumni SET degree = $1, updated_at = NOW()
         WHERE degree = $2`,
        [canon, r.degree]
      );
      degreeRewrites += up.rowCount;
    }

    return { branch_rewrites: branchRewrites, degree_rewrites: degreeRewrites };
  }

  /**
   * Bulk dedupe alumni rows that share (LOWER(name), batch_year, LOWER(branch))
   * — the canonical identity. Roster-sourced row wins; others fold their
   * email/phone JSONB entries into the primary and get deleted. FK references
   * in review_queue and campaign_recipients get re-pointed at the primary so
   * the DELETE doesn't trip NO-ACTION constraints.
   *
   * Runs in batches of 100 clusters per transaction so locks release and any
   * client-side timeout still leaves clean work behind.
   */
  async bulkDedupeAlumni(userId) {
    // One call = one batch of clusters, so the request always returns in a
    // few seconds and never trips the 30s proxy timeout. The frontend loops
    // calling this endpoint until remaining_clusters is 0.
    let clustersProcessed = 0;
    let rowsDeleted = 0;
    let reviewsRepointed = 0;
    const BATCH_CLUSTERS = 50;
    const MAX_BATCHES_PER_CALL = 1;
    let batchesRun = 0;

    while (batchesRun < MAX_BATCHES_PER_CALL) {
      // Identify the next N clusters with 2+ rows. Run normalization first
      // so canonical comparison aligns inside the GROUP BY.
      const clusterRes = await db.query(
        `SELECT LOWER(full_name) AS lname, batch_year, LOWER(branch) AS lbranch,
                array_agg(id ORDER BY (source_import_id IS NOT NULL) DESC, created_at ASC) AS ids
         FROM alumni
         WHERE full_name IS NOT NULL AND batch_year IS NOT NULL AND branch IS NOT NULL
         GROUP BY LOWER(full_name), batch_year, LOWER(branch)
         HAVING count(*) > 1
         LIMIT $1`,
        [BATCH_CLUSTERS]
      );
      if (clusterRes.rows.length === 0) break;

      for (const cluster of clusterRes.rows) {
        const ids = cluster.ids;
        const primary = ids[0];
        const duplicates = ids.slice(1);
        if (duplicates.length === 0) continue;

        const client = await db.getClient();
        try {
          await client.query('BEGIN');

          // 1. For each duplicate: (a) fetch its mergeable values, (b) NULL
          //    the unique-constrained columns on the duplicate row so the
          //    primary can take them over without a brief two-row-same-value
          //    window tripping the partial unique index on linkedin_url, (c)
          //    update the primary with the saved values + JSONB merge.
          for (const dupId of duplicates) {
            const dupRes = await client.query(
              `SELECT emails, phones, linkedin_url, enrollment_no,
                      current_company, current_title, current_city
               FROM alumni WHERE id = $1`,
              [dupId]
            );
            if (dupRes.rows.length === 0) continue;
            const dup = dupRes.rows[0];

            await client.query(
              `UPDATE alumni SET linkedin_url = NULL, enrollment_no = NULL
               WHERE id = $1`,
              [dupId]
            );

            await client.query(
              `UPDATE alumni a
               SET emails = (
                 SELECT COALESCE(jsonb_agg(DISTINCT e), '[]'::jsonb)
                 FROM (
                   SELECT e FROM jsonb_array_elements(COALESCE(a.emails, '[]'::jsonb)) e
                   UNION
                   SELECT e FROM jsonb_array_elements($2::jsonb) e
                 ) merged
               ),
               phones = (
                 SELECT COALESCE(jsonb_agg(DISTINCT p), '[]'::jsonb)
                 FROM (
                   SELECT p FROM jsonb_array_elements(COALESCE(a.phones, '[]'::jsonb)) p
                   UNION
                   SELECT p FROM jsonb_array_elements($3::jsonb) p
                 ) merged
               ),
               linkedin_url    = COALESCE(NULLIF(a.linkedin_url, ''), $4),
               enrollment_no   = COALESCE(NULLIF(a.enrollment_no, ''), $5),
               current_company = COALESCE(NULLIF(a.current_company, ''), $6),
               current_title   = COALESCE(NULLIF(a.current_title, ''), $7),
               current_city    = COALESCE(NULLIF(a.current_city, ''), $8),
               updated_at = NOW()
               WHERE a.id = $1`,
              [
                primary,
                // pg returns JSONB as parsed JS values — re-stringify so the
                // ::jsonb cast in the SQL accepts them.
                JSON.stringify(dup.emails || []),
                JSON.stringify(dup.phones || []),
                dup.linkedin_url, dup.enrollment_no,
                dup.current_company, dup.current_title, dup.current_city,
              ]
            );
          }

          // 2. Re-point review_queue references to the primary (else FK NO ACTION fires).
          const rq = await client.query(
            `UPDATE review_queue SET existing_alumni_id = $1
             WHERE existing_alumni_id = ANY($2::uuid[])`,
            [primary, duplicates]
          );
          reviewsRepointed += rq.rowCount;

          // 3. Re-point campaign_recipients refs.
          await client.query(
            `UPDATE campaign_recipients SET alumni_id = $1
             WHERE alumni_id = ANY($2::uuid[])`,
            [primary, duplicates]
          );

          // 4. Delete the duplicates.
          const del = await client.query(
            `DELETE FROM alumni WHERE id = ANY($1::uuid[])`,
            [duplicates]
          );
          rowsDeleted += del.rowCount;

          await client.query('COMMIT');
          clustersProcessed++;
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          // Don't abort the whole bulk run on one cluster failure — log and continue.
          logger.error({ err: err.message, primary, duplicates }, 'Dedupe cluster failed');
        } finally {
          client.release();
        }
      }
      batchesRun++;
    }

    // How many clusters still have duplicates so the frontend knows whether
    // to call again. Cheap enough — pure aggregate on the (now-smaller) table.
    const remRes = await db.query(
      `SELECT count(*)::int AS n FROM (
         SELECT 1 FROM alumni
         WHERE full_name IS NOT NULL AND batch_year IS NOT NULL AND branch IS NOT NULL
         GROUP BY LOWER(full_name), batch_year, LOWER(branch)
         HAVING count(*) > 1
       ) c`
    );
    const remainingClusters = remRes.rows[0].n;

    logger.warn({
      userId, clustersProcessed, rowsDeleted, reviewsRepointed, remainingClusters,
    }, 'Bulk alumni dedupe batch done');
    return {
      clusters_processed: clustersProcessed,
      rows_deleted: rowsDeleted,
      reviews_repointed: reviewsRepointed,
      remaining_clusters: remainingClusters,
    };
  }

  /**
   * Get aggregated statistics.
   */
  async getStats() {
    const result = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_verified) as verified,
        AVG(data_completeness)::numeric(5,2) as avg_completeness,
        COUNT(DISTINCT batch_year) as batch_years,
        COUNT(DISTINCT branch) as branches
      FROM alumni
    `);
    return result.rows[0];
  }

  /**
   * Populate filter dropdowns with values that actually exist in the alumni
   * table — so the UI can't suggest filters that return zero rows.
   *
   * Batch years and branches are small finite sets, returned in full with
   * row counts (so the operator can see "CSE — 12,341 records" before
   * clicking). Companies are long-tail; we cap at the top 100 by frequency
   * so the dropdown stays responsive.
   */
  async filterOptions() {
    const [batchYears, branches, companies] = await Promise.all([
      db.query(`
        SELECT batch_year::int AS value, count(*)::int AS count
        FROM alumni
        WHERE batch_year IS NOT NULL AND batch_year > 0
        GROUP BY batch_year
        ORDER BY batch_year DESC
      `),
      db.query(`
        SELECT branch AS value, count(*)::int AS count
        FROM alumni
        WHERE branch IS NOT NULL AND branch <> ''
        GROUP BY branch
        ORDER BY count DESC, branch ASC
      `),
      db.query(`
        SELECT current_company AS value, count(*)::int AS count
        FROM alumni
        WHERE current_company IS NOT NULL AND current_company <> ''
        GROUP BY current_company
        ORDER BY count DESC, current_company ASC
        LIMIT 100
      `),
    ]);
    return {
      batch_years: batchYears.rows,
      branches: branches.rows,
      companies: companies.rows,
    };
  }
}

module.exports = new AlumniService();
