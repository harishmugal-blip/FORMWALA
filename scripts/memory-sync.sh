#!/bin/bash
# ============================================================
# CSC MEMORY SYNC — sara plan auto-save karta rahega
# MEMORY.md + worklog.md + DB snapshot -> download/csc-memory/
# Cron har 30 min chalata he. Log: logs/memory-sync.log
# ============================================================
BASE=/home/z/my-project
DEST=$BASE/download/csc-memory
LOG=$BASE/logs/memory-sync.log
KEEP=20          # kitne timestamped snapshots rakhne he
DBKEEP=5         # kitne db snapshots rakhne he
TS=$(date +%Y%m%d-%H%M%S)

mkdir -p "$DEST/latest" "$DEST/snapshots" "$DEST/db" "$BASE/logs"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"; }

# 1) Memory + worklog latest copy (har baar overwrite — hamesha fresh)
cp -f "$BASE/MEMORY.md"   "$DEST/latest/MEMORY.md"   2>/dev/null
cp -f "$BASE/worklog.md"  "$DEST/latest/worklog.md"  2>/dev/null

# 2) Timestamped snapshot (sirf tab jab MEMORY.md ya worklog me CHANGE ho)
SUM=$(md5sum "$BASE/MEMORY.md" "$BASE/worklog.md" 2>/dev/null | md5sum | cut -d' ' -f1)
LASTSUM=$(cat "$DEST/.lastsum" 2>/dev/null)
if [ "$SUM" != "$LASTSUM" ]; then
  mkdir -p "$DEST/snapshots/$TS"
  cp -f "$BASE/MEMORY.md"  "$DEST/snapshots/$TS/" 2>/dev/null
  cp -f "$BASE/worklog.md" "$DEST/snapshots/$TS/" 2>/dev/null
  echo "$SUM" > "$DEST/.lastsum"
  log "CHANGE detected -> snapshot $TS saved"
  # Purane snapshots hatao (sabse naye KEEP rakhna)
  ls -1dt "$DEST/snapshots/"*/ 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -rf
else
  log "no change"
fi

# 3) DB snapshot (roz ek baar — filename me date)
DBDAY=$(date +%Y%m%d)
if [ ! -f "$DEST/db/custom-$DBDAY.db" ]; then
  cp -f "$BASE/db/custom.db" "$DEST/db/custom-$DBDAY.db" 2>/dev/null && \
    log "db snapshot custom-$DBDAY.db saved"
  ls -1t "$DEST/db/"custom-*.db 2>/dev/null | tail -n +$((DBKEEP+1)) | xargs -r rm -f
fi

# 4) Services status bhi memory me save (troubleshooting ke liye)
{
  echo "# SERVICES STATUS @ $TS"
  echo "n8n:      $(curl -s -o /dev/null -w '%{http_code}' http://localhost:5678/health 2>/dev/null)"
  echo "agent:    $(curl -s -o /dev/null -w '%{http_code}' http://localhost:8090/health 2>/dev/null)"
  echo "bridge:   $(curl -s http://localhost:8080/status 2>/dev/null | head -c 200)"
  echo "portal:   $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 2>/dev/null)"
} > "$DEST/latest/services-status.txt" 2>/dev/null

log "sync done (latest + status updated)"
