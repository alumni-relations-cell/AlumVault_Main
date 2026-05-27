"""
Portal Sync Pipeline
Syncs data from Thapar alumni portal (Tier 2) into the master database.
Tracks last sync timestamp to only process new/updated records.
"""

import os
import json
import time
import logging
import psycopg2

from publisher import publish_event

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

DB_URL = os.environ.get('DATABASE_URL', 'postgresql://api_user:password@localhost:5432/alumni_portal')
PORTAL_API_URL = os.environ.get('ALUMNI_PORTAL_API_URL', '')

# Redis key for last sync timestamp
LAST_SYNC_KEY = 'pipeline:portal_sync:last_sync'


def get_db_connection():
    return psycopg2.connect(DB_URL)


def get_last_sync_time():
    """Retrieve the last sync timestamp from a tracking table or Redis."""
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT MAX(created_at) FROM import_jobs
                WHERE source_name = 'portal_sync' AND status = 'completed'
            """)
            result = cur.fetchone()
            conn.close()
            return result[0] if result and result[0] else None
    except Exception as e:
        logger.error(f"Failed to get last sync time: {e}")
        return None


def fetch_portal_updates(since=None):
    """
    Fetch updated records from the alumni portal API.
    In production, this would call the portal's REST API.
    """
    if not PORTAL_API_URL:
        logger.warning("ALUMNI_PORTAL_API_URL not set, skipping portal sync")
        return []

    import requests
    try:
        params = {}
        if since:
            params['updated_since'] = since.isoformat()

        response = requests.get(
            f'{PORTAL_API_URL}/api/alumni',
            params=params,
            timeout=30,
        )

        if response.status_code == 200:
            return response.json().get('data', [])
        else:
            logger.error(f"Portal API error: {response.status_code}")
            return []
    except Exception as e:
        logger.error(f"Portal API request failed: {e}")
        return []


def sync():
    """
    Main sync logic:
    1. Check last sync time
    2. Fetch new/updated records from portal
    3. Publish to import queue for processing
    """
    logger.info("Starting portal sync...")

    last_sync = get_last_sync_time()
    logger.info(f"Last sync: {last_sync or 'never'}")

    # Fetch updates from portal
    updates = fetch_portal_updates(last_sync)
    logger.info(f"Fetched {len(updates)} records from portal")

    if not updates:
        logger.info("No new records to sync")
        return 0

    # Create import job
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO import_jobs (source_type, source_tier, source_name, status, total_rows)
                VALUES ('api', 2, 'portal_sync', 'processing', %s)
                RETURNING id
            """, (len(updates),))
            job_id = str(cur.fetchone()[0])
            conn.commit()
    finally:
        conn.close()

    # Publish each record to the import queue
    for record in updates:
        publish_event('import.pending', {
            'job_id': job_id,
            'full_name': record.get('name', ''),
            'email': record.get('email', ''),
            'phone': record.get('phone', ''),
            'batch_year': record.get('graduation_year', 0),
            'branch': record.get('department', ''),
            'current_company': record.get('company', ''),
            'current_title': record.get('designation', ''),
            'current_city': record.get('city', ''),
            'source_tier': 2,
            'source_name': 'portal_sync',
        })

    logger.info(f"Portal sync complete: published {len(updates)} records (job: {job_id})")
    return len(updates)


if __name__ == '__main__':
    sync()
