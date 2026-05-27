"""
Bounce Handler Pipeline
Processes email bounce data: demotes bounced emails and promotes alternates.
"""

import os
import json
import logging
import psycopg2

from publisher import publish_event

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

DB_URL = os.environ.get('DATABASE_URL', 'postgresql://api_user:password@localhost:5432/alumni_portal')


def get_db_connection():
    return psycopg2.connect(DB_URL)


def process_bounce(alumni_id, email, bounce_type, reason):
    """
    Process a single bounce event:
    1. Demote the bounced email (reduce confidence, mark as invalid)
    2. Re-rank remaining emails
    3. Check for alternate emails in alumni_alternates
    """
    conn = get_db_connection()

    try:
        with conn.cursor() as cur:
            # 1. Get current emails
            cur.execute("SELECT emails FROM alumni WHERE id = %s", (alumni_id,))
            result = cur.fetchone()
            if not result:
                logger.warning(f"Alumni {alumni_id} not found")
                return

            emails = json.loads(result[0]) if isinstance(result[0], str) else result[0]

            # 2. Demote the bounced email
            for i, e in enumerate(emails):
                if e.get('value') == email:
                    if bounce_type == 'hard':
                        emails[i]['smtp_status'] = 'invalid'
                        emails[i]['confidence'] = max(0, e.get('confidence', 50) - 40)
                    elif bounce_type == 'soft':
                        emails[i]['confidence'] = max(0, e.get('confidence', 50) - 15)

                    emails[i]['bounce_reason'] = reason
                    break

            # 3. Re-rank by confidence (highest first)
            emails.sort(key=lambda x: x.get('confidence', 0), reverse=True)
            for i, e in enumerate(emails):
                emails[i]['rank'] = i + 1

            # 4. Update the alumni record
            cur.execute(
                "UPDATE alumni SET emails = %s, updated_at = NOW() WHERE id = %s",
                (json.dumps(emails), alumni_id)
            )

            # 5. Check for alternates to promote
            cur.execute("""
                SELECT id, value_encrypted, source_tier, source_name, confidence
                FROM alumni_alternates
                WHERE alumni_id = %s AND field_name = 'email'
                ORDER BY confidence DESC
                LIMIT 1
            """, (alumni_id,))

            alternate = cur.fetchone()
            if alternate:
                alt_id, alt_value, alt_tier, alt_source, alt_confidence = alternate
                logger.info(f"Promoting alternate email for {alumni_id}")

                # Add alternate to main emails list
                new_entry = {
                    'value': alt_value,
                    'rank': len(emails) + 1,
                    'type': 'work',
                    'source_tier': alt_tier,
                    'source_name': alt_source or 'alternate_promotion',
                    'confidence': alt_confidence or 40,
                    'smtp_status': 'pending',
                }
                emails.append(new_entry)

                cur.execute(
                    "UPDATE alumni SET emails = %s WHERE id = %s",
                    (json.dumps(emails), alumni_id)
                )

                # Remove promoted alternate
                cur.execute(
                    "DELETE FROM alumni_alternates WHERE id = %s",
                    (alt_id,)
                )

                # Queue for SMTP verification
                publish_event('verify.email', {
                    'alumni_id': alumni_id,
                    'email': alt_value,
                    'current_confidence': alt_confidence or 40,
                })

            conn.commit()
            logger.info(f"Bounce processed: {alumni_id} / {email} ({bounce_type})")

    except Exception as e:
        conn.rollback()
        logger.error(f"Error processing bounce: {e}")
    finally:
        conn.close()


def handle_bounces(batch_size=100):
    """
    Process bounce records from the campaign_recipients table.
    """
    logger.info("Starting bounce handler...")

    conn = get_db_connection()
    processed = 0

    try:
        with conn.cursor() as cur:
            # Get unprocessed bounces
            cur.execute("""
                SELECT cr.alumni_id, cr.email_used, cr.bounce_reason, c.type
                FROM campaign_recipients cr
                JOIN campaigns c ON cr.campaign_id = c.id
                WHERE cr.status = 'bounced' AND cr.bounced_at > NOW() - INTERVAL '24 hours'
                LIMIT %s
            """, (batch_size,))

            for row in cur.fetchall():
                alumni_id, email, reason, campaign_type = row
                bounce_type = 'hard' if 'invalid' in (reason or '').lower() else 'soft'
                process_bounce(str(alumni_id), email, bounce_type, reason)
                processed += 1

    finally:
        conn.close()

    logger.info(f"Bounce handler complete: processed {processed} bounces")
    return processed


if __name__ == '__main__':
    handle_bounces()
