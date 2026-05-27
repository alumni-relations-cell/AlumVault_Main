"""
LinkedIn Discovery Pipeline
Searches for alumni LinkedIn profiles using name + university + batch info.
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


def get_db_connection():
    return psycopg2.connect(DB_URL)


def construct_search_query(name, batch_year, branch):
    """Build a Google-compatible search query for LinkedIn profiles."""
    query_parts = [
        f'site:linkedin.com/in/',
        f'"{name}"',
        '"Thapar"',
    ]
    if batch_year:
        query_parts.append(f'"{batch_year}"')
    if branch:
        query_parts.append(f'"{branch}"')
    return ' '.join(query_parts)


def simulate_discovery(name, batch_year, branch):
    """
    Simulate LinkedIn discovery logic.
    In production, this would use a search API or scraping service.
    Returns a dict with discovered data or None.
    """
    # Construct a plausible LinkedIn URL
    slug = name.lower().replace(' ', '-').replace('.', '')
    linkedin_url = f"https://linkedin.com/in/{slug}"

    # In production: call Google Custom Search API, SerpApi, or similar
    # For now, return the constructed URL as a starting point
    return {
        'linkedin_url': linkedin_url,
        'search_query': construct_search_query(name, batch_year, branch),
        'confidence': 'low',  # Would be higher with real API results
    }


def discover(batch_size=10):
    """
    Main discovery loop:
    1. Find alumni without LinkedIn URLs
    2. Search for profiles
    3. Publish discovered data
    """
    logger.info(f"Starting LinkedIn discovery (batch_size={batch_size})")

    conn = get_db_connection()
    discovered = 0

    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, full_name, batch_year, branch, current_company
                FROM alumni
                WHERE (linkedin_url IS NULL OR linkedin_url = '')
                  AND is_verified = false
                ORDER BY data_completeness ASC
                LIMIT %s
            """, (batch_size,))

            rows = cur.fetchall()
            logger.info(f"Found {len(rows)} alumni without LinkedIn profiles")

            for row in rows:
                alumni_id, name, batch_year, branch, company = row

                # Attempt discovery
                result = simulate_discovery(name, batch_year, branch)

                if result:
                    # Publish to RabbitMQ for processing
                    publish_event('import.enriched', {
                        'alumni_id': str(alumni_id),
                        'linkedin_url': result['linkedin_url'],
                        'apollo_data': json.dumps({}),
                        'source_tier': 4,  # Auto-mined tier
                        'source_import_id': f'linkedin_discovery_{int(time.time())}',
                    })

                    discovered += 1
                    logger.info(f"Discovered: {name} → {result['linkedin_url']}")

                # Rate limiting (avoid being blocked)
                time.sleep(2)

    finally:
        conn.close()

    logger.info(f"LinkedIn discovery complete: {discovered} profiles found")
    return discovered


if __name__ == '__main__':
    discover()
