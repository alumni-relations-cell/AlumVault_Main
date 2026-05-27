"""
Apollo.io Enrichment Pipeline
Queries the Apollo API for alumni professional data and publishes enriched records.
"""

import os
import json
import time
import logging
import requests
import psycopg2

from publisher import publish_event

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

DB_URL = os.environ.get('DATABASE_URL', 'postgresql://api_user:password@localhost:5432/alumni_portal')
APOLLO_API_KEY = os.environ.get('APOLLO_API_KEY', '')
APOLLO_BASE_URL = 'https://api.apollo.io/v1'

# Rate limit: 5 requests per second (Apollo free tier)
RATE_LIMIT_DELAY = 0.25


def get_db_connection():
    return psycopg2.connect(DB_URL)


def search_person(name, company=None, domain=None):
    """
    Search for a person using Apollo's people/search endpoint.
    """
    if not APOLLO_API_KEY:
        logger.warning("APOLLO_API_KEY not set, skipping API call")
        return None

    headers = {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
    }

    payload = {
        'api_key': APOLLO_API_KEY,
        'q_person_name': name,
        'page': 1,
        'per_page': 5,
    }

    if company:
        payload['q_organization_name'] = company
    if domain:
        payload['q_organization_domains'] = domain

    try:
        response = requests.post(
            f'{APOLLO_BASE_URL}/mixed_people/search',
            headers=headers,
            json=payload,
            timeout=15
        )

        if response.status_code == 200:
            data = response.json()
            people = data.get('people', [])
            return people[0] if people else None
        elif response.status_code == 429:
            logger.warning("Apollo rate limit hit, waiting 60s...")
            time.sleep(60)
            return None
        else:
            logger.error(f"Apollo API error: {response.status_code} — {response.text[:200]}")
            return None
    except requests.RequestException as e:
        logger.error(f"Apollo API request failed: {e}")
        return None


def enrich_person(person_id):
    """
    Get detailed person data from Apollo by person ID.
    """
    if not APOLLO_API_KEY:
        return None

    try:
        response = requests.get(
            f'{APOLLO_BASE_URL}/people/{person_id}',
            params={'api_key': APOLLO_API_KEY},
            timeout=15
        )

        if response.status_code == 200:
            return response.json().get('person', {})
        return None
    except requests.RequestException as e:
        logger.error(f"Apollo enrich failed: {e}")
        return None


def extract_enrichment_data(apollo_person):
    """
    Extract relevant fields from Apollo response.
    """
    if not apollo_person:
        return {}

    emails = []
    if apollo_person.get('email'):
        emails.append({
            'email': apollo_person['email'],
            'type': 'work',
        })

    phones = []
    for phone in apollo_person.get('phone_numbers', []):
        phones.append({
            'number': phone.get('sanitized_number', phone.get('raw_number', '')),
            'type': phone.get('type', 'work'),
        })

    return {
        'emails': emails,
        'phones': phones,
        'company': apollo_person.get('organization', {}).get('name', ''),
        'title': apollo_person.get('title', ''),
        'industry': apollo_person.get('organization', {}).get('industry', ''),
        'linkedin_url': apollo_person.get('linkedin_url', ''),
        'city': apollo_person.get('city', ''),
        'country': apollo_person.get('country', ''),
    }


def run_enrichment(batch_size=50):
    """
    Main enrichment loop:
    1. Query alumni with low completeness who haven't been enriched recently
    2. Search Apollo for each
    3. Publish enriched data to RabbitMQ
    """
    logger.info(f"Starting Apollo enrichment (batch_size={batch_size})")

    conn = get_db_connection()
    enriched_count = 0
    skipped_count = 0

    try:
        with conn.cursor() as cur:
            # Get alumni that need enrichment
            cur.execute("""
                SELECT id, full_name, current_company, batch_year, branch
                FROM alumni
                WHERE data_completeness < 70
                  AND (last_verified_at IS NULL OR last_verified_at < NOW() - INTERVAL '30 days')
                ORDER BY data_completeness ASC
                LIMIT %s
            """, (batch_size,))

            rows = cur.fetchall()
            logger.info(f"Found {len(rows)} alumni to enrich")

            for row in rows:
                alumni_id, name, company, batch_year, branch = row

                # Search Apollo
                apollo_person = search_person(name, company)
                time.sleep(RATE_LIMIT_DELAY)  # Rate limiting

                if not apollo_person:
                    skipped_count += 1
                    continue

                # Extract enrichment data
                enrichment = extract_enrichment_data(apollo_person)

                if not enrichment.get('emails') and not enrichment.get('company'):
                    skipped_count += 1
                    continue

                # Publish to RabbitMQ for matcher/merger
                publish_event('import.enriched', {
                    'alumni_id': str(alumni_id),
                    'linkedin_url': enrichment.get('linkedin_url', ''),
                    'apollo_data': enrichment,
                    'source_tier': 3,  # Manually mined tier
                    'source_import_id': f'apollo_enrichment_{int(time.time())}',
                })

                enriched_count += 1
                logger.info(f"Enriched: {name} → {enrichment.get('company', 'N/A')}")

    finally:
        conn.close()

    logger.info(f"Apollo enrichment complete: {enriched_count} enriched, {skipped_count} skipped")
    return enriched_count


if __name__ == '__main__':
    run_enrichment()
