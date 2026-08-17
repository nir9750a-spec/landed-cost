# -*- coding: utf-8 -*-
"""Wait for Google Drive for Desktop (G:) to mount, then copy ALL marketing work
(docs + ad images) into the central Drive folder 'שיווק ופרסום 4Elements'."""
import os, time, glob, shutil

roots = [
    r"G:\האחסון שלי\עריכה לקטלוג\קטלוג 4Elements - חבילת עריכה\שיווק ופרסום 4Elements",
    r"G:\My Drive\עריכה לקטלוג\קטלוג 4Elements - חבילת עריכה\שיווק ופרסום 4Elements",
]
ADS = r"C:\Users\Admin\landed-cost\ads"
docs = [os.path.join(ADS, f) for f in
        ("TOCHNIT-SHIVUK-4ELEMENTS.md", "CHIBURIM-SETUP.md", "_calendar_table.md")]
imgs = glob.glob(os.path.join(ADS, "workspace", "final-ads", "recliner_*.jpg")) + \
       glob.glob(os.path.join(ADS, "workspace", "final-ads", "recliner_*.md"))

def copy_into(root):
    dsub = os.path.join(root, "תוכניות ומסמכים")
    asub = os.path.join(root, "מודעות", "כיסא רקליינר YF-YZ-06B")
    os.makedirs(dsub, exist_ok=True); os.makedirs(asub, exist_ok=True)
    n = 0
    for f in docs:
        if os.path.exists(f):
            try: shutil.copy(f, dsub); n += 1
            except Exception: pass
    for f in imgs:
        try: shutil.copy(f, asub); n += 1
        except Exception: pass
    return n

for _ in range(160):  # ~40 minutes
    for root in roots:
        if os.path.isdir(root):
            n = copy_into(root)
            print("COPIED %d files into central Drive folder" % n)
            raise SystemExit(0)
    time.sleep(15)
print("TIMEOUT: central Drive folder not found (Drive for Desktop not started?)")
