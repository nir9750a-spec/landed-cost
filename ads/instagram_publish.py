# -*- coding: utf-8 -*-
"""
4Elements — פרסום אוטומטי לאינסטגרם דרך Meta Graph API (חינם, ללא העלאת קובץ ידנית).
מפרסם Reel או תמונה מכתובת URL ציבורית.

הגדרה חד-פעמית: קובץ ig_config.json ליד הסקריפט:
{
  "ig_user_id": "1784xxxxxxxxx",      # מזהה חשבון האינסטגרם העסקי
  "access_token": "EAAG...."           # טוקן ארוך-טווח / System User (לא פג)
}

שימוש:
  python instagram_publish.py reel  "https://.../smoker_reel_beach.mp4"  "כיתוב..."
  python instagram_publish.py image "https://.../ad.jpg"                 "כיתוב..."
  python instagram_publish.py whoami        # לאמת חיבור ולשלוף ig_user_id
"""
import sys, time, json, os
import urllib.request, urllib.parse

GRAPH = "https://graph.facebook.com/v21.0"
CFG = os.path.join(os.path.dirname(__file__), "ig_config.json")


def _post(path, data):
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(f"{GRAPH}/{path}", data=body, method="POST")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())


def _get(path, params):
    q = urllib.parse.urlencode(params)
    with urllib.request.urlopen(f"{GRAPH}/{path}?{q}") as r:
        return json.loads(r.read().decode())


def load_cfg():
    with open(CFG, encoding="utf-8") as f:
        return json.load(f)


def whoami(token):
    # find the IG business account id linked to the user's pages
    pages = _get("me/accounts", {"access_token": token, "fields": "name,instagram_business_account"})
    print(json.dumps(pages, ensure_ascii=False, indent=2))
    return pages


def publish_reel(ig, token, video_url, caption, cover_url=None):
    params = {"media_type": "REELS", "video_url": video_url,
              "caption": caption, "access_token": token,
              "share_to_feed": "true"}
    if cover_url:
        params["cover_url"] = cover_url
    r = _post(f"{ig}/media", params)
    if "id" not in r:
        raise SystemExit(f"container error: {r}")
    cid = r["id"]
    # poll until the video finishes processing
    for _ in range(60):
        s = _get(cid, {"fields": "status_code", "access_token": token})
        st = s.get("status_code")
        print("status:", st)
        if st == "FINISHED":
            break
        if st == "ERROR":
            raise SystemExit(f"processing error: {s}")
        time.sleep(6)
    else:
        raise SystemExit("timeout waiting for processing")
    out = _post(f"{ig}/media_publish", {"creation_id": cid, "access_token": token})
    print("PUBLISHED:", out)
    return out


def publish_image(ig, token, image_url, caption):
    r = _post(f"{ig}/media", {"image_url": image_url, "caption": caption, "access_token": token})
    if "id" not in r:
        raise SystemExit(f"container error: {r}")
    out = _post(f"{ig}/media_publish", {"creation_id": r["id"], "access_token": token})
    print("PUBLISHED:", out)
    return out


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__); raise SystemExit(1)
    cmd = sys.argv[1]
    cfg = load_cfg()
    tok = cfg["access_token"]
    if cmd == "whoami":
        whoami(tok)
    elif cmd == "reel":
        publish_reel(cfg["ig_user_id"], tok, sys.argv[2], sys.argv[3])
    elif cmd == "image":
        publish_image(cfg["ig_user_id"], tok, sys.argv[2], sys.argv[3])
    else:
        print("unknown command"); raise SystemExit(1)
