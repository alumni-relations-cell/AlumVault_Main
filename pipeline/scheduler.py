"""
Pipeline Scheduler
Runs all automation jobs on cron schedules using APScheduler.
"""

import os
import logging
from pathlib import Path

# Load .env from pipeline directory
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / '.env')
except ImportError:
    pass  # dotenv not installed, rely on system env vars

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.events import EVENT_JOB_EXECUTED, EVENT_JOB_ERROR

from apollo_enrichment import run_enrichment
from linkedin_discovery import discover
from portal_sync import sync
from gmass_remine import run_remine
from bounce_handler import handle_bounces

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

scheduler = BlockingScheduler(timezone='Asia/Kolkata')


def job_listener(event):
    """Log job execution results."""
    if event.exception:
        logger.error(f"Job {event.job_id} failed: {event.exception}")
    else:
        logger.info(f"Job {event.job_id} completed successfully")


# ========================
# Scheduled Jobs
# ========================

def linkedin_discovery_job():
    """2:00 AM IST — Search for alumni LinkedIn profiles."""
    logger.info("=== Running LinkedIn Discovery ===")
    try:
        count = discover(batch_size=50)
        logger.info(f"LinkedIn discovery found {count} profiles")
    except Exception as e:
        logger.error(f"LinkedIn discovery failed: {e}")


def portal_sync_job():
    """3:00 AM IST — Sync records from the alumni portal."""
    logger.info("=== Running Portal Sync ===")
    try:
        count = sync()
        logger.info(f"Portal sync processed {count} records")
    except Exception as e:
        logger.error(f"Portal sync failed: {e}")


def apollo_enrichment_job():
    """4:00 AM IST — Enrich alumni data via Apollo API."""
    logger.info("=== Running Apollo Enrichment ===")
    try:
        count = run_enrichment(batch_size=100)
        logger.info(f"Apollo enrichment processed {count} records")
    except Exception as e:
        logger.error(f"Apollo enrichment failed: {e}")


def gmass_remine_job():
    """5:00 AM IST — Re-mine invalid emails via GMass."""
    logger.info("=== Running GMass Re-mine ===")
    try:
        count = run_remine(batch_size=50)
        logger.info(f"GMass re-mine found {count} new emails")
    except Exception as e:
        logger.error(f"GMass re-mine failed: {e}")


def bounce_handler_job():
    """6:00 AM IST — Process email bounces."""
    logger.info("=== Running Bounce Handler ===")
    try:
        count = handle_bounces(batch_size=200)
        logger.info(f"Bounce handler processed {count} bounces")
    except Exception as e:
        logger.error(f"Bounce handler failed: {e}")


# ========================
# Register Jobs
# ========================

scheduler.add_job(linkedin_discovery_job, 'cron', hour=2, minute=0, id='linkedin_discovery')
scheduler.add_job(portal_sync_job, 'cron', hour=3, minute=0, id='portal_sync')
scheduler.add_job(apollo_enrichment_job, 'cron', hour=4, minute=0, id='apollo_enrichment')
scheduler.add_job(gmass_remine_job, 'cron', hour=5, minute=0, id='gmass_remine')
scheduler.add_job(bounce_handler_job, 'cron', hour=6, minute=0, id='bounce_handler')

scheduler.add_listener(job_listener, EVENT_JOB_EXECUTED | EVENT_JOB_ERROR)


if __name__ == '__main__':
    logger.info("Starting Pipeline Scheduler (IST timezone)")
    logger.info("Jobs scheduled:")
    logger.info("  02:00 — LinkedIn Discovery")
    logger.info("  03:00 — Portal Sync")
    logger.info("  04:00 — Apollo Enrichment")
    logger.info("  05:00 — GMass Re-mine")
    logger.info("  06:00 — Bounce Handler")

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Shutting down Pipeline Scheduler")
