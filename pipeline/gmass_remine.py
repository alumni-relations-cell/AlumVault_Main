"""
GMass Re-mine Pipeline
Queries alumni with invalid SMTP status emails and re-mines them through GMass API.
"""

import os
import json
import time
import logging
import psycopg2
import requests

from publisher import publish_event

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

DB_URL = os.environ.get('DATABASE_URL', 'postgresql://api_user:password@localhost:5432/alumni_portal')
GMASS_API_KEY = os.environ.get('GMASS_API_KEY', '')
GMASS_API_URL = 'https://api.gmass.co/api'


def get_db_connection():
    return psycopg2.connect(DB_URL)


def find_invalid_emails(batch_size=100):
    """
    Find alumni with emails marked as 'invalid' by SMTP verification.
    These are candidates for GMass re-mining (finding alternative emails).
    """
    conn = get_db_connection()
    results = []

    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT a.id, a.full_name, a.current_company, a.batch_year, a.branch,
                       elem->>'value' as email, (elem->>'confidence')::float as confidence
                FROM alumni a,
                     jsonb_array_elements(a.emails) elem
                WHERE elem->>'smtp_status' = 'invalid'
                  AND (elem->>'confidence')::float < 30
                ORDER BY a.updated_at ASC
                LIMIT %s
            """, (batch_size,))

            for row in cur.fetchall():
                results.append({
                    'alumni_id': str(row[0]),
                    'name': row[1],
                    'company': row[2],
                    'batch_year': row[3],
                    'branch': row[4],
                    'invalid_email': row[5],
                    'confidence': row[6],
                })
    finally:
        conn.close()

    return results


def remine_via_gmass(name, company):
    """
    Use GMass API to find alternative email addresses.
    """
    if not GMASS_API_KEY:
        logger.warning("GMASS_API_KEY not set, skipping re-mine")
        return []

    try:
        response = requests.get(
            f'{GMASS_API_URL}/email',
            params={
                'apikey': GMASS_API_KEY,
                'name': name,
                'domain': company.lower().replace(' ', '') + '.com' if company else '',
            },
            timeout=15,
        )

        if response.status_code == 200:
            data = response.json()
            emails = data.get('emailAddresses', [])
            logger.info(f"GMass found {len(emails)} emails for {name}")
            return emails
        else:
            logger.error(f"GMass API error: {response.status_code}")
            return []
    except requests.RequestException as e:
        logger.error(f"GMass API request failed: {e}")
        return []


def run_remine(batch_size=50):
    """
    Main re-mine loop:
    1. Find alumni with invalid emails
    2. Query GMass for alternatives
    3. Publish new emails for verification
    """
    logger.info(f"Starting GMass re-mine (batch_size={batch_size})")

    invalid_records = find_invalid_emails(batch_size)
    logger.info(f"Found {len(invalid_records)} records with invalid emails")

    remined_count = 0

    for record in invalid_records:
        new_emails = remine_via_gmass(record['name'], record['company'])

        for email_info in new_emails:
            email = email_info if isinstance(email_info, str) else email_info.get('email', '')
            if not email or email == record['invalid_email']:
                continue

            # Publish new email for SMTP verification
            publish_event('verify.email', {
                'alumni_id': record['alumni_id'],
                'email': email,
                'current_confidence': 40,  # GMass discovery = tier 4 confidence
                'source': 'gmass_remine',
            })

            remined_count += 1
            logger.info(f"Re-mined: {record['name']} → {email}")

        # Rate limiting
        time.sleep(1)

    logger.info(f"GMass re-mine complete: {remined_count} new emails found")
    return remined_count


if __name__ == '__main__':
    run_remine()
