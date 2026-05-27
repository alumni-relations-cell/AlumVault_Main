"""
Google Sheets to Database Migration Script
Reads alumni data from a Google Sheet and imports it into the database.
"""

import os
import json
import logging
import psycopg2

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

DB_URL = os.environ.get('DATABASE_URL', 'postgresql://api_user:password@localhost:5432/alumni_portal')


def get_sheet_data(spreadsheet_id, range_name='Sheet1!A:Z'):
    """
    Fetch data from Google Sheets API.
    Requires GOOGLE_APPLICATION_CREDENTIALS env var set to service account key path.
    """
    try:
        from googleapiclient.discovery import build
        from google.oauth2 import service_account

        creds_path = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS', '')
        if not creds_path:
            logger.error("GOOGLE_APPLICATION_CREDENTIALS not set")
            return []

        creds = service_account.Credentials.from_service_account_file(
            creds_path, scopes=['https://www.googleapis.com/auth/spreadsheets.readonly']
        )

        service = build('sheets', 'v4', credentials=creds)
        sheet = service.spreadsheets()

        result = sheet.values().get(spreadsheetId=spreadsheet_id, range=range_name).execute()
        values = result.get('values', [])

        if not values:
            logger.warning("No data found in sheet")
            return []

        # First row is header
        headers = [h.strip().lower() for h in values[0]]
        rows = []
        for row in values[1:]:
            record = {}
            for i, val in enumerate(row):
                if i < len(headers):
                    record[headers[i]] = val.strip()
            rows.append(record)

        logger.info(f"Read {len(rows)} rows from Google Sheet")
        return rows

    except ImportError:
        logger.error("Install google-api-python-client: pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib")
        return []
    except Exception as e:
        logger.error(f"Failed to read Google Sheet: {e}")
        return []


def migrate(spreadsheet_id, source_tier=5, source_name='google_sheet'):
    """
    Migrate data from a Google Sheet to the alumni database.
    """
    rows = get_sheet_data(spreadsheet_id)
    if not rows:
        return 0

    conn = psycopg2.connect(DB_URL)
    imported = 0

    try:
        # Create import job
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO import_jobs (source_type, source_tier, source_name, status, total_rows)
                VALUES ('google_sheet', %s, %s, 'processing', %s)
                RETURNING id
            """, (source_tier, source_name, len(rows)))
            job_id = str(cur.fetchone()[0])

            # Column mapping (adjust based on your sheet headers)
            field_mapping = {
                'name': 'full_name', 'full_name': 'full_name', 'student name': 'full_name',
                'roll no': 'enrollment_no', 'enrollment': 'enrollment_no', 'roll number': 'enrollment_no',
                'batch': 'batch_year', 'year': 'batch_year', 'graduation year': 'batch_year',
                'branch': 'branch', 'department': 'branch', 'stream': 'branch',
                'degree': 'degree', 'program': 'degree',
                'email': 'email', 'email id': 'email', 'personal email': 'email',
                'phone': 'phone', 'mobile': 'phone', 'contact': 'phone',
                'company': 'current_company', 'current company': 'current_company', 'organization': 'current_company',
                'designation': 'current_title', 'title': 'current_title', 'position': 'current_title',
                'city': 'current_city', 'location': 'current_city',
                'linkedin': 'linkedin_url', 'linkedin url': 'linkedin_url',
            }

            for row in rows:
                mapped = {}
                for sheet_col, value in row.items():
                    system_field = field_mapping.get(sheet_col.lower(), sheet_col.lower())
                    mapped[system_field] = value

                name = mapped.get('full_name', '')
                if not name:
                    continue

                batch_year = None
                try:
                    batch_year = int(mapped.get('batch_year', 0))
                except ValueError:
                    pass

                emails = json.dumps([{
                    'value': mapped.get('email', ''),
                    'rank': 1, 'type': 'personal',
                    'source_tier': source_tier, 'source_name': source_name,
                    'confidence': 40, 'smtp_status': 'pending',
                }]) if mapped.get('email') else '[]'

                cur.execute("""
                    INSERT INTO alumni (full_name, enrollment_no, batch_year, branch, degree,
                                       emails, current_company, current_title, linkedin_url, current_city)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    name, mapped.get('enrollment_no'), batch_year,
                    mapped.get('branch'), mapped.get('degree'),
                    emails, mapped.get('current_company'), mapped.get('current_title'),
                    mapped.get('linkedin_url'), mapped.get('current_city'),
                ))
                imported += 1

            # Update job
            cur.execute("""
                UPDATE import_jobs SET status = 'completed', processed_rows = %s,
                       new_count = %s, completed_at = NOW()
                WHERE id = %s
            """, (imported, imported, job_id))

        conn.commit()
        logger.info(f"Migrated {imported} records from Google Sheet (job: {job_id})")
    except Exception as e:
        conn.rollback()
        logger.error(f"Migration failed: {e}")
    finally:
        conn.close()

    return imported


if __name__ == '__main__':
    import sys
    if len(sys.argv) < 2:
        print("Usage: python migrate_sheet.py <SPREADSHEET_ID> [TIER] [SOURCE_NAME]")
        exit(1)

    sheet_id = sys.argv[1]
    tier = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    name = sys.argv[3] if len(sys.argv) > 3 else 'google_sheet'
    migrate(sheet_id, tier, name)
