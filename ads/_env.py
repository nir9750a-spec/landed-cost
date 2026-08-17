# -*- coding: utf-8 -*-
"""Tiny .env loader — keeps secrets in ads/.env (gitignored), out of git and out of chat.
Nir pastes his own tokens into ads/.env; these scripts read them via os.environ. The values
never pass through the assistant."""
import os


def load(path=None):
    path = path or os.path.join(os.path.dirname(__file__), '.env')
    if not os.path.exists(path):
        return
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, _, v = line.partition('=')
            v = v.strip().strip('"').strip("'")
            if v and not v.startswith('<'):        # ignore <placeholder> values
                os.environ.setdefault(k.strip(), v)
