"""
Generate a synthetic alumni sheet with intentional duplicates to test the importer:
- Same-LinkedIn dupes (same row repeated with messy spellings)
- Same-email dupes
- Name+batch+branch dupes (no LinkedIn)
- Branch synonyms (CSE vs Computer Science)
- Dirty inputs (extra whitespace, +91 phones, mixed-case emails, 'N/A' values)
- Unique entries
"""
from pathlib import Path
from openpyxl import Workbook

COLUMNS = [
    "full_name", "linkedin_url", "email", "email_alt", "phone", "phone_alt",
    "batch_year", "degree", "branch", "enrollment_no", "dob",
    "current_company", "current_title", "past_companies", "industry",
    "current_city", "current_country", "user_type", "tags", "notes", "source_label",
]

ROWS = [
    # 1. Rahul: clean row
    ["Rahul Sharma", "https://linkedin.com/in/rahul-sharma-1234",
     "rahul@example.com", "", "+91 98765 43210", "",
     2018, "B.Tech", "CSE", "101803123", "1996-04-15",
     "Google", "Senior SWE", "Microsoft|Amazon", "Software",
     "Bangalore", "India", "alumnus", "mentor", "Spoke at TechFest", "test_sheet_batch_2018"],

    # 2. Rahul again — same LinkedIn but messy formatting, different email
    ["  RAHUL  SHARMA ", "linkedin.com/in/Rahul-Sharma-1234/?trk=foo",
     "RAHUL.SHARMA@COMPANY.COM", "", "9876543210", "",
     2018, "B.Tech", "Computer Science", "", "",
     "Stripe", "Staff Engineer", "Google", "",
     "Bengaluru", "India", "", "donor", "", "test_sheet_campaign_list"],

    # 3. Priya — minimal row (name + LinkedIn only)
    ["Priya Verma", "https://www.linkedin.com/in/priya-verma-9876/",
     "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "test_sheet_batch_2018"],

    # 4. Priya — same person via email (no LinkedIn this time)
    ["Priya Verma", "", "priya.verma@gmail.com", "", "+91-9123456789", "",
     2019, "M.Tech", "ECE", "", "", "Microsoft", "Product Manager", "", "",
     "Hyderabad", "India", "", "", "", "test_sheet_alumni_portal"],

    # 5. Aman — unique entry, sparse data, branch synonym (Electronics → ECE)
    ["Aman Singh", "", "aman.singh@yahoo.com", "", "",
     "", 2017, "B.Tech", "Electronics", "", "",
     "Infosys", "", "", "", "Pune", "India", "", "", "", "test_sheet_batch_2017"],

    # 6. Aman duplicate — same name+batch+branch (Electronics normalizes to ECE in #5,
    #    ECE is canonical here). Should merge via fallback key.
    ["Aman Singh", "", "", "", "9988776655", "",
     2017, "B.Tech", "ECE", "", "", "TCS", "Software Engineer",
     "Infosys", "", "Pune", "India", "", "", "", "test_sheet_company_review"],

    # 7. Empty-tokens & 'N/A' values should be treated as missing
    ["Neha Kapoor", "N/A", "neha@test.com", "-", "—", "null",
     "2020", "MBA", "LMTSOM", "n/a", "",
     "Deloitte", "Consultant", "", "Consulting",
     "Mumbai", "India", "alumnus", "", "", "test_sheet_mba_2020"],

    # 8. Completely unique person
    ["Vikram Patel", "https://linkedin.com/in/vikram-patel-9999",
     "vikram@startup.io", "", "+91 9000000001", "",
     2015, "B.Tech", "ME", "101503999", "1993-07-22",
     "Tesla", "Mechanical Lead", "Bosch|Mahindra", "Automotive",
     "San Francisco", "USA", "alumnus", "startup_founder", "Founded EV startup", "test_sheet_overseas"],

    # 9. Row that should be skipped — no name
    ["", "https://linkedin.com/in/ghost-123", "ghost@nowhere.com", "", "", "",
     "", "", "", "", "", "", "", "", "", "", "", "", "", "", "test_sheet_garbage"],

    # 10. Completely empty row — should be skipped during read_sheet
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
]


def main():
    wb = Workbook()
    ws = wb.active
    ws.title = "alumni_data"
    ws.append(COLUMNS)
    for row in ROWS:
        ws.append(row)

    out = Path(__file__).parent / "test_sheet.xlsx"
    wb.save(out)
    print(f"Generated test sheet: {out}")
    print(f"  {len(ROWS)} rows total")
    print("  Expected after dedup:")
    print("    - 5 unique alumni (Rahul, Priya, Aman, Neha, Vikram)")
    print("    - 2 within-sheet merges (Rahul x2, Priya x2, Aman x2)")
    print("    - 2 rows skipped (no name / empty)")


if __name__ == "__main__":
    main()
