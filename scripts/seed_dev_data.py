"""
Development Data Seeder
Generates realistic fake alumni data with proper encryption for development.
"""

import os
import json
import hashlib
import hmac as hmac_module
import logging
import psycopg2
from datetime import datetime, timedelta
import random

try:
    from faker import Faker
except ImportError:
    print("Install faker: pip install Faker")
    exit(1)

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

DB_URL = os.environ.get('DATABASE_URL', 'postgresql://api_user:password@localhost:5432/alumni_portal')
BLIND_INDEX_KEY = os.environ.get('BLIND_INDEX_KEY', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')

fake = Faker('en_IN')

BRANCHES = [
    'Computer Science', 'Electronics and Communication', 'Mechanical Engineering',
    'Civil Engineering', 'Electrical Engineering', 'Chemical Engineering',
    'Biotechnology', 'Information Technology',
]

COMPANIES = [
    'Google', 'Microsoft', 'Amazon', 'Infosys', 'TCS', 'Wipro',
    'Adobe', 'Goldman Sachs', 'Morgan Stanley', 'Deloitte',
    'McKinsey', 'Flipkart', 'Walmart', 'Samsung', 'Apple',
]

CITIES = [
    'Bengaluru', 'Mumbai', 'Delhi', 'Hyderabad', 'Pune',
    'Chennai', 'Gurugram', 'Noida', 'Kolkata', 'Chandigarh',
]


def blind_index(value):
    key = bytes.fromhex(BLIND_INDEX_KEY)
    return hmac_module.new(key, value.lower().strip().encode(), hashlib.sha256).hexdigest()


def generate_alumni(n=200):
    """Generate n fake alumni records."""
    alumni = []
    for i in range(n):
        name = fake.name()
        batch = random.randint(2005, 2024)
        branch = random.choice(BRANCHES)
        company = random.choice(COMPANIES)
        city = random.choice(CITIES)
        email = f"{name.lower().replace(' ', '.')}@{fake.free_email_domain()}"

        emails = json.dumps([{
            'value': email,
            'rank': 1,
            'type': 'personal',
            'source_tier': random.choice([1, 2, 3]),
            'source_name': 'seed_data',
            'confidence': random.uniform(40, 95),
            'smtp_status': random.choice(['valid', 'pending', 'catch_all']),
            'added_at': datetime.now().isoformat(),
        }])

        phone = f"+91{fake.msisdn()[3:13]}"
        phones = json.dumps([{
            'value': phone,
            'rank': 1,
            'type': 'mobile',
            'source_tier': 2,
            'source_name': 'seed_data',
            'confidence': 70,
            'added_at': datetime.now().isoformat(),
        }])

        completeness = random.uniform(30, 95)

        alumni.append({
            'full_name': name,
            'full_name_blind': blind_index(name),
            'enrollment_no': f"{batch % 100}{random.randint(100000, 999999)}",
            'batch_year': batch,
            'branch': branch,
            'degree': random.choice(['B.E.', 'B.Tech', 'M.Tech', 'MBA']),
            'emails': emails,
            'phones': phones,
            'current_company': company,
            'current_title': fake.job(),
            'industry': fake.bs().title(),
            'linkedin_url': f"https://linkedin.com/in/{name.lower().replace(' ', '-')}",
            'current_city': city,
            'data_completeness': round(completeness, 2),
            'overall_confidence': round(random.uniform(40, 90), 2),
            'is_verified': random.choice([True, False]),
            'tags': '{' + ','.join(random.sample(['alumni', 'mentor', 'donor', 'speaker', 'recruiter'], 2)) + '}',
        })

    return alumni


def seed(n=200):
    logger.info(f"Seeding {n} alumni records...")

    conn = psycopg2.connect(DB_URL)
    alumni = generate_alumni(n)

    try:
        with conn.cursor() as cur:
            for a in alumni:
                cur.execute("""
                    INSERT INTO alumni (full_name, full_name_blind, enrollment_no, batch_year, branch, degree,
                                       emails, phones, current_company, current_title, industry, linkedin_url,
                                       current_city, data_completeness, overall_confidence, is_verified, tags)
                    VALUES (%(full_name)s, %(full_name_blind)s, %(enrollment_no)s, %(batch_year)s, %(branch)s,
                            %(degree)s, %(emails)s, %(phones)s, %(current_company)s, %(current_title)s,
                            %(industry)s, %(linkedin_url)s, %(current_city)s, %(data_completeness)s,
                            %(overall_confidence)s, %(is_verified)s, %(tags)s)
                """, a)

            # Seed a default super_admin user
            import bcrypt
            password_hash = bcrypt.hashpw('Admin@123'.encode(), bcrypt.gensalt()).decode()
            cur.execute("""
                INSERT INTO users (email, password_hash, role, name)
                VALUES ('admin@thapar.edu', %s, 'super_admin', 'System Admin')
                ON CONFLICT (email) DO NOTHING
            """, (password_hash,))

        conn.commit()
        logger.info(f"Seeded {n} alumni records and admin user successfully")
    except Exception as e:
        conn.rollback()
        logger.error(f"Seeding failed: {e}")
    finally:
        conn.close()


if __name__ == '__main__':
    import sys
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    seed(count)
