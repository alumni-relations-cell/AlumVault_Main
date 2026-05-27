"""
Bulk Normalizer
Normalizes all existing alumni records: phone numbers, email addresses, names.
"""

import os
import re
import json
import logging
import psycopg2

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

DB_URL = os.environ.get('DATABASE_URL', 'postgresql://api_user:password@localhost:5432/alumni_portal')


def normalize_phone(raw):
    if not raw:
        return raw
    cleaned = re.sub(r'[^\d+]', '', raw)
    if cleaned.startswith('+91') and len(cleaned) == 13:
        return cleaned
    elif cleaned.startswith('91') and len(cleaned) == 12:
        return '+' + cleaned
    elif cleaned.startswith('0') and len(cleaned) == 11:
        return '+91' + cleaned[1:]
    elif len(cleaned) == 10:
        return '+91' + cleaned
    return cleaned


def normalize_name(raw):
    if not raw:
        return raw
    return ' '.join(word.capitalize() for word in raw.strip().split())


def normalize_email(raw):
    if not raw:
        return raw
    return raw.strip().lower()


def bulk_normalize(batch_size=500):
    logger.info("Starting bulk normalization...")

    conn = psycopg2.connect(DB_URL)
    updated = 0

    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, full_name, emails, phones FROM alumni LIMIT %s", (batch_size,))
            rows = cur.fetchall()

            for row in rows:
                alumni_id, name, emails_json, phones_json = row
                changes = {}

                # Normalize name
                normalized_name = normalize_name(name)
                if normalized_name != name:
                    changes['full_name'] = normalized_name

                # Normalize emails
                emails = json.loads(emails_json) if isinstance(emails_json, str) else (emails_json or [])
                email_changed = False
                for e in emails:
                    if e.get('value'):
                        norm = normalize_email(e['value'])
                        if norm != e['value']:
                            e['value'] = norm
                            email_changed = True
                if email_changed:
                    changes['emails'] = json.dumps(emails)

                # Normalize phones
                phones = json.loads(phones_json) if isinstance(phones_json, str) else (phones_json or [])
                phone_changed = False
                for p in phones:
                    if p.get('value'):
                        norm = normalize_phone(p['value'])
                        if norm != p['value']:
                            p['value'] = norm
                            phone_changed = True
                if phone_changed:
                    changes['phones'] = json.dumps(phones)

                if changes:
                    sets = ', '.join(f"{k} = %s" for k in changes)
                    values = list(changes.values()) + [alumni_id]
                    cur.execute(f"UPDATE alumni SET {sets} WHERE id = %s", values)
                    updated += 1

        conn.commit()
        logger.info(f"Normalized {updated} records")
    except Exception as e:
        conn.rollback()
        logger.error(f"Normalization failed: {e}")
    finally:
        conn.close()

    return updated


if __name__ == '__main__':
    bulk_normalize()
