"""
Export Analytics Report
Generates aggregate reports on alumni data quality and coverage.
"""

import os
import json
import logging
import psycopg2
from datetime import datetime

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

DB_URL = os.environ.get('DATABASE_URL', 'postgresql://api_user:password@localhost:5432/alumni_portal')


def export_analytics(output_path=None):
    conn = psycopg2.connect(DB_URL)

    try:
        with conn.cursor() as cur:
            # Overall stats
            cur.execute("""
                SELECT
                    COUNT(*) as total_alumni,
                    COUNT(*) FILTER (WHERE is_verified) as verified,
                    AVG(data_completeness)::numeric(5,2) as avg_completeness,
                    AVG(overall_confidence)::numeric(5,2) as avg_confidence,
                    COUNT(DISTINCT batch_year) as batch_years,
                    COUNT(DISTINCT branch) as branches,
                    MIN(batch_year) as earliest_batch,
                    MAX(batch_year) as latest_batch
                FROM alumni
            """)
            overall = dict(zip(
                ['total_alumni', 'verified', 'avg_completeness', 'avg_confidence',
                 'batch_years', 'branches', 'earliest_batch', 'latest_batch'],
                cur.fetchone()
            ))

            # By batch year
            cur.execute("""
                SELECT batch_year, COUNT(*) as count,
                       AVG(data_completeness)::numeric(5,2) as avg_completeness
                FROM alumni
                WHERE batch_year IS NOT NULL
                GROUP BY batch_year ORDER BY batch_year DESC
            """)
            by_batch = [{'batch_year': r[0], 'count': r[1], 'avg_completeness': float(r[2] or 0)} for r in cur.fetchall()]

            # By branch
            cur.execute("""
                SELECT branch, COUNT(*) as count
                FROM alumni WHERE branch IS NOT NULL
                GROUP BY branch ORDER BY count DESC
            """)
            by_branch = [{'branch': r[0], 'count': r[1]} for r in cur.fetchall()]

            # Import job stats
            cur.execute("""
                SELECT source_name, COUNT(*) as jobs,
                       SUM(total_rows) as total_rows,
                       SUM(merged_count) as merged,
                       SUM(new_count) as new_records
                FROM import_jobs
                GROUP BY source_name ORDER BY jobs DESC
            """)
            import_stats = [{'source': r[0], 'jobs': r[1], 'total_rows': r[2], 'merged': r[3], 'new': r[4]} for r in cur.fetchall()]

            # Email quality
            cur.execute("""
                SELECT
                    COUNT(*) FILTER (WHERE jsonb_array_length(emails) > 0) as has_email,
                    COUNT(*) FILTER (WHERE jsonb_array_length(phones) > 0) as has_phone,
                    COUNT(*) FILTER (WHERE linkedin_url IS NOT NULL AND linkedin_url != '') as has_linkedin
                FROM alumni
            """)
            quality = dict(zip(['has_email', 'has_phone', 'has_linkedin'], cur.fetchone()))

        report = {
            'generated_at': datetime.now().isoformat(),
            'overall': overall,
            'by_batch_year': by_batch,
            'by_branch': by_branch,
            'import_jobs': import_stats,
            'data_quality': quality,
        }

        # Convert Decimal to float for JSON serialization
        for key in ['avg_completeness', 'avg_confidence']:
            if overall.get(key):
                overall[key] = float(overall[key])

        if output_path:
            with open(output_path, 'w') as f:
                json.dump(report, f, indent=2, default=str)
            logger.info(f"Report exported to {output_path}")
        else:
            print(json.dumps(report, indent=2, default=str))

        return report

    finally:
        conn.close()


if __name__ == '__main__':
    import sys
    output = sys.argv[1] if len(sys.argv) > 1 else None
    export_analytics(output)
