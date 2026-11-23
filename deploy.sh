#!/bin/sh
# Push code changes to the live site. Never touches data/ (the customer's paragraphs,
# settings and submissions live there on the server).
# Usage: ./deploy.sh
set -e
HOST=root@amazingparagraph.com
DIR=/srv/amazing-paragraph

cd "$(dirname "$0")"
node --check server.js
rsync -av --exclude .git --exclude data/ --exclude deploy.sh --exclude ops/ ./ "$HOST:$DIR/"
# the mail-delivery tracker runs as root, so it is installed root-owned straight from here (never from the site folder)
scp -q ops/mail-status.js "$HOST:/usr/local/lib/ap-mail-status.js"
ssh "$HOST" "chown root:root /usr/local/lib/ap-mail-status.js && chmod 755 /usr/local/lib/ap-mail-status.js"
ssh "$HOST" "chown -R ap:ap $DIR && systemctl restart amazing-paragraph && sleep 1 && systemctl is-active amazing-paragraph"
curl -s -o /dev/null -w "https://amazingparagraph.com → %{http_code}\n" https://amazingparagraph.com/
