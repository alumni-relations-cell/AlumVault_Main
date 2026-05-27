"""
Generate HMAC-SHA256 blind indexes for existing alumni records.
Backfills the full_name_blind column for records that are missing it.
"""

import os
import hmac
import hashlib
import logging
import psycopg2

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

DB_URL = os.environ.get('DATABASE_URL', 'postgresql://api_user:password@localhost:5432/alumni_portal')
BLIND_INDEX_KEY = os.environ.get('BLIND_INDEX_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')


def blind_index(value):
    key = bytes.fromhex(BLIND_INDEX_KEY)
    return hmac.new(key, value.lower().strip().encode(), hashlib.sha256).hexdigest()


def generate(batch_size=1000):
    logger.info("Starting blind index generation...")

    conn = psycopg2.connect(DB_URL)
    updated = 0

    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, full_name FROM alumni
                WHERE full_name_blind IS NULL OR full_name_blind = ''
                LIMIT %s
            """, (batch_size,))

            rows = cur.fetchall()
            logger.info(f"Found {len(rows)} records needing blind indexes")

            for row in rows:
                alumni_id, name = row
                index = blind_index(name)

                cur.execute(
                    "UPDATE alumni SET full_name_blind = %s WHERE id = %s",
                    (index, alumni_id)
                )
                updated += 1

        conn.commit()
        logger.info(f"Generated {updated} blind indexes")
    except Exception as e:
        conn.rollback()
        logger.error(f"Blind index generation failed: {e}")
    finally:
        conn.close()

    return updated


if __name__ == '__main__':
    generate()
